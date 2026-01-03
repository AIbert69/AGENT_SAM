"""
WinScope API - Backend Service for Singh Automation Platform
=============================================================

This API integrates WinScope's autonomous intelligence into your existing frontend.
Deploy this alongside your Vercel app.

Endpoints:
- POST /api/scan-portals - Scan all portals for new opportunities
- POST /api/process-opportunity - Download docs and extract data for an opportunity
- POST /api/generate-rfq - Generate complete RFQ with real data
- GET /api/opportunities - Get all discovered opportunities
- GET /api/opportunity/:id - Get specific opportunity details

Author: Albert Mizuno
Date: December 2025
"""

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import asyncio
from datetime import datetime
import os

# Import WinScope components
import sys
sys.path.append(os.path.dirname(__file__))

# These will import from the WinScope files we created
try:
    from winscope_intelligence_network import WinScopeIntelligenceNetwork
    from winscope_document_intelligence import DocumentIntelligenceEngine
except ImportError:
    print("⚠️ WinScope modules not found - make sure winscope_*.py files are in same directory")

# Initialize FastAPI
app = FastAPI(title="WinScope API", version="1.0.0")

# CORS for your frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://singh-automation.vercel.app",
        "http://localhost:3000",
        "http://localhost:8080"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API Keys from environment
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
SAM_API_KEY = os.getenv("SAM_GOV_API_KEY", "")

# Initialize WinScope engines
intelligence_network = WinScopeIntelligenceNetwork(
    anthropic_api_key=ANTHROPIC_API_KEY,
    sam_api_key=SAM_API_KEY
)

document_engine = DocumentIntelligenceEngine(
    anthropic_api_key=ANTHROPIC_API_KEY
)

# In-memory cache (would use Redis in production)
opportunities_cache = {}
processing_status = {}


# ==================== DATA MODELS ====================

class ScanRequest(BaseModel):
    portals: Optional[List[str]] = None  # If None, scan all
    naics_codes: Optional[List[str]] = None
    keywords: Optional[List[str]] = None


class ProcessOpportunityRequest(BaseModel):
    opportunity_id: str
    source_url: str
    title: str
    agency: str


class GenerateRFQRequest(BaseModel):
    opportunity_id: str
    solicitation_package_data: Optional[Dict[str, Any]] = None


# ==================== API ENDPOINTS ====================

@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "online",
        "service": "WinScope API",
        "version": "1.0.0",
        "portals_monitored": len(intelligence_network.portals),
        "backend_status": "connected" if ANTHROPIC_API_KEY else "missing_api_key"
    }


@app.post("/api/scan-portals")
async def scan_portals(request: ScanRequest, background_tasks: BackgroundTasks):
    """
    Scan procurement portals for new opportunities.
    Your frontend calls this when user clicks "Scan Live Data"
    """
    
    if not ANTHROPIC_API_KEY:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not configured")
    
    # Create scan job
    job_id = f"scan_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    processing_status[job_id] = {
        "status": "scanning",
        "started_at": datetime.now().isoformat(),
        "portals_scanned": 0,
        "opportunities_found": 0
    }
    
    # Run scan in background
    background_tasks.add_task(run_portal_scan, job_id, request)
    
    return {
        "job_id": job_id,
        "status": "started",
        "message": "Portal scan initiated. Use /api/scan-status/{job_id} to check progress."
    }


async def run_portal_scan(job_id: str, request: ScanRequest):
    """Background task to scan portals"""
    
    try:
        # Scan all portals
        opportunities = await intelligence_network.scrape_all_portals()
        
        # Score opportunities
        scored_opportunities = await intelligence_network.score_opportunities(opportunities)
        
        # Filter by minimum score
        qualified = [opp for opp in scored_opportunities if opp.match_score >= 50.0]
        
        # Cache results
        for opp in qualified:
            opportunities_cache[opp.id] = {
                "id": opp.id,
                "solicitation_number": opp.solicitation_number,
                "source_portal": opp.source_portal,
                "title": opp.title,
                "agency": opp.agency,
                "description": opp.description,
                "naics_codes": opp.naics_codes,
                "posted_date": opp.posted_date.isoformat() if opp.posted_date else None,
                "due_date": opp.due_date.isoformat() if opp.due_date else None,
                "estimated_value": opp.estimated_value,
                "set_aside": opp.set_aside,
                "location": opp.location,
                "match_score": round(opp.match_score, 1),
                "win_probability": round(opp.win_probability, 1),
                "source_url": opp.raw_data.get('url', '') if opp.raw_data else ''
            }
        
        # Update status
        processing_status[job_id] = {
            "status": "completed",
            "started_at": processing_status[job_id]["started_at"],
            "completed_at": datetime.now().isoformat(),
            "portals_scanned": len(intelligence_network.portals),
            "opportunities_found": len(qualified),
            "total_scanned": len(opportunities)
        }
        
    except Exception as e:
        processing_status[job_id] = {
            "status": "failed",
            "error": str(e),
            "started_at": processing_status[job_id]["started_at"],
            "failed_at": datetime.now().isoformat()
        }


@app.get("/api/scan-status/{job_id}")
async def get_scan_status(job_id: str):
    """Check status of a portal scan job"""
    
    if job_id not in processing_status:
        raise HTTPException(status_code=404, detail="Job not found")
    
    return processing_status[job_id]


@app.get("/api/opportunities")
async def get_opportunities(
    min_score: Optional[float] = 50.0,
    portal: Optional[str] = None,
    limit: Optional[int] = 100
):
    """
    Get all discovered opportunities.
    Your frontend calls this to populate the opportunity list.
    """
    
    opportunities = list(opportunities_cache.values())
    
    # Filter by score
    opportunities = [opp for opp in opportunities if opp['match_score'] >= min_score]
    
    # Filter by portal if specified
    if portal:
        opportunities = [opp for opp in opportunities if opp['source_portal'] == portal]
    
    # Sort by match score (descending)
    opportunities.sort(key=lambda x: x['match_score'], reverse=True)
    
    # Limit results
    opportunities = opportunities[:limit]
    
    return {
        "total": len(opportunities),
        "opportunities": opportunities
    }


@app.get("/api/opportunity/{opportunity_id}")
async def get_opportunity(opportunity_id: str):
    """Get detailed information about a specific opportunity"""
    
    if opportunity_id not in opportunities_cache:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    
    return opportunities_cache[opportunity_id]


@app.post("/api/process-opportunity")
async def process_opportunity(request: ProcessOpportunityRequest, background_tasks: BackgroundTasks):
    """
    Process an opportunity: download docs, extract data.
    Your frontend calls this when user clicks "Request Distributor Quote"
    """
    
    if not ANTHROPIC_API_KEY:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not configured")
    
    # Create processing job
    job_id = f"process_{request.opportunity_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    processing_status[job_id] = {
        "status": "processing",
        "opportunity_id": request.opportunity_id,
        "started_at": datetime.now().isoformat(),
        "stage": "downloading_documents"
    }
    
    # Run processing in background
    background_tasks.add_task(run_opportunity_processing, job_id, request)
    
    return {
        "job_id": job_id,
        "status": "started",
        "message": "Document processing initiated."
    }


async def run_opportunity_processing(job_id: str, request: ProcessOpportunityRequest):
    """Background task to process opportunity documents"""
    
    try:
        # Process solicitation
        package = await document_engine.process_solicitation(
            opportunity_url=request.source_url,
            solicitation_id=request.opportunity_id,
            title=request.title,
            agency=request.agency
        )
        
        # Store processed data
        opportunities_cache[request.opportunity_id]["processed_data"] = {
            "line_items": [
                {
                    "item_number": item.item_number,
                    "description": item.description,
                    "quantity": item.quantity,
                    "unit": item.unit,
                    "part_number": item.part_number,
                    "manufacturer": item.manufacturer,
                    "estimated_price": item.estimated_price,
                    "item_type": item.item_type,
                    "sourcing_type": item.sourcing_type,
                    "suggested_product": item.suggested_product,
                    "notes": item.notes
                }
                for item in package.line_items
            ],
            "delivery_location": package.delivery_location,
            "payment_terms": package.payment_terms,
            "technical_requirements": package.technical_requirements,
            "evaluation_criteria": package.evaluation_criteria,
            "extraction_confidence": package.extraction_confidence
        }
        
        # Update status
        processing_status[job_id] = {
            "status": "completed",
            "opportunity_id": request.opportunity_id,
            "started_at": processing_status[job_id]["started_at"],
            "completed_at": datetime.now().isoformat(),
            "line_items_extracted": len(package.line_items),
            "confidence": package.extraction_confidence
        }
        
    except Exception as e:
        processing_status[job_id] = {
            "status": "failed",
            "error": str(e),
            "opportunity_id": request.opportunity_id,
            "started_at": processing_status[job_id]["started_at"],
            "failed_at": datetime.now().isoformat()
        }


@app.post("/api/generate-rfq")
async def generate_rfq(request: GenerateRFQRequest):
    """
    Generate complete RFQ document.
    Your frontend calls this after opportunity is processed.
    """
    
    # Get opportunity data
    if request.opportunity_id not in opportunities_cache:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    
    opp_data = opportunities_cache[request.opportunity_id]
    
    # Check if processed
    if "processed_data" not in opp_data:
        raise HTTPException(
            status_code=400, 
            detail="Opportunity not yet processed. Call /api/process-opportunity first."
        )
    
    # Create mock package object for RFQ generation
    from winscope_document_intelligence import SolicitationPackage, LineItem
    
    package = SolicitationPackage(
        solicitation_id=opp_data["solicitation_number"],
        title=opp_data["title"],
        agency=opp_data["agency"],
        due_date=datetime.fromisoformat(opp_data["due_date"]) if opp_data.get("due_date") else None,
        line_items=[
            LineItem(**item) for item in opp_data["processed_data"]["line_items"]
        ],
        delivery_location=opp_data["processed_data"].get("delivery_location"),
        payment_terms=opp_data["processed_data"].get("payment_terms"),
        technical_requirements=opp_data["processed_data"].get("technical_requirements", []),
        evaluation_criteria=opp_data["processed_data"].get("evaluation_criteria", {})
    )
    
    # Generate RFQ
    rfq_text = document_engine.generate_rfq_document(package)
    
    return {
        "opportunity_id": request.opportunity_id,
        "rfq_document": rfq_text,
        "fulfillment_confidence": opp_data["processed_data"].get("extraction_confidence", 0),
        "line_items_count": len(package.line_items),
        "generated_at": datetime.now().isoformat()
    }


@app.get("/api/stats")
async def get_stats():
    """Get platform statistics"""
    
    total_opportunities = len(opportunities_cache)
    high_score = len([opp for opp in opportunities_cache.values() if opp['match_score'] >= 80])
    qualified = len([opp for opp in opportunities_cache.values() if opp['match_score'] >= 65])
    
    return {
        "total_opportunities": total_opportunities,
        "high_score_count": high_score,
        "qualified_count": qualified,
        "portals_monitored": len(intelligence_network.portals),
        "backend_status": "connected"
    }


# ==================== STARTUP ====================

@app.on_event("startup")
async def startup_event():
    """Initialize on startup"""
    print("🚀 WinScope API Starting...")
    print(f"   Anthropic API: {'✓ Configured' if ANTHROPIC_API_KEY else '✗ Missing'}")
    print(f"   SAM.gov API: {'✓ Configured' if SAM_API_KEY else '✗ Missing'}")
    print(f"   Portals Monitored: {len(intelligence_network.portals)}")
    print("✅ WinScope API Ready")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
