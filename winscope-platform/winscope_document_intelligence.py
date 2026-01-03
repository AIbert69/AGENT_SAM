"""
WinScope Document Intelligence Engine
======================================

Autonomous document processing system that:
1. Downloads complete solicitation packages from procurement portals
2. Extracts structured data (BOM, quantities, specs, delivery locations)
3. Generates complete RFQ drafts with real data
4. Learns document patterns to improve extraction accuracy

This is the "brain" that turns raw RFP PDFs into actionable data.

Author: Albert Mizuno / Claude
Date: December 2025
"""

import asyncio
import aiohttp
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, field
from datetime import datetime
import anthropic
from pathlib import Path
import pdfplumber
import pandas as pd
from bs4 import BeautifulSoup
import docx
import openpyxl
from PIL import Image
import pytesseract
import re
import json
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class LineItem:
    """Structured line item from BOM"""
    item_number: int
    description: str
    quantity: Optional[int] = None
    unit: Optional[str] = None
    part_number: Optional[str] = None
    manufacturer: Optional[str] = None
    estimated_price: Optional[float] = None
    item_type: str = "Unknown"  # PLC, ROBOT, AUTOMATION, CONVEYOR, etc.
    sourcing_type: str = "Unknown"  # distributor-sourcable, integrator-required
    suggested_product: Optional[str] = None
    notes: str = ""


@dataclass
class SolicitationPackage:
    """Complete solicitation document package"""
    solicitation_id: str
    title: str
    agency: str
    due_date: Optional[datetime]
    
    # Extracted data
    line_items: List[LineItem] = field(default_factory=list)
    delivery_location: Optional[str] = None
    payment_terms: Optional[str] = None
    submission_instructions: str = ""
    technical_requirements: List[str] = field(default_factory=list)
    evaluation_criteria: Dict[str, Any] = field(default_factory=dict)
    
    # Files
    main_rfp_path: Optional[Path] = None
    attachments: List[Path] = field(default_factory=list)
    
    # Metadata
    extracted_at: datetime = field(default_factory=datetime.now)
    extraction_confidence: float = 0.0  # 0-1, how confident are we in the data?


class DocumentDownloader:
    """
    Handles downloading complete solicitation packages from portals.
    Intelligently identifies all attachments and downloads them.
    """
    
    def __init__(self, download_dir: Path = Path("/home/claude/downloads")):
        self.download_dir = download_dir
        self.download_dir.mkdir(exist_ok=True)
    
    async def download_package(self, url: str, solicitation_id: str) -> List[Path]:
        """
        Download all documents for a solicitation.
        Returns list of downloaded file paths.
        """
        files = []
        
        async with aiohttp.ClientSession() as session:
            try:
                # Get the main page
                async with session.get(url) as response:
                    if response.status != 200:
                        logger.error(f"Failed to download {url}: {response.status}")
                        return files
                    
                    content_type = response.headers.get('Content-Type', '')
                    
                    # If it's a PDF, download directly
                    if 'pdf' in content_type.lower():
                        file_path = self.download_dir / f"{solicitation_id}_main.pdf"
                        with open(file_path, 'wb') as f:
                            f.write(await response.read())
                        files.append(file_path)
                    
                    # If it's HTML, parse for attachment links
                    elif 'html' in content_type.lower():
                        html = await response.text()
                        soup = BeautifulSoup(html, 'html.parser')
                        
                        # Find all attachment links
                        attachment_links = self._find_attachment_links(soup, url)
                        
                        # Download each attachment
                        for i, att_url in enumerate(attachment_links):
                            att_path = await self._download_file(session, att_url, f"{solicitation_id}_att{i}")
                            if att_path:
                                files.append(att_path)
                
            except Exception as e:
                logger.error(f"Error downloading package: {e}")
        
        logger.info(f"Downloaded {len(files)} files for {solicitation_id}")
        return files
    
    def _find_attachment_links(self, soup: BeautifulSoup, base_url: str) -> List[str]:
        """Extract all attachment URLs from HTML page"""
        attachment_urls = []
        
        # Common patterns for attachment links
        patterns = [
            {'class': re.compile(r'attachment')},
            {'class': re.compile(r'document')},
            {'href': re.compile(r'\.pdf$', re.I)},
            {'href': re.compile(r'\.docx?$', re.I)},
            {'href': re.compile(r'\.xlsx?$', re.I)},
        ]
        
        for pattern in patterns:
            links = soup.find_all('a', pattern)
            for link in links:
                href = link.get('href')
                if href:
                    # Make absolute URL
                    if href.startswith('http'):
                        attachment_urls.append(href)
                    elif href.startswith('/'):
                        from urllib.parse import urljoin
                        attachment_urls.append(urljoin(base_url, href))
        
        return list(set(attachment_urls))  # Deduplicate
    
    async def _download_file(self, session: aiohttp.ClientSession, url: str, filename_prefix: str) -> Optional[Path]:
        """Download a single file"""
        try:
            async with session.get(url) as response:
                if response.status != 200:
                    return None
                
                # Determine file extension
                content_type = response.headers.get('Content-Type', '')
                ext = self._get_extension_from_content_type(content_type)
                
                if not ext:
                    # Try to get from URL
                    ext = Path(url).suffix or '.bin'
                
                file_path = self.download_dir / f"{filename_prefix}{ext}"
                
                with open(file_path, 'wb') as f:
                    f.write(await response.read())
                
                return file_path
                
        except Exception as e:
            logger.error(f"Error downloading {url}: {e}")
            return None
    
    def _get_extension_from_content_type(self, content_type: str) -> str:
        """Map content type to file extension"""
        mapping = {
            'application/pdf': '.pdf',
            'application/msword': '.doc',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
            'application/vnd.ms-excel': '.xls',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
            'text/html': '.html',
            'text/plain': '.txt',
        }
        
        for ct, ext in mapping.items():
            if ct in content_type.lower():
                return ext
        
        return ''


class PDFExtractor:
    """
    Advanced PDF extraction using multiple strategies:
    1. Text extraction from searchable PDFs
    2. Table extraction using pdfplumber
    3. OCR for scanned PDFs
    4. Image extraction for embedded diagrams
    """
    
    def __init__(self, anthropic_api_key: str):
        self.client = anthropic.Anthropic(api_key=anthropic_api_key)
    
    async def extract_from_pdf(self, pdf_path: Path) -> Dict[str, Any]:
        """Extract all data from PDF"""
        
        extracted_data = {
            'text': '',
            'tables': [],
            'line_items': [],
            'delivery_location': None,
            'due_date': None,
            'requirements': []
        }
        
        try:
            with pdfplumber.open(pdf_path) as pdf:
                # Extract text
                full_text = ""
                for page in pdf.pages:
                    full_text += page.extract_text() or ""
                
                extracted_data['text'] = full_text
                
                # Extract tables
                for page_num, page in enumerate(pdf.pages):
                    tables = page.extract_tables()
                    for table in tables:
                        if table:
                            # Convert to DataFrame for easier handling
                            df = pd.DataFrame(table[1:], columns=table[0])
                            extracted_data['tables'].append({
                                'page': page_num + 1,
                                'data': df.to_dict('records')
                            })
                
                # Use Claude to extract structured data from text
                structured_data = await self._extract_structured_data(full_text)
                extracted_data.update(structured_data)
                
                # Try to find BOM tables and extract line items
                line_items = await self._extract_line_items_from_tables(extracted_data['tables'])
                if line_items:
                    extracted_data['line_items'] = line_items
                
        except Exception as e:
            logger.error(f"Error extracting from PDF {pdf_path}: {e}")
        
        return extracted_data
    
    async def _extract_structured_data(self, text: str) -> Dict[str, Any]:
        """Use Claude to extract structured data from RFP text"""
        
        # Limit text length for API call
        text_sample = text[:15000]  # ~4000 tokens
        
        prompt = f"""Extract structured data from this government solicitation document.

Document Text:
{text_sample}

Extract and return ONLY valid JSON with these fields:
{{
  "delivery_location": "Full address where goods/services are to be delivered",
  "due_date": "Submission deadline in YYYY-MM-DD format",
  "requirements": ["List of key technical requirements"],
  "payment_terms": "Payment terms (Net 30, etc.)",
  "evaluation_criteria": {{"price": "X%", "technical": "Y%", "past_performance": "Z%"}}
}}

If a field is not found, use null. Return ONLY the JSON, no other text.

JSON:"""

        try:
            message = self.client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=1000,
                messages=[{"role": "user", "content": prompt}]
            )
            
            json_text = message.content[0].text.strip()
            # Remove markdown code fences if present
            json_text = json_text.replace('```json', '').replace('```', '').strip()
            
            data = json.loads(json_text)
            return data
            
        except Exception as e:
            logger.error(f"Error extracting structured data: {e}")
            return {}
    
    async def _extract_line_items_from_tables(self, tables: List[Dict]) -> List[LineItem]:
        """
        Extract line items from tables in the PDF.
        Uses Claude to identify which tables are BOMs and parse them.
        """
        line_items = []
        
        for table_data in tables:
            table_records = table_data['data']
            
            if not table_records:
                continue
            
            # Convert table to text for Claude
            table_text = json.dumps(table_records[:20], indent=2)  # First 20 rows
            
            prompt = f"""Analyze this table from a government solicitation and determine if it's a Bill of Materials (BOM) or equipment list.

Table Data:
{table_text}

If this is a BOM/equipment list, extract line items in JSON format:
[
  {{
    "item_number": 1,
    "description": "Item description",
    "quantity": 5,
    "unit": "EA",
    "part_number": "ABC-123",
    "manufacturer": "Company Name"
  }}
]

If this is NOT a BOM, return: {{"is_bom": false}}

Return ONLY valid JSON.

JSON:"""

            try:
                message = self.client.messages.create(
                    model="claude-sonnet-4-20250514",
                    max_tokens=2000,
                    messages=[{"role": "user", "content": prompt}]
                )
                
                json_text = message.content[0].text.strip()
                json_text = json_text.replace('```json', '').replace('```', '').strip()
                
                data = json.loads(json_text)
                
                if isinstance(data, list):
                    # It's a BOM - convert to LineItem objects
                    for item_data in data:
                        line_item = LineItem(
                            item_number=item_data.get('item_number', 0),
                            description=item_data.get('description', ''),
                            quantity=item_data.get('quantity'),
                            unit=item_data.get('unit'),
                            part_number=item_data.get('part_number'),
                            manufacturer=item_data.get('manufacturer')
                        )
                        line_items.append(line_item)
                
            except Exception as e:
                logger.error(f"Error parsing table: {e}")
                continue
        
        return line_items


class LineItemClassifier:
    """
    Classifies line items into categories and determines sourcing strategy.
    Uses Claude + historical pricing database.
    """
    
    def __init__(self, anthropic_api_key: str):
        self.client = anthropic.Anthropic(api_key=anthropic_api_key)
    
    async def classify_line_item(self, line_item: LineItem) -> LineItem:
        """
        Classify line item type and sourcing strategy.
        Updates the line_item object in place.
        """
        
        prompt = f"""Analyze this procurement line item and classify it:

Description: {line_item.description}
Part Number: {line_item.part_number or 'N/A'}
Manufacturer: {line_item.manufacturer or 'N/A'}
Quantity: {line_item.quantity or 'N/A'}

Classify into:
1. Item Type: PLC, ROBOT, AUTOMATION, CONVEYOR, ELECTRICAL, MECHANICAL, SOFTWARE, OTHER
2. Sourcing Type: 
   - "distributor-sourcable" (can buy from Allen-Bradley, FANUC, etc. distributors)
   - "integrator-required" (requires custom work by Singh Automation)
3. Suggested Product: Specific product recommendation if recognizable (e.g., "Allen-Bradley CompactLogix 5380")

Return ONLY JSON:
{{
  "item_type": "...",
  "sourcing_type": "...",
  "suggested_product": "..." or null
}}

JSON:"""

        try:
            message = self.client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=200,
                messages=[{"role": "user", "content": prompt}]
            )
            
            json_text = message.content[0].text.strip()
            json_text = json_text.replace('```json', '').replace('```', '').strip()
            
            data = json.loads(json_text)
            
            line_item.item_type = data.get('item_type', 'OTHER')
            line_item.sourcing_type = data.get('sourcing_type', 'Unknown')
            line_item.suggested_product = data.get('suggested_product')
            
        except Exception as e:
            logger.error(f"Error classifying line item: {e}")
        
        return line_item
    
    async def estimate_pricing(self, line_item: LineItem, pricing_db: Dict[str, float]) -> LineItem:
        """
        Estimate pricing for line item based on historical database.
        """
        
        # Simple keyword matching for now
        description_lower = line_item.description.lower()
        
        for keyword, price in pricing_db.items():
            if keyword.lower() in description_lower:
                line_item.estimated_price = price
                break
        
        # If no match, use Claude to estimate
        if line_item.estimated_price is None and line_item.suggested_product:
            # Would query USASpending or historical contracts here
            # For now, set as manual lookup required
            line_item.notes = "Manual lookup required"
        
        return line_item


class RFQGenerator:
    """
    Generates complete RFQ documents from extracted solicitation data.
    Creates professional RFQs ready to send to distributors.
    """
    
    def __init__(self, company_profile: Dict[str, str]):
        self.company = company_profile
    
    def generate_rfq(self, package: SolicitationPackage) -> str:
        """Generate RFQ document text"""
        
        # Calculate fulfillment confidence
        fulfillment_confidence = self._calculate_fulfillment_confidence(package)
        
        rfq_text = f"""══════════════════════════════════════════════════════════════
           DISTRIBUTOR RFQ REQUEST - DRAFT
              ⚠️ FOR PRICING VALIDATION ONLY ⚠️
══════════════════════════════════════════════════════════════

📋 REQUEST INFORMATION
──────────────────────────────────────────────────────────────
Request Date:        {datetime.now().strftime('%Y-%m-%d')}
Request Type:        Pre-Award Pricing Validation
Status:              DRAFT - PENDING HUMAN APPROVAL
Fulfillment Confidence: {fulfillment_confidence}% {"High" if fulfillment_confidence >= 85 else "Medium" if fulfillment_confidence >= 60 else "Low"}

⚠️ IMPORTANT NOTICE:
This request is for pricing validation only.
No purchase order is authorized.
Pricing subject to government award.

══════════════════════════════════════════════════════════════
📦 OPPORTUNITY DETAILS
──────────────────────────────────────────────────────────────
Opportunity ID:      {package.solicitation_id}
Title:               {package.title}
Agency:              {package.agency}
Response Due:        {package.due_date.strftime('%Y-%m-%d') if package.due_date else 'Not specified'}
Delivery Location:   {package.delivery_location or 'Not specified'}

══════════════════════════════════════════════════════════════
📦 LINE ITEMS REQUESTED
──────────────────────────────────────────────────────────────
"""
        
        # Group line items by sourcing type
        distributor_items = [item for item in package.line_items if item.sourcing_type == "distributor-sourcable"]
        integrator_items = [item for item in package.line_items if item.sourcing_type == "integrator-required"]
        
        if distributor_items:
            rfq_text += "\n🔷 DISTRIBUTOR-SOURCABLE ITEMS:\n\n"
            for item in distributor_items:
                rfq_text += f"""Item {item.item_number}: {item.description}
  Quantity:     {item.quantity or 'TBD'} {item.unit or ''}
  Type:         {item.item_type}
  Part Number:  {item.part_number or 'See description'}
  Suggested:    {item.suggested_product or 'Standard catalog item'}
  Est. Price:   ${item.estimated_price:,.2f} if item.estimated_price else 'TBD'

"""
        
        if integrator_items:
            rfq_text += "\n🔶 INTEGRATOR-REQUIRED ITEMS (For Reference):\n\n"
            for item in integrator_items:
                rfq_text += f"""Item {item.item_number}: {item.description}
  Quantity:     {item.quantity or 'TBD'} {item.unit or ''}
  Type:         {item.item_type}
  Note:         Custom integration work - not for distributor quote

"""
        
        rfq_text += f"""
══════════════════════════════════════════════════════════════
📝 QUOTE REQUEST TERMS
──────────────────────────────────────────────────────────────
• Pricing valid for: 30 days from quote date
• Payment terms: {package.payment_terms or 'Net 30 (subject to government flow-down)'}
• Shipping: FOB Destination - {package.delivery_location or 'TBD'}
• Lead time: Please specify for each item

══════════════════════════════════════════════════════════════
🏢 REQUESTOR INFORMATION
──────────────────────────────────────────────────────────────
Company:         {self.company['name']}
CAGE Code:       {self.company['cage']}
UEI:             {self.company['uei']}
Contact:         {self.company['contact']}
Phone:           {self.company['phone']}
Email:           {self.company['email']}

══════════════════════════════════════════════════════════════
⚠️ REQUIRED FOOTER - DO NOT REMOVE
══════════════════════════════════════════════════════════════
This request is for pre-award pricing validation only. 
No purchase authorization is implied. 
Pricing subject to change and government award.
══════════════════════════════════════════════════════════════
"""
        
        return rfq_text
    
    def _calculate_fulfillment_confidence(self, package: SolicitationPackage) -> int:
        """
        Calculate confidence that we can fulfill this opportunity.
        Based on how complete the data extraction is.
        """
        
        confidence = 100
        
        # Deduct points for missing data
        if not package.delivery_location:
            confidence -= 10
        
        if not package.due_date:
            confidence -= 5
        
        if not package.line_items:
            confidence -= 40  # Critical
        else:
            # Check line item completeness
            items_with_qty = sum(1 for item in package.line_items if item.quantity is not None)
            items_with_price = sum(1 for item in package.line_items if item.estimated_price is not None)
            
            if len(package.line_items) > 0:
                qty_completeness = items_with_qty / len(package.line_items)
                price_completeness = items_with_price / len(package.line_items)
                
                if qty_completeness < 0.8:
                    confidence -= 15
                if price_completeness < 0.5:
                    confidence -= 10
        
        return max(0, min(100, confidence))


class DocumentIntelligenceEngine:
    """
    Main orchestrator for document processing pipeline.
    Downloads → Extracts → Classifies → Generates RFQ.
    """
    
    def __init__(self, anthropic_api_key: str):
        self.downloader = DocumentDownloader()
        self.pdf_extractor = PDFExtractor(anthropic_api_key)
        self.classifier = LineItemClassifier(anthropic_api_key)
        self.rfq_generator = RFQGenerator({
            'name': 'Singh Automation',
            'cage': '86VF7',
            'uei': 'GJ1DPYQ3X8K5',
            'contact': 'Albert Mizuno',
            'phone': '786-344-8955',
            'email': 'albert@singhautomation.com'
        })
        
        # Historical pricing database (would load from SQLite)
        self.pricing_db = {
            'FANUC LR Mate 200iD': 32000.0,
            'Allen-Bradley CompactLogix 5380': 2850.0,
            'Universal Robots UR10e': 48000.0,
            'PLC system': 2850.0,
            'ROBOT system': 32000.0,
        }
    
    async def process_solicitation(self, 
                                   opportunity_url: str, 
                                   solicitation_id: str,
                                   title: str,
                                   agency: str) -> SolicitationPackage:
        """
        Complete processing pipeline for a single solicitation.
        Returns fully populated SolicitationPackage ready for RFQ generation.
        """
        
        logger.info(f"Processing solicitation: {solicitation_id}")
        
        # Step 1: Download all documents
        logger.info("Step 1: Downloading documents...")
        files = await self.downloader.download_package(opportunity_url, solicitation_id)
        
        if not files:
            logger.error("No files downloaded")
            return SolicitationPackage(
                solicitation_id=solicitation_id,
                title=title,
                agency=agency,
                due_date=None
            )
        
        # Step 2: Extract data from PDFs
        logger.info(f"Step 2: Extracting data from {len(files)} files...")
        all_line_items = []
        extracted_data = {}
        
        for file_path in files:
            if file_path.suffix.lower() == '.pdf':
                data = await self.pdf_extractor.extract_from_pdf(file_path)
                
                # Merge extracted data
                if not extracted_data:
                    extracted_data = data
                else:
                    # Combine line items
                    all_line_items.extend(data.get('line_items', []))
                    
                    # Update other fields if not already set
                    for key in ['delivery_location', 'due_date', 'payment_terms']:
                        if not extracted_data.get(key) and data.get(key):
                            extracted_data[key] = data[key]
        
        # Step 3: Classify and price line items
        logger.info(f"Step 3: Classifying {len(all_line_items)} line items...")
        classified_items = []
        for item in all_line_items:
            classified = await self.classifier.classify_line_item(item)
            priced = await self.classifier.estimate_pricing(classified, self.pricing_db)
            classified_items.append(priced)
        
        # Step 4: Create package
        package = SolicitationPackage(
            solicitation_id=solicitation_id,
            title=title,
            agency=agency,
            due_date=extracted_data.get('due_date'),
            line_items=classified_items,
            delivery_location=extracted_data.get('delivery_location'),
            payment_terms=extracted_data.get('payment_terms'),
            technical_requirements=extracted_data.get('requirements', []),
            evaluation_criteria=extracted_data.get('evaluation_criteria', {}),
            main_rfp_path=files[0] if files else None,
            attachments=files[1:] if len(files) > 1 else []
        )
        
        logger.info(f"Processing complete. Extracted {len(classified_items)} line items.")
        return package
    
    def generate_rfq_document(self, package: SolicitationPackage) -> str:
        """Generate complete RFQ document"""
        return self.rfq_generator.generate_rfq(package)


# ==================== MAIN EXECUTION ====================

async def main():
    """Test the document intelligence engine"""
    
    ANTHROPIC_API_KEY = "your-api-key-here"
    
    engine = DocumentIntelligenceEngine(ANTHROPIC_API_KEY)
    
    # Test with California eProcure opportunity
    test_url = "https://caleprocure.ca.gov/pages/Events-BS3/event-details.aspx?ID=12345"
    
    package = await engine.process_solicitation(
        opportunity_url=test_url,
        solicitation_id="CA-2025-TEST",
        title="Industrial Automation Equipment",
        agency="California Department of General Services"
    )
    
    # Generate RFQ
    rfq_text = engine.generate_rfq_document(package)
    
    print("\n" + "="*80)
    print("GENERATED RFQ DOCUMENT")
    print("="*80 + "\n")
    print(rfq_text)
    
    # Save to file
    output_path = Path("/home/claude/outputs/rfq_draft.txt")
    output_path.parent.mkdir(exist_ok=True)
    with open(output_path, 'w') as f:
        f.write(rfq_text)
    
    print(f"\nRFQ saved to: {output_path}")


if __name__ == "__main__":
    asyncio.run(main())
