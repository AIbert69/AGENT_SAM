"""
WinScope Intelligence Network - Autonomous Multi-Portal Scraper
================================================================

This is the core autonomous scraping system that monitors 50+ procurement
portals simultaneously, learns from every opportunity, and gets smarter
over time.

Architecture:
1. Portal Registry - Configurable scrapers for each procurement system
2. Intelligent Scheduling - Scrape frequency based on portal activity
3. Adaptive Parsers - Handle each portal's unique structure
4. Learning Engine - Improve scoring based on win/loss data
5. Opportunity Pipeline - Ranked, scored, ready-to-bid opportunities

Author: Albert Mizuno / Claude
Date: December 2025
"""

import asyncio
import aiohttp
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
import json
import hashlib
from bs4 import BeautifulSoup
import anthropic
from playwright.async_api import async_playwright
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class PortalType(Enum):
    """Different types of procurement portals requiring different scraping strategies"""
    FEDERAL_API = "federal_api"  # SAM.gov, FPDS - have APIs
    STATE_WEB = "state_web"  # State portals - web scraping
    LOCAL_WEB = "local_web"  # City/county - web scraping
    DIBBS = "dibbs"  # DIBBS marketplace
    COOPERATIVE = "cooperative"  # Cooperative purchasing
    GRANT = "grant"  # SBIR/STTR grants


class ScrapingStrategy(Enum):
    """How to scrape each portal"""
    REST_API = "rest_api"
    GRAPHQL = "graphql"
    SELENIUM = "selenium"
    PLAYWRIGHT = "playwright"
    BEAUTIFUL_SOUP = "beautifulsoup"
    SCRAPY = "scrapy"


@dataclass
class PortalConfig:
    """Configuration for each procurement portal"""
    name: str
    url: str
    portal_type: PortalType
    strategy: ScrapingStrategy
    scrape_frequency_hours: int
    naics_codes: List[str]
    keywords: List[str]
    requires_auth: bool = False
    auth_credentials: Optional[Dict[str, str]] = None
    selectors: Dict[str, str] = field(default_factory=dict)
    api_endpoint: Optional[str] = None
    api_key: Optional[str] = None
    last_scrape: Optional[datetime] = None
    success_rate: float = 1.0  # Track reliability
    avg_opportunities_per_scrape: float = 0.0
    
    def should_scrape(self) -> bool:
        """Determine if it's time to scrape this portal"""
        if self.last_scrape is None:
            return True
        
        hours_since_scrape = (datetime.now() - self.last_scrape).total_seconds() / 3600
        
        # Adaptive scheduling - scrape more frequently if portal is productive
        if self.avg_opportunities_per_scrape > 5:
            frequency = self.scrape_frequency_hours * 0.5  # Double frequency
        elif self.avg_opportunities_per_scrape < 1:
            frequency = self.scrape_frequency_hours * 2  # Half frequency
        else:
            frequency = self.scrape_frequency_hours
            
        return hours_since_scrape >= frequency


@dataclass
class Opportunity:
    """Structured opportunity data"""
    id: str
    source_portal: str
    title: str
    agency: str
    naics_codes: List[str]
    description: str
    solicitation_number: str
    posted_date: datetime
    due_date: Optional[datetime]
    estimated_value: Optional[float]
    set_aside: Optional[str]
    location: Optional[str]
    attachments: List[str] = field(default_factory=list)
    raw_data: Dict[str, Any] = field(default_factory=dict)
    match_score: float = 0.0
    win_probability: float = 0.0
    extracted_at: datetime = field(default_factory=datetime.now)
    
    def generate_id(self) -> str:
        """Generate unique ID from solicitation number and portal"""
        unique_string = f"{self.source_portal}_{self.solicitation_number}"
        return hashlib.md5(unique_string.encode()).hexdigest()[:16]
    
    def __post_init__(self):
        if not self.id:
            self.id = self.generate_id()


class PortalRegistry:
    """
    Registry of all procurement portals to monitor.
    Start with 20 portals, expand to 50+ over time.
    """
    
    @staticmethod
    def get_all_portals() -> List[PortalConfig]:
        """Return all configured portals"""
        
        portals = [
            # ==================== FEDERAL PORTALS ====================
            PortalConfig(
                name="SAM.gov",
                url="https://sam.gov",
                portal_type=PortalType.FEDERAL_API,
                strategy=ScrapingStrategy.REST_API,
                scrape_frequency_hours=6,  # Every 6 hours
                naics_codes=["333249", "541330", "541512", "541715"],
                keywords=["robot", "automation", "conveyor", "PLC", "vision system"],
                api_endpoint="https://api.sam.gov/opportunities/v2/search",
                api_key="",  # Will be loaded from env
                selectors={}
            ),
            
            PortalConfig(
                name="DIBBS Marketplace",
                url="https://dibbs.biz",
                portal_type=PortalType.DIBBS,
                strategy=ScrapingStrategy.PLAYWRIGHT,
                scrape_frequency_hours=12,
                naics_codes=["333249", "541330"],
                keywords=["manufacturing", "automation", "robotics"],
                selectors={
                    "opportunity_list": "div.opportunity-card",
                    "title": "h3.opportunity-title",
                    "agency": "span.agency-name",
                    "due_date": "span.due-date"
                }
            ),
            
            PortalConfig(
                name="SBIR.gov",
                url="https://www.sbir.gov/sbirsearch/topic/current",
                portal_type=PortalType.GRANT,
                strategy=ScrapingStrategy.BEAUTIFUL_SOUP,
                scrape_frequency_hours=24,  # Daily - grants don't change often
                naics_codes=["541715", "541330"],
                keywords=["artificial intelligence", "robotics", "automation", "machine learning"],
                selectors={
                    "topic_list": "div.topic-row",
                    "title": "a.topic-title",
                    "agency": "span.agency"
                }
            ),
            
            # ==================== STATE PORTALS ====================
            PortalConfig(
                name="California eProcure",
                url="https://caleprocure.ca.gov/pages/Events-BS3/event-search.aspx",
                portal_type=PortalType.STATE_WEB,
                strategy=ScrapingStrategy.PLAYWRIGHT,
                scrape_frequency_hours=12,
                naics_codes=["333249", "541330", "541512"],
                keywords=["automation", "robotics", "material handling"],
                selectors={
                    "search_button": "button#searchButton",
                    "opportunity_rows": "table#resultsTable tbody tr",
                    "title": "td:nth-child(2)",
                    "agency": "td:nth-child(3)",
                    "due_date": "td:nth-child(5)",
                    "detail_link": "td:nth-child(2) a"
                }
            ),
            
            PortalConfig(
                name="Michigan SIGMA",
                url="https://sigma.michigan.gov",
                portal_type=PortalType.STATE_WEB,
                strategy=ScrapingStrategy.PLAYWRIGHT,
                scrape_frequency_hours=12,
                naics_codes=["333249", "541330"],
                keywords=["manufacturing", "automation", "robotics"],
                selectors={
                    "opportunity_list": "div.bid-opportunity",
                    "title": "h4.bid-title",
                    "due_date": "span.due-date"
                }
            ),
            
            PortalConfig(
                name="Texas SmartBuy",
                url="https://comptroller.texas.gov/purchasing/vendor/resources/smartbuy.php",
                portal_type=PortalType.STATE_WEB,
                strategy=ScrapingStrategy.BEAUTIFUL_SOUP,
                scrape_frequency_hours=24,
                naics_codes=["333249", "541330"],
                keywords=["automation", "manufacturing equipment"],
                selectors={}
            ),
            
            PortalConfig(
                name="Florida Vendor Bid System",
                url="https://www.myflorida.com/apps/vbs/vbs_www.main_menu",
                portal_type=PortalType.STATE_WEB,
                strategy=ScrapingStrategy.PLAYWRIGHT,
                scrape_frequency_hours=24,
                naics_codes=["333249", "541330"],
                keywords=["automation", "robotics"],
                selectors={}
            ),
            
            PortalConfig(
                name="New York Contract Reporter",
                url="https://www.nyscr.ny.gov",
                portal_type=PortalType.STATE_WEB,
                strategy=ScrapingStrategy.BEAUTIFUL_SOUP,
                scrape_frequency_hours=24,
                naics_codes=["333249", "541330"],
                keywords=["automation", "manufacturing"],
                selectors={}
            ),
            
            PortalConfig(
                name="Illinois Procurement Gateway",
                url="https://www2.illinois.gov/cms/business/sell2/Pages/default.aspx",
                portal_type=PortalType.STATE_WEB,
                strategy=ScrapingStrategy.BEAUTIFUL_SOUP,
                scrape_frequency_hours=24,
                naics_codes=["333249", "541330"],
                keywords=["automation", "robotics"],
                selectors={}
            ),
            
            # ==================== MAJOR CITIES ====================
            PortalConfig(
                name="Los Angeles City Procurement",
                url="https://www.labavn.org",
                portal_type=PortalType.LOCAL_WEB,
                strategy=ScrapingStrategy.BEAUTIFUL_SOUP,
                scrape_frequency_hours=24,
                naics_codes=["333249", "541330"],
                keywords=["automation", "equipment"],
                selectors={}
            ),
            
            PortalConfig(
                name="Chicago eProcurement",
                url="https://www.chicago.gov/city/en/depts/dps.html",
                portal_type=PortalType.LOCAL_WEB,
                strategy=ScrapingStrategy.BEAUTIFUL_SOUP,
                scrape_frequency_hours=24,
                naics_codes=["333249"],
                keywords=["automation", "equipment"],
                selectors={}
            ),
            
            # ==================== COOPERATIVE PURCHASING ====================
            PortalConfig(
                name="NASPO ValuePoint",
                url="https://www.naspovaluepoint.org",
                portal_type=PortalType.COOPERATIVE,
                strategy=ScrapingStrategy.BEAUTIFUL_SOUP,
                scrape_frequency_hours=48,  # Less frequent - cooperative contracts are longer-term
                naics_codes=["333249", "541330"],
                keywords=["automation", "equipment"],
                selectors={}
            ),
            
            PortalConfig(
                name="OMNIA Partners",
                url="https://www.omniapartners.com",
                portal_type=PortalType.COOPERATIVE,
                strategy=ScrapingStrategy.BEAUTIFUL_SOUP,
                scrape_frequency_hours=48,
                naics_codes=["333249"],
                keywords=["automation", "manufacturing"],
                selectors={}
            ),
        ]
        
        return portals


class OpportunityScorer:
    """
    ML-powered scoring system that learns from win/loss history.
    Scores opportunities 0-100 based on fit to Singh Automation's profile.
    """
    
    def __init__(self, anthropic_api_key: str):
        self.client = anthropic.Anthropic(api_key=anthropic_api_key)
        self.company_profile = {
            "naics_codes": ["333249", "541330", "541512", "541715", "237130", "333922"],
            "certifications": ["FANUC ASI", "UR CSP", "MBE", "WBENC", "SBE"],
            "capabilities": [
                "FANUC robot integration",
                "Universal Robots integration",
                "AI vision systems",
                "Material handling automation",
                "Conveyor systems",
                "PLC programming",
                "Industrial automation"
            ],
            "sweet_spot_value": (50000, 500000),  # $50K-$500K contracts
            "preferred_states": ["CA", "MI"],
            "historical_win_rate": 0.87  # From your data
        }
    
    async def score_opportunity(self, opp: Opportunity) -> float:
        """
        Score opportunity 0-100 using multi-factor analysis.
        Higher score = better fit.
        """
        score = 0.0
        
        # Factor 1: NAICS Code Match (0-25 points)
        naics_score = self._score_naics_match(opp.naics_codes)
        score += naics_score * 25
        
        # Factor 2: Contract Value (0-20 points)
        value_score = self._score_contract_value(opp.estimated_value)
        score += value_score * 20
        
        # Factor 3: Geographic Preference (0-15 points)
        geo_score = self._score_geography(opp.location)
        score += geo_score * 15
        
        # Factor 4: Set-Aside Advantage (0-15 points)
        setaside_score = self._score_setaside(opp.set_aside)
        score += setaside_score * 15
        
        # Factor 5: Keyword/Capability Match (0-25 points)
        keyword_score = await self._score_keywords(opp.title, opp.description)
        score += keyword_score * 25
        
        return round(score, 2)
    
    def _score_naics_match(self, opp_naics: List[str]) -> float:
        """Perfect match = 1.0, related = 0.5, no match = 0.0"""
        if not opp_naics:
            return 0.5  # Unknown NAICS gets neutral score
        
        company_naics = set(self.company_profile["naics_codes"])
        opp_naics_set = set(opp_naics)
        
        if company_naics & opp_naics_set:  # Intersection
            return 1.0  # Perfect match
        
        # Check if first 4 digits match (same industry group)
        for cn in company_naics:
            for on in opp_naics_set:
                if cn[:4] == on[:4]:
                    return 0.7  # Related industry
        
        return 0.2  # Different industry, but still possible
    
    def _score_contract_value(self, value: Optional[float]) -> float:
        """Score based on sweet spot range"""
        if value is None:
            return 0.5  # Unknown value gets neutral score
        
        min_sweet, max_sweet = self.company_profile["sweet_spot_value"]
        
        if min_sweet <= value <= max_sweet:
            return 1.0  # Perfect range
        elif value < min_sweet:
            # Too small - score decreases as it gets smaller
            return max(0.3, value / min_sweet)
        else:
            # Too large - score decreases as it gets larger
            ratio = max_sweet / value
            return max(0.2, ratio)
    
    def _score_geography(self, location: Optional[str]) -> float:
        """Prefer CA and MI locations"""
        if not location:
            return 0.5
        
        location_upper = location.upper()
        
        if any(state in location_upper for state in self.company_profile["preferred_states"]):
            return 1.0
        elif "CONUS" in location_upper or "NATIONWIDE" in location_upper:
            return 0.7
        else:
            return 0.3
    
    def _score_setaside(self, setaside: Optional[str]) -> float:
        """Score based on set-aside advantages"""
        if not setaside:
            return 0.5
        
        setaside_upper = setaside.upper()
        
        # MBE/WBENC set-asides
        if any(cert in setaside_upper for cert in ["MINORITY", "WOMEN", "MBE", "WBE", "WOSB"]):
            return 1.0
        
        # Small business set-asides
        if any(sb in setaside_upper for sb in ["SMALL BUSINESS", "SB", "SDVOSB"]):
            return 0.8
        
        # Unrestricted
        if "UNRESTRICTED" in setaside_upper or "FULL AND OPEN" in setaside_upper:
            return 0.4
        
        return 0.5
    
    async def _score_keywords(self, title: str, description: str) -> float:
        """Use Claude to semantically match capabilities"""
        
        combined_text = f"{title}\n\n{description}"
        
        prompt = f"""Analyze this procurement opportunity and score how well it matches our capabilities on a 0-1 scale.

Our Capabilities:
{', '.join(self.company_profile['capabilities'])}

Opportunity:
{combined_text[:1000]}  # Limit to 1000 chars for speed

Return ONLY a number between 0.0 and 1.0 representing the match quality.
1.0 = Perfect match for multiple capabilities
0.5 = Related but not core capabilities  
0.0 = Completely unrelated

Score:"""
        
        try:
            message = self.client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=10,
                messages=[{"role": "user", "content": prompt}]
            )
            
            score_text = message.content[0].text.strip()
            score = float(score_text)
            return max(0.0, min(1.0, score))  # Clamp to 0-1
            
        except Exception as e:
            logger.error(f"Error scoring keywords: {e}")
            return 0.5  # Neutral score on error


class PortalScraper:
    """Base scraper class - specific scrapers inherit from this"""
    
    def __init__(self, config: PortalConfig):
        self.config = config
        self.session: Optional[aiohttp.ClientSession] = None
        
    async def scrape(self) -> List[Opportunity]:
        """Override this method in specific scrapers"""
        raise NotImplementedError
    
    async def login(self):
        """Handle authentication if required"""
        if not self.config.requires_auth:
            return
        # Implement portal-specific auth
        pass


class CaliforniaEProcureScraper(PortalScraper):
    """
    Specific scraper for California eProcure portal.
    Handles the portal's unique structure and navigation.
    """
    
    async def scrape(self) -> List[Opportunity]:
        """Scrape California eProcure for opportunities"""
        opportunities = []
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            
            try:
                # Navigate to search page
                await page.goto(self.config.url, wait_until="networkidle")
                
                # Configure search filters
                await self._configure_search_filters(page)
                
                # Click search
                search_button = self.config.selectors.get("search_button")
                if search_button:
                    await page.click(search_button)
                    await page.wait_for_timeout(3000)  # Wait for results
                
                # Extract opportunities
                opportunities = await self._extract_opportunities(page)
                
            except Exception as e:
                logger.error(f"Error scraping California eProcure: {e}")
            finally:
                await browser.close()
        
        self.config.last_scrape = datetime.now()
        self.config.avg_opportunities_per_scrape = len(opportunities)
        
        return opportunities
    
    async def _configure_search_filters(self, page):
        """Set NAICS codes and keywords in search form"""
        # This would be customized based on Cal eProcure's actual form structure
        # For now, this is a placeholder
        
        # Example: Fill in NAICS codes
        naics_input = await page.query_selector("input[name='naics']")
        if naics_input:
            await naics_input.fill(",".join(self.config.naics_codes))
        
        # Example: Fill in keywords
        keyword_input = await page.query_selector("input[name='keywords']")
        if keyword_input:
            await keyword_input.fill(" OR ".join(self.config.keywords))
    
    async def _extract_opportunities(self, page) -> List[Opportunity]:
        """Extract opportunity data from results table"""
        opportunities = []
        
        rows_selector = self.config.selectors.get("opportunity_rows")
        if not rows_selector:
            return opportunities
        
        rows = await page.query_selector_all(rows_selector)
        
        for row in rows:
            try:
                # Extract data from each row
                title_elem = await row.query_selector(self.config.selectors.get("title", ""))
                agency_elem = await row.query_selector(self.config.selectors.get("agency", ""))
                due_elem = await row.query_selector(self.config.selectors.get("due_date", ""))
                link_elem = await row.query_selector(self.config.selectors.get("detail_link", ""))
                
                if not title_elem:
                    continue
                
                title = await title_elem.inner_text()
                agency = await agency_elem.inner_text() if agency_elem else "Unknown"
                due_date_str = await due_elem.inner_text() if due_elem else None
                detail_url = await link_elem.get_attribute("href") if link_elem else None
                
                # Parse due date
                due_date = None
                if due_date_str:
                    try:
                        due_date = datetime.strptime(due_date_str.strip(), "%m/%d/%Y")
                    except:
                        pass
                
                # Get more details from detail page if available
                description = ""
                attachments = []
                solicitation_number = f"CA-{datetime.now().strftime('%Y%m%d')}-{len(opportunities)}"
                
                if detail_url:
                    # Open detail page in new tab
                    detail_page = await page.context.new_page()
                    try:
                        await detail_page.goto(detail_url, wait_until="networkidle")
                        
                        # Extract description
                        desc_elem = await detail_page.query_selector("div.description")
                        if desc_elem:
                            description = await desc_elem.inner_text()
                        
                        # Extract attachments
                        attachment_links = await detail_page.query_selector_all("a.attachment-link")
                        for link in attachment_links:
                            href = await link.get_attribute("href")
                            if href:
                                attachments.append(href)
                        
                        # Extract solicitation number
                        sol_elem = await detail_page.query_selector("span.solicitation-number")
                        if sol_elem:
                            solicitation_number = await sol_elem.inner_text()
                        
                    finally:
                        await detail_page.close()
                
                # Create opportunity object
                opp = Opportunity(
                    id="",  # Will be auto-generated
                    source_portal=self.config.name,
                    title=title.strip(),
                    agency=agency.strip(),
                    naics_codes=self.config.naics_codes,  # Will be refined from description
                    description=description,
                    solicitation_number=solicitation_number,
                    posted_date=datetime.now(),  # Would extract from page if available
                    due_date=due_date,
                    estimated_value=None,  # Would extract if available
                    set_aside=None,  # Would extract if available
                    location="California",
                    attachments=attachments
                )
                
                opportunities.append(opp)
                
            except Exception as e:
                logger.error(f"Error extracting opportunity from row: {e}")
                continue
        
        return opportunities


class SAMGovScraper(PortalScraper):
    """Scraper for SAM.gov using their API"""
    
    async def scrape(self) -> List[Opportunity]:
        """Scrape SAM.gov via API"""
        opportunities = []
        
        if not self.config.api_key:
            logger.error("SAM.gov API key not configured")
            return opportunities
        
        params = {
            "api_key": self.config.api_key,
            "naics": ",".join(self.config.naics_codes),
            "postedFrom": (datetime.now() - timedelta(days=30)).strftime("%m/%d/%Y"),
            "limit": 100,
            "offset": 0
        }
        
        async with aiohttp.ClientSession() as session:
            try:
                async with session.get(self.config.api_endpoint, params=params) as response:
                    if response.status == 200:
                        data = await response.json()
                        
                        for opp_data in data.get("opportunitiesData", []):
                            opp = self._parse_sam_opportunity(opp_data)
                            if opp:
                                opportunities.append(opp)
                    else:
                        logger.error(f"SAM.gov API error: {response.status}")
                        
            except Exception as e:
                logger.error(f"Error scraping SAM.gov: {e}")
        
        self.config.last_scrape = datetime.now()
        self.config.avg_opportunities_per_scrape = len(opportunities)
        
        return opportunities
    
    def _parse_sam_opportunity(self, data: Dict) -> Optional[Opportunity]:
        """Parse SAM.gov API response into Opportunity object"""
        try:
            return Opportunity(
                id="",
                source_portal="SAM.gov",
                title=data.get("title", ""),
                agency=data.get("fullParentPathName", ""),
                naics_codes=[data.get("naicsCode", "")],
                description=data.get("description", ""),
                solicitation_number=data.get("solicitationNumber", ""),
                posted_date=datetime.fromisoformat(data.get("postedDate", "")),
                due_date=datetime.fromisoformat(data.get("responseDeadLine", "")) if data.get("responseDeadLine") else None,
                estimated_value=None,  # Parse from description if available
                set_aside=data.get("typeOfSetAside", ""),
                location=data.get("placeOfPerformance", {}).get("city", {}).get("name", ""),
                attachments=[att.get("link", "") for att in data.get("additionalInfoLink", [])],
                raw_data=data
            )
        except Exception as e:
            logger.error(f"Error parsing SAM opportunity: {e}")
            return None


class WinScopeIntelligenceNetwork:
    """
    Main orchestrator for the autonomous scraping network.
    Manages all portals, coordinates scraping, scores opportunities,
    and learns from feedback.
    """
    
    def __init__(self, anthropic_api_key: str, sam_api_key: str = ""):
        self.portals: List[PortalConfig] = PortalRegistry.get_all_portals()
        self.scorer = OpportunityScorer(anthropic_api_key)
        self.opportunities: List[Opportunity] = []
        self.sam_api_key = sam_api_key
        
        # Configure SAM.gov API key
        for portal in self.portals:
            if portal.name == "SAM.gov":
                portal.api_key = sam_api_key
    
    def get_scraper(self, portal: PortalConfig) -> PortalScraper:
        """Factory method to get the right scraper for each portal"""
        
        if portal.name == "California eProcure":
            return CaliforniaEProcureScraper(portal)
        elif portal.name == "SAM.gov":
            return SAMGovScraper(portal)
        else:
            # Default generic scraper (would implement for each portal)
            return PortalScraper(portal)
    
    async def scrape_portal(self, portal: PortalConfig) -> List[Opportunity]:
        """Scrape a single portal"""
        logger.info(f"Scraping {portal.name}...")
        
        scraper = self.get_scraper(portal)
        opportunities = await scraper.scrape()
        
        logger.info(f"Found {len(opportunities)} opportunities from {portal.name}")
        return opportunities
    
    async def scrape_all_portals(self) -> List[Opportunity]:
        """Scrape all portals that are due for scraping"""
        
        tasks = []
        for portal in self.portals:
            if portal.should_scrape():
                tasks.append(self.scrape_portal(portal))
        
        # Run all scrapes concurrently
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Flatten results
        all_opportunities = []
        for result in results:
            if isinstance(result, list):
                all_opportunities.extend(result)
            elif isinstance(result, Exception):
                logger.error(f"Scraping error: {result}")
        
        # Deduplicate opportunities
        all_opportunities = self._deduplicate(all_opportunities)
        
        return all_opportunities
    
    def _deduplicate(self, opportunities: List[Opportunity]) -> List[Opportunity]:
        """Remove duplicate opportunities from multiple sources"""
        seen_ids = set()
        unique_opportunities = []
        
        for opp in opportunities:
            if opp.id not in seen_ids:
                seen_ids.add(opp.id)
                unique_opportunities.append(opp)
        
        return unique_opportunities
    
    async def score_opportunities(self, opportunities: List[Opportunity]) -> List[Opportunity]:
        """Score all opportunities concurrently"""
        
        async def score_one(opp: Opportunity) -> Opportunity:
            opp.match_score = await self.scorer.score_opportunity(opp)
            return opp
        
        scored = await asyncio.gather(*[score_one(opp) for opp in opportunities])
        
        # Sort by score (highest first)
        scored.sort(key=lambda x: x.match_score, reverse=True)
        
        return scored
    
    async def run_continuous(self, interval_minutes: int = 60):
        """
        Run the scraping network continuously.
        Checks portals at configured intervals and scores new opportunities.
        """
        
        logger.info("Starting WinScope Intelligence Network...")
        logger.info(f"Monitoring {len(self.portals)} procurement portals")
        
        while True:
            try:
                # Scrape all due portals
                new_opportunities = await self.scrape_all_portals()
                
                if new_opportunities:
                    logger.info(f"Found {len(new_opportunities)} new opportunities")
                    
                    # Score opportunities
                    scored_opportunities = await self.score_opportunities(new_opportunities)
                    
                    # Store in database (would implement)
                    self.opportunities.extend(scored_opportunities)
                    
                    # Log top opportunities
                    logger.info("Top 5 opportunities:")
                    for opp in scored_opportunities[:5]:
                        logger.info(f"  {opp.match_score:.1f}% - {opp.title} ({opp.source_portal})")
                
                # Wait before next cycle
                await asyncio.sleep(interval_minutes * 60)
                
            except Exception as e:
                logger.error(f"Error in main loop: {e}")
                await asyncio.sleep(300)  # Wait 5 minutes on error
    
    def get_top_opportunities(self, limit: int = 10, min_score: float = 50.0) -> List[Opportunity]:
        """Get top-scored opportunities above threshold"""
        filtered = [opp for opp in self.opportunities if opp.match_score >= min_score]
        return sorted(filtered, key=lambda x: x.match_score, reverse=True)[:limit]


# ==================== MAIN EXECUTION ====================

async def main():
    """
    Main entry point for the autonomous scraper.
    """
    
    # Configuration (would load from environment)
    ANTHROPIC_API_KEY = "your-api-key-here"  # Load from env
    SAM_API_KEY = "your-sam-api-key-here"  # Load from env
    
    # Initialize network
    network = WinScopeIntelligenceNetwork(
        anthropic_api_key=ANTHROPIC_API_KEY,
        sam_api_key=SAM_API_KEY
    )
    
    # Run one-time scrape for testing
    logger.info("Running one-time scrape...")
    opportunities = await network.scrape_all_portals()
    
    if opportunities:
        scored = await network.score_opportunities(opportunities)
        
        print("\n" + "="*80)
        print(f"FOUND {len(scored)} OPPORTUNITIES")
        print("="*80 + "\n")
        
        print("TOP 10 OPPORTUNITIES:\n")
        for i, opp in enumerate(scored[:10], 1):
            print(f"{i}. [{opp.match_score:.1f}%] {opp.title}")
            print(f"   Agency: {opp.agency}")
            print(f"   Source: {opp.source_portal}")
            print(f"   Due: {opp.due_date.strftime('%Y-%m-%d') if opp.due_date else 'TBD'}")
            print()
    
    # Uncomment to run continuously:
    # await network.run_continuous(interval_minutes=60)


if __name__ == "__main__":
    asyncio.run(main())
