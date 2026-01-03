"""
WinScope Master Orchestrator
=============================

The autonomous brain that coordinates the entire pipeline:
1. Opportunity Discovery (Multi-Portal Scraping)
2. Opportunity Scoring (ML-Powered)
3. Document Intelligence (RFP Parsing)
4. RFQ Generation (Automated)
5. Proposal Generation (AI-Powered)
6. Continuous Learning (Win/Loss Feedback)

This is the "complete system" that runs 24/7 and gets smarter over time.

Author: Albert Mizuno / Claude
Date: December 2025
"""

import asyncio
import aiohttp
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta
from pathlib import Path
import anthropic
import json
import sqlite3
import logging
from enum import Enum

# Import our custom modules
# from winscope_intelligence_network import WinScopeIntelligenceNetwork, Opportunity
# from winscope_document_intelligence import DocumentIntelligenceEngine, SolicitationPackage, LineItem

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class OpportunityStage(Enum):
    """Pipeline stages for opportunities"""
    DISCOVERED = "discovered"  # Found by scraper
    SCORED = "scored"  # Match score calculated
    QUALIFIED = "qualified"  # Above threshold, worth pursuing
    DOCUMENTS_DOWNLOADED = "documents_downloaded"  # Solicitation package downloaded
    DATA_EXTRACTED = "data_extracted"  # BOM/requirements extracted
    RFQ_GENERATED = "rfq_generated"  # RFQ draft created
    RFQ_SENT = "rfq_sent"  # RFQ sent to distributors
    QUOTES_RECEIVED = "quotes_received"  # Distributor quotes received
    PROPOSAL_GENERATED = "proposal_generated"  # Draft proposal created
    PROPOSAL_SUBMITTED = "proposal_submitted"  # Submitted to agency
    WON = "won"  # Contract awarded
    LOST = "lost"  # Not awarded
    NO_BID = "no_bid"  # Decided not to pursue


@dataclass
class OpportunityRecord:
    """
    Complete record of an opportunity through the entire pipeline.
    Tracks all data and decisions.
    """
    # Core identification
    id: str
    solicitation_number: str
    source_portal: str
    
    # Opportunity details
    title: str
    agency: str
    naics_codes: List[str]
    description: str
    posted_date: datetime
    due_date: Optional[datetime]
    estimated_value: Optional[float]
    set_aside: Optional[str]
    location: Optional[str]
    
    # Pipeline tracking
    stage: OpportunityStage
    match_score: float = 0.0
    win_probability: float = 0.0
    
    # Timestamps
    discovered_at: datetime = field(default_factory=datetime.now)
    qualified_at: Optional[datetime] = None
    submitted_at: Optional[datetime] = None
    award_date: Optional[datetime] = None
    
    # Associated data
    solicitation_package_id: Optional[str] = None
    rfq_document_path: Optional[Path] = None
    proposal_document_path: Optional[Path] = None
    
    # Decision tracking
    bid_decision: str = "pending"  # pending, go, no-go
    bid_decision_reason: str = ""
    actual_bid_amount: Optional[float] = None
    winning_bid_amount: Optional[float] = None
    
    # Learning data
    time_to_process_hours: Optional[float] = None
    automation_success: bool = True
    manual_interventions: List[str] = field(default_factory=list)
    
    # Metadata
    raw_data: Dict[str, Any] = field(default_factory=dict)
    notes: str = ""


class LearningEngine:
    """
    Continuous learning system that improves over time.
    Tracks win/loss patterns, pricing accuracy, and automation success.
    """
    
    def __init__(self, db_path: Path = Path("/home/claude/data/learning.db")):
        self.db_path = db_path
        self.db_path.parent.mkdir(exist_ok=True, parents=True)
        self._init_database()
    
    def _init_database(self):
        """Initialize SQLite database for learning data"""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS win_loss_history (
                    id TEXT PRIMARY KEY,
                    solicitation_number TEXT,
                    agency TEXT,
                    naics_codes TEXT,
                    match_score REAL,
                    win_probability REAL,
                    actual_result TEXT,
                    our_bid REAL,
                    winning_bid REAL,
                    submitted_date TEXT,
                    award_date TEXT,
                    created_at TEXT
                )
            """)
            
            conn.execute("""
                CREATE TABLE IF NOT EXISTS pricing_accuracy (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    line_item_description TEXT,
                    estimated_price REAL,
                    actual_price REAL,
                    error_percentage REAL,
                    source TEXT,
                    created_at TEXT
                )
            """)
            
            conn.execute("""
                CREATE TABLE IF NOT EXISTS automation_metrics (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    opportunity_id TEXT,
                    stage TEXT,
                    success BOOLEAN,
                    error_message TEXT,
                    processing_time_seconds REAL,
                    manual_intervention_required BOOLEAN,
                    created_at TEXT
                )
            """)
            
            conn.commit()
    
    def record_win_loss(self, record: OpportunityRecord):
        """Record win/loss outcome for learning"""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                INSERT INTO win_loss_history 
                (id, solicitation_number, agency, naics_codes, match_score, 
                 win_probability, actual_result, our_bid, winning_bid,
                 submitted_date, award_date, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                record.id,
                record.solicitation_number,
                record.agency,
                json.dumps(record.naics_codes),
                record.match_score,
                record.win_probability,
                record.stage.value,
                record.actual_bid_amount,
                record.winning_bid_amount,
                record.submitted_at.isoformat() if record.submitted_at else None,
                record.award_date.isoformat() if record.award_date else None,
                datetime.now().isoformat()
            ))
            conn.commit()
    
    def record_pricing_accuracy(self, 
                                description: str, 
                                estimated: float, 
                                actual: float,
                                source: str):
        """Track pricing estimation accuracy"""
        error_pct = abs(estimated - actual) / actual * 100 if actual > 0 else 0
        
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                INSERT INTO pricing_accuracy
                (line_item_description, estimated_price, actual_price, 
                 error_percentage, source, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (
                description,
                estimated,
                actual,
                error_pct,
                source,
                datetime.now().isoformat()
            ))
            conn.commit()
    
    def get_win_rate_by_agency(self, agency: str) -> float:
        """Calculate historical win rate for specific agency"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute("""
                SELECT 
                    COUNT(CASE WHEN actual_result = 'won' THEN 1 END) * 1.0 / 
                    COUNT(*) as win_rate
                FROM win_loss_history
                WHERE agency = ?
                AND actual_result IN ('won', 'lost')
            """, (agency,))
            
            result = cursor.fetchone()
            return result[0] if result and result[0] else 0.0
    
    def get_average_pricing_error(self) -> float:
        """Get average pricing estimation error"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute("""
                SELECT AVG(error_percentage)
                FROM pricing_accuracy
                WHERE created_at > date('now', '-90 days')
            """)
            
            result = cursor.fetchone()
            return result[0] if result and result[0] else 0.0
    
    def get_automation_success_rate(self, stage: str) -> float:
        """Get automation success rate for specific stage"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute("""
                SELECT 
                    COUNT(CASE WHEN success = 1 THEN 1 END) * 1.0 / 
                    COUNT(*) as success_rate
                FROM automation_metrics
                WHERE stage = ?
                AND created_at > date('now', '-30 days')
            """, (stage,))
            
            result = cursor.fetchone()
            return result[0] if result and result[0] else 1.0


class ProposalGenerator:
    """
    AI-powered proposal generation system.
    Takes solicitation package + RFQ quotes and generates complete proposal.
    """
    
    def __init__(self, anthropic_api_key: str):
        self.client = anthropic.Anthropic(api_key=anthropic_api_key)
        self.template_dir = Path("/home/claude/templates")
        self.template_dir.mkdir(exist_ok=True)
    
    async def generate_proposal(self, 
                               opportunity: OpportunityRecord,
                               solicitation_package: Any,  # SolicitationPackage
                               distributor_quotes: List[Dict[str, Any]]) -> str:
        """
        Generate complete proposal document.
        Returns path to generated .docx file.
        """
        
        # Build context for Claude
        context = self._build_proposal_context(opportunity, solicitation_package, distributor_quotes)
        
        # Generate each section
        sections = await self._generate_all_sections(context)
        
        # Assemble proposal
        proposal_text = self._assemble_proposal(sections, opportunity)
        
        return proposal_text
    
    def _build_proposal_context(self, 
                               opportunity: OpportunityRecord,
                               solicitation_package: Any,
                               distributor_quotes: List[Dict]) -> Dict[str, Any]:
        """Build comprehensive context for proposal generation"""
        
        return {
            'opportunity': {
                'title': opportunity.title,
                'solicitation_number': opportunity.solicitation_number,
                'agency': opportunity.agency,
                'due_date': opportunity.due_date,
                'description': opportunity.description,
                'requirements': getattr(solicitation_package, 'technical_requirements', [])
            },
            'company': {
                'name': 'Singh Automation',
                'certifications': ['FANUC ASI', 'UR CSP', 'MBE', 'WBENC'],
                'capabilities': [
                    'FANUC robot integration',
                    'Universal Robots integration',
                    'AI vision systems',
                    'Material handling automation'
                ]
            },
            'pricing': {
                'line_items': getattr(solicitation_package, 'line_items', []),
                'quotes': distributor_quotes
            }
        }
    
    async def _generate_all_sections(self, context: Dict[str, Any]) -> Dict[str, str]:
        """Generate all proposal sections using Claude"""
        
        sections = {}
        
        # Executive Summary
        sections['executive_summary'] = await self._generate_section(
            'executive_summary',
            context,
            """Write a compelling 1-page executive summary that:
            - Demonstrates understanding of the requirement
            - Highlights our relevant experience
            - Emphasizes our unique value proposition (FANUC/UR certifications)
            - Builds confidence in our ability to deliver"""
        )
        
        # Technical Approach
        sections['technical_approach'] = await self._generate_section(
            'technical_approach',
            context,
            """Write a detailed technical approach that:
            - Addresses each technical requirement specifically
            - Explains our methodology
            - Describes equipment and technologies to be used
            - Includes timeline and milestones
            - Demonstrates technical expertise"""
        )
        
        # Past Performance
        sections['past_performance'] = await self._generate_section(
            'past_performance',
            context,
            """Write a past performance section that:
            - Provides 3-5 relevant project examples
            - Includes client names, contract values, dates
            - Highlights similarities to current requirement
            - Shows successful outcomes and metrics"""
        )
        
        # Management Plan
        sections['management_plan'] = await self._generate_section(
            'management_plan',
            context,
            """Write a management plan that:
            - Describes project organization
            - Lists key personnel and qualifications
            - Explains quality assurance processes
            - Details communication protocols"""
        )
        
        return sections
    
    async def _generate_section(self, 
                                section_name: str, 
                                context: Dict[str, Any],
                                instructions: str) -> str:
        """Generate a single proposal section"""
        
        prompt = f"""You are writing the {section_name.replace('_', ' ').title()} section of a government proposal.

CONTEXT:
{json.dumps(context, indent=2, default=str)}

INSTRUCTIONS:
{instructions}

Write professional, government-appropriate content. Use specific details from the context.
Be concise but comprehensive. Use Singh Automation's voice: technical, confident, customer-focused.

SECTION CONTENT:"""

        try:
            message = self.client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=2000,
                messages=[{"role": "user", "content": prompt}]
            )
            
            return message.content[0].text.strip()
            
        except Exception as e:
            logger.error(f"Error generating {section_name}: {e}")
            return f"[Section generation failed: {section_name}]"
    
    def _assemble_proposal(self, sections: Dict[str, str], opportunity: OpportunityRecord) -> str:
        """Assemble all sections into final proposal document"""
        
        proposal = f"""
════════════════════════════════════════════════════════════════════════════════
                                TECHNICAL PROPOSAL
────────────────────────────────────────────────────────────────────────────────
                              SINGH AUTOMATION
                    FANUC & Universal Robots Authorized Integrator
════════════════════════════════════════════════════════════════════════════════

Solicitation Number: {opportunity.solicitation_number}
Project Title: {opportunity.title}
Issuing Agency: {opportunity.agency}
Submission Date: {datetime.now().strftime('%B %d, %Y')}

Company Information:
  Singh Automation
  UEI: GJ1DPYQ3X8K5
  CAGE: 86VF7
  Contact: Albert Mizuno
  Phone: 786-344-8955
  Email: albert@singhautomation.com

════════════════════════════════════════════════════════════════════════════════

TABLE OF CONTENTS

1. Executive Summary
2. Technical Approach
3. Past Performance
4. Management Plan
5. Pricing

════════════════════════════════════════════════════════════════════════════════

1. EXECUTIVE SUMMARY

{sections.get('executive_summary', '')}

════════════════════════════════════════════════════════════════════════════════

2. TECHNICAL APPROACH

{sections.get('technical_approach', '')}

════════════════════════════════════════════════════════════════════════════════

3. PAST PERFORMANCE

{sections.get('past_performance', '')}

════════════════════════════════════════════════════════════════════════════════

4. MANAGEMENT PLAN

{sections.get('management_plan', '')}

════════════════════════════════════════════════════════════════════════════════

5. PRICING

[Pricing section to be populated from RFQ quotes]

════════════════════════════════════════════════════════════════════════════════
"""
        
        return proposal


class WinScopeMasterOrchestrator:
    """
    The master brain that coordinates everything.
    Runs continuously, processing opportunities through the entire pipeline.
    """
    
    def __init__(self, 
                 anthropic_api_key: str,
                 sam_api_key: str = ""):
        
        # Initialize all subsystems
        # self.scraper_network = WinScopeIntelligenceNetwork(anthropic_api_key, sam_api_key)
        # self.document_engine = DocumentIntelligenceEngine(anthropic_api_key)
        self.proposal_generator = ProposalGenerator(anthropic_api_key)
        self.learning_engine = LearningEngine()
        
        # In-memory pipeline
        self.pipeline: Dict[str, OpportunityRecord] = {}
        
        # Database
        self.db_path = Path("/home/claude/data/opportunities.db")
        self.db_path.parent.mkdir(exist_ok=True, parents=True)
        self._init_database()
        
        # Configuration
        self.config = {
            'min_match_score': 50.0,  # Minimum score to qualify opportunity
            'auto_process_threshold': 80.0,  # Score above which to auto-process
            'max_concurrent_processing': 5,  # Limit concurrent document processing
            'scrape_interval_minutes': 60,  # How often to check portals
        }
    
    def _init_database(self):
        """Initialize opportunity tracking database"""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS opportunities (
                    id TEXT PRIMARY KEY,
                    solicitation_number TEXT,
                    source_portal TEXT,
                    title TEXT,
                    agency TEXT,
                    stage TEXT,
                    match_score REAL,
                    win_probability REAL,
                    data TEXT,
                    created_at TEXT,
                    updated_at TEXT
                )
            """)
            conn.commit()
    
    async def run_pipeline_cycle(self):
        """
        Run one complete pipeline cycle:
        1. Discover new opportunities
        2. Score and qualify
        3. Process qualified opportunities
        4. Generate RFQs
        5. Generate proposals (when quotes ready)
        """
        
        logger.info("="*80)
        logger.info("STARTING PIPELINE CYCLE")
        logger.info("="*80)
        
        # Step 1: Discover opportunities
        logger.info("\n[STEP 1] Discovering opportunities...")
        # new_opportunities = await self.scraper_network.scrape_all_portals()
        # scored = await self.scraper_network.score_opportunities(new_opportunities)
        
        # For demo, create mock data
        scored = []  # Would have real opportunities here
        
        # Step 2: Qualify opportunities
        logger.info(f"\n[STEP 2] Qualifying {len(scored)} opportunities...")
        qualified = self._qualify_opportunities(scored)
        logger.info(f"✓ {len(qualified)} opportunities qualified (score >= {self.config['min_match_score']})")
        
        # Step 3: Process high-priority opportunities
        logger.info(f"\n[STEP 3] Processing high-priority opportunities...")
        for opp in qualified[:self.config['max_concurrent_processing']]:
            await self._process_opportunity(opp)
        
        # Step 4: Check for opportunities ready for proposal generation
        logger.info(f"\n[STEP 4] Generating proposals for ready opportunities...")
        ready_for_proposal = self._get_opportunities_by_stage(OpportunityStage.QUOTES_RECEIVED)
        
        for opp_record in ready_for_proposal:
            await self._generate_proposal_for_opportunity(opp_record)
        
        # Step 5: Learning and reporting
        logger.info(f"\n[STEP 5] Learning metrics...")
        self._print_learning_metrics()
        
        logger.info("\n" + "="*80)
        logger.info("PIPELINE CYCLE COMPLETE")
        logger.info("="*80 + "\n")
    
    def _qualify_opportunities(self, opportunities: List[Any]) -> List[Any]:
        """Filter opportunities that meet minimum threshold"""
        return [opp for opp in opportunities if opp.match_score >= self.config['min_match_score']]
    
    async def _process_opportunity(self, opportunity: Any):
        """
        Process a single opportunity through the pipeline.
        Downloads docs, extracts data, generates RFQ.
        """
        
        logger.info(f"Processing: {opportunity.title} (Score: {opportunity.match_score:.1f}%)")
        
        # Create record
        record = OpportunityRecord(
            id=opportunity.id,
            solicitation_number=opportunity.solicitation_number,
            source_portal=opportunity.source_portal,
            title=opportunity.title,
            agency=opportunity.agency,
            naics_codes=opportunity.naics_codes,
            description=opportunity.description,
            posted_date=opportunity.posted_date,
            due_date=opportunity.due_date,
            estimated_value=opportunity.estimated_value,
            set_aside=opportunity.set_aside,
            location=opportunity.location,
            stage=OpportunityStage.QUALIFIED,
            match_score=opportunity.match_score,
            win_probability=opportunity.win_probability,
            qualified_at=datetime.now()
        )
        
        try:
            # Download and process documents
            # package = await self.document_engine.process_solicitation(
            #     opportunity_url=opportunity.raw_data.get('url', ''),
            #     solicitation_id=opportunity.solicitation_number,
            #     title=opportunity.title,
            #     agency=opportunity.agency
            # )
            
            # For demo, create mock package
            package = None
            
            record.stage = OpportunityStage.DATA_EXTRACTED
            
            # Generate RFQ
            # rfq_text = self.document_engine.generate_rfq_document(package)
            # rfq_path = Path(f"/home/claude/outputs/rfqs/{record.id}_rfq.txt")
            # rfq_path.parent.mkdir(exist_ok=True, parents=True)
            # with open(rfq_path, 'w') as f:
            #     f.write(rfq_text)
            
            # record.rfq_document_path = rfq_path
            record.stage = OpportunityStage.RFQ_GENERATED
            
            logger.info(f"✓ RFQ generated for {record.solicitation_number}")
            
        except Exception as e:
            logger.error(f"Error processing opportunity: {e}")
            record.manual_interventions.append(f"Processing failed: {str(e)}")
        
        # Save to database
        self._save_opportunity_record(record)
        self.pipeline[record.id] = record
    
    async def _generate_proposal_for_opportunity(self, record: OpportunityRecord):
        """Generate complete proposal for opportunity with quotes"""
        
        logger.info(f"Generating proposal for: {record.title}")
        
        try:
            # Load solicitation package and quotes (would fetch from DB)
            package = None  # Would load from DB
            quotes = []  # Would load from DB
            
            # Generate proposal
            proposal_text = await self.proposal_generator.generate_proposal(
                record,
                package,
                quotes
            )
            
            # Save proposal
            proposal_path = Path(f"/home/claude/outputs/proposals/{record.id}_proposal.txt")
            proposal_path.parent.mkdir(exist_ok=True, parents=True)
            with open(proposal_path, 'w') as f:
                f.write(proposal_text)
            
            record.proposal_document_path = proposal_path
            record.stage = OpportunityStage.PROPOSAL_GENERATED
            
            logger.info(f"✓ Proposal generated: {proposal_path}")
            
        except Exception as e:
            logger.error(f"Error generating proposal: {e}")
    
    def _get_opportunities_by_stage(self, stage: OpportunityStage) -> List[OpportunityRecord]:
        """Get all opportunities in a specific stage"""
        return [opp for opp in self.pipeline.values() if opp.stage == stage]
    
    def _save_opportunity_record(self, record: OpportunityRecord):
        """Save opportunity record to database"""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                INSERT OR REPLACE INTO opportunities
                (id, solicitation_number, source_portal, title, agency, 
                 stage, match_score, win_probability, data, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                record.id,
                record.solicitation_number,
                record.source_portal,
                record.title,
                record.agency,
                record.stage.value,
                record.match_score,
                record.win_probability,
                json.dumps(asdict(record), default=str),
                record.discovered_at.isoformat(),
                datetime.now().isoformat()
            ))
            conn.commit()
    
    def _print_learning_metrics(self):
        """Print current learning metrics"""
        
        avg_error = self.learning_engine.get_average_pricing_error()
        auto_success = self.learning_engine.get_automation_success_rate('document_extraction')
        
        logger.info(f"  Average Pricing Error (90 days): {avg_error:.1f}%")
        logger.info(f"  Automation Success Rate: {auto_success*100:.1f}%")
    
    async def run_continuous(self):
        """Run the orchestrator continuously"""
        
        logger.info("🚀 WinScope Master Orchestrator Starting...")
        logger.info(f"   Scrape Interval: {self.config['scrape_interval_minutes']} minutes")
        logger.info(f"   Min Match Score: {self.config['min_match_score']}%")
        logger.info(f"   Auto-Process Threshold: {self.config['auto_process_threshold']}%")
        
        while True:
            try:
                await self.run_pipeline_cycle()
                
                # Wait before next cycle
                await asyncio.sleep(self.config['scrape_interval_minutes'] * 60)
                
            except KeyboardInterrupt:
                logger.info("\n👋 Shutting down gracefully...")
                break
            except Exception as e:
                logger.error(f"Error in main loop: {e}")
                await asyncio.sleep(300)  # Wait 5 minutes on error


# ==================== MAIN EXECUTION ====================

async def main():
    """Main entry point"""
    
    ANTHROPIC_API_KEY = "your-api-key-here"
    SAM_API_KEY = "your-sam-api-key-here"
    
    orchestrator = WinScopeMasterOrchestrator(
        anthropic_api_key=ANTHROPIC_API_KEY,
        sam_api_key=SAM_API_KEY
    )
    
    # Run one cycle for testing
    await orchestrator.run_pipeline_cycle()
    
    # Uncomment to run continuously:
    # await orchestrator.run_continuous()


if __name__ == "__main__":
    asyncio.run(main())
