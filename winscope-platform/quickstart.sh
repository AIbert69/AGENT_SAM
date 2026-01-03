#!/bin/bash

# WinScope Platform - Quick Start Deployment Script
# This script sets up the complete WinScope autonomous intelligence system

set -e  # Exit on error

echo "═══════════════════════════════════════════════════════════════"
echo "          WinScope Autonomous Intelligence Platform"
echo "                   Quick Start Deployment"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    print_error "Please do not run this script as root"
    exit 1
fi

# Check Python version
echo "Checking Python version..."
if ! command -v python3 &> /dev/null; then
    print_error "Python 3 is not installed. Please install Python 3.10 or higher."
    exit 1
fi

PYTHON_VERSION=$(python3 --version | awk '{print $2}')
print_status "Python version: $PYTHON_VERSION"

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo ""
    echo "Creating virtual environment..."
    python3 -m venv venv
    print_status "Virtual environment created"
fi

# Activate virtual environment
echo ""
echo "Activating virtual environment..."
source venv/bin/activate
print_status "Virtual environment activated"

# Upgrade pip
echo ""
echo "Upgrading pip..."
pip install --quiet --upgrade pip
print_status "pip upgraded"

# Install dependencies
echo ""
echo "Installing Python dependencies..."
echo "(This may take a few minutes...)"
pip install --quiet -r requirements.txt
print_status "Dependencies installed"

# Install Playwright browsers
echo ""
echo "Installing Playwright browsers..."
playwright install chromium
print_status "Playwright browsers installed"

# Create directory structure
echo ""
echo "Creating directory structure..."
mkdir -p data
mkdir -p downloads
mkdir -p outputs/rfqs
mkdir -p outputs/proposals
mkdir -p logs
mkdir -p templates
print_status "Directories created"

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    echo ""
    echo "Creating .env configuration file..."
    
    cat > .env << 'EOF'
# WinScope Platform Configuration
# IMPORTANT: Replace placeholder values with your actual API keys

# ========== API KEYS ==========
# Get your Anthropic API key from: https://console.anthropic.com
ANTHROPIC_API_KEY=your-anthropic-key-here

# Get your SAM.gov API key from: https://sam.gov/data-services
SAM_GOV_API_KEY=your-sam-api-key-here

# ========== DATABASE ==========
DATABASE_PATH=data/opportunities.db
LEARNING_DB_PATH=data/learning.db

# ========== CONFIGURATION ==========
# Minimum match score to qualify an opportunity (0-100)
MIN_MATCH_SCORE=50.0

# Score above which to automatically process opportunities
AUTO_PROCESS_THRESHOLD=80.0

# How often to scrape portals (in minutes)
SCRAPE_INTERVAL_MINUTES=60

# Maximum opportunities to process concurrently
MAX_CONCURRENT_PROCESSING=5

# ========== COMPANY PROFILE ==========
COMPANY_NAME=Singh Automation
COMPANY_UEI=GJ1DPYQ3X8K5
COMPANY_CAGE=86VF7
COMPANY_CONTACT=Albert Mizuno
COMPANY_PHONE=786-344-8955
COMPANY_EMAIL=albert@singhautomation.com

# ========== NAICS CODES ==========
# Comma-separated list of your NAICS codes
NAICS_CODES=333249,541330,541512,541715,237130,333922

# ========== NOTIFICATIONS (Optional) ==========
# SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
# EMAIL_NOTIFICATIONS=true
# EMAIL_RECIPIENTS=albert@singhautomation.com
# EMAIL_SMTP_HOST=smtp.gmail.com
# EMAIL_SMTP_PORT=587
# EMAIL_SMTP_USER=your-email@gmail.com
# EMAIL_SMTP_PASSWORD=your-app-password

# ========== LOGGING ==========
LOG_LEVEL=INFO
LOG_FILE=logs/winscope.log
EOF

    print_status ".env file created"
    print_warning "IMPORTANT: Edit .env file and add your API keys!"
    echo ""
    echo "To get API keys:"
    echo "  1. Anthropic: https://console.anthropic.com"
    echo "  2. SAM.gov: https://sam.gov/data-services (free registration)"
fi

# Initialize databases
echo ""
echo "Initializing databases..."
python3 << 'PYTHON'
import sqlite3
from pathlib import Path

# Create data directory
Path("data").mkdir(exist_ok=True)

# Initialize opportunities database
with sqlite3.connect("data/opportunities.db") as conn:
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

# Initialize learning database
with sqlite3.connect("data/learning.db") as conn:
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

print("✓ Databases initialized")
PYTHON

print_status "Databases initialized"

# Create systemd service file (optional)
if command -v systemctl &> /dev/null; then
    echo ""
    echo "Creating systemd service file..."
    
    CURRENT_DIR=$(pwd)
    PYTHON_PATH=$(which python3)
    
    sudo tee /etc/systemd/system/winscope.service > /dev/null << EOF
[Unit]
Description=WinScope Autonomous Intelligence Platform
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$CURRENT_DIR
Environment="PATH=$CURRENT_DIR/venv/bin"
ExecStart=$CURRENT_DIR/venv/bin/python3 $CURRENT_DIR/winscope_master_orchestrator.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
    
    sudo systemctl daemon-reload
    print_status "Systemd service created"
    echo ""
    echo "To start WinScope as a system service:"
    echo "  sudo systemctl start winscope"
    echo "  sudo systemctl enable winscope  # Auto-start on boot"
fi

# Success message
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo -e "${GREEN}✓ WinScope Platform Setup Complete!${NC}"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Next Steps:"
echo ""
echo "1. Configure your API keys:"
echo "   nano .env"
echo ""
echo "2. Test the scraper network:"
echo "   python3 winscope_intelligence_network.py"
echo ""
echo "3. Test document processing:"
echo "   python3 winscope_document_intelligence.py"
echo ""
echo "4. Run the full autonomous system:"
echo "   python3 winscope_master_orchestrator.py"
echo ""
echo "5. (Optional) Run as a background service:"
echo "   sudo systemctl start winscope"
echo ""
echo "Documentation: README.md"
echo "Support: albert@singhautomation.com"
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo ""
