#!/bin/bash

# WinScope Integration Deployment Script
# ========================================
# This script automates the integration of WinScope into your existing platform
#
# Usage: bash deploy-winscope.sh
#
# What it does:
# 1. Creates winscope directory in your repo
# 2. Sets up Python environment
# 3. Installs dependencies
# 4. Configures environment variables
# 5. Starts WinScope API server
#
# Author: Albert Mizuno
# Date: December 2025

set -e  # Exit on error

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}"
echo "╔══════════════════════════════════════════════════════════╗"
echo "║      WinScope Integration Deployment                    ║"
echo "║      Adding AI Intelligence to Singh Automation         ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check if we're in the right directory
if [ ! -d ".git" ]; then
    echo -e "${RED}Error: Not in a git repository root.${NC}"
    echo "Please cd to your Singh_Automation_Agent directory first."
    exit 1
fi

# Create winscope directory
echo -e "${GREEN}📁 Creating winscope directory...${NC}"
mkdir -p winscope
cd winscope

# Check if Python 3 is installed
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}Error: Python 3 is not installed.${NC}"
    echo "Please install Python 3.10 or higher first."
    exit 1
fi

PYTHON_VERSION=$(python3 --version | awk '{print $2}')
echo -e "${GREEN}✓ Python version: $PYTHON_VERSION${NC}"

# Create virtual environment
if [ ! -d "venv" ]; then
    echo -e "${GREEN}🔧 Creating Python virtual environment...${NC}"
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Upgrade pip
echo -e "${GREEN}📦 Upgrading pip...${NC}"
pip install --quiet --upgrade pip

# Check if requirements.txt exists
if [ ! -f "requirements.txt" ]; then
    echo -e "${YELLOW}⚠️  requirements.txt not found in winscope directory.${NC}"
    echo "Please copy the WinScope files to this directory first:"
    echo "  - winscope_api.py"
    echo "  - winscope_intelligence_network.py"
    echo "  - winscope_document_intelligence.py"
    echo "  - winscope_master_orchestrator.py"
    echo "  - requirements.txt"
    echo ""
    echo "Then run this script again."
    exit 1
fi

# Install Python dependencies
echo -e "${GREEN}📦 Installing Python dependencies...${NC}"
echo "(This may take a few minutes...)"
pip install --quiet -r requirements.txt

# Install Playwright browsers
echo -e "${GREEN}🌐 Installing Playwright browsers...${NC}"
playwright install chromium

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    echo -e "${GREEN}⚙️  Creating .env configuration file...${NC}"
    
    cat > .env << 'EOF'
# WinScope Configuration
# IMPORTANT: Add your actual API keys below

# API Keys
ANTHROPIC_API_KEY=your-anthropic-key-here
SAM_GOV_API_KEY=your-sam-api-key-here

# Company Profile
COMPANY_NAME=Singh Automation
COMPANY_UEI=GJ1DPYQ3X8K5
COMPANY_CAGE=86VF7
COMPANY_CONTACT=Albert Mizuno
COMPANY_PHONE=786-344-8955
COMPANY_EMAIL=albert@singhautomation.com

# NAICS Codes (comma-separated)
NAICS_CODES=333249,541330,541512,541715,237130,333922

# Configuration
MIN_MATCH_SCORE=50.0
AUTO_PROCESS_THRESHOLD=80.0
SCRAPE_INTERVAL_MINUTES=60
MAX_CONCURRENT_PROCESSING=5
EOF

    echo -e "${YELLOW}⚠️  IMPORTANT: Edit .env file and add your API keys!${NC}"
    echo ""
    echo "Get your API keys from:"
    echo "  • Anthropic: https://console.anthropic.com"
    echo "  • SAM.gov: https://sam.gov/data-services"
    echo ""
    echo "Edit the file:"
    echo "  nano .env"
    echo ""
fi

# Create systemd service file (optional)
if command -v systemctl &> /dev/null; then
    echo -e "${GREEN}🔧 Creating systemd service...${NC}"
    
    CURRENT_DIR=$(pwd)
    PYTHON_PATH="$CURRENT_DIR/venv/bin/python3"
    
    sudo tee /etc/systemd/system/winscope.service > /dev/null << EOF
[Unit]
Description=WinScope API Server
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$CURRENT_DIR
Environment="PATH=$CURRENT_DIR/venv/bin"
ExecStart=$PYTHON_PATH -m uvicorn winscope_api:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
    
    sudo systemctl daemon-reload
    echo -e "${GREEN}✓ Systemd service created${NC}"
fi

# Success message
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✅ WinScope Integration Setup Complete!                ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}📝 Next Steps:${NC}"
echo ""
echo "1. Configure your API keys:"
echo "   nano .env"
echo ""
echo "2. Start WinScope API server:"
echo "   cd winscope"
echo "   source venv/bin/activate"
echo "   uvicorn winscope_api:app --host 0.0.0.0 --port 8000"
echo ""
echo "   Or as a background service:"
echo "   sudo systemctl start winscope"
echo "   sudo systemctl enable winscope  # Auto-start on boot"
echo ""
echo "3. Update your frontend (index.html):"
echo "   Add this before </head>:"
echo "   <script src=\"winscope/winscope-integration.js\"></script>"
echo ""
echo "4. Test the integration:"
echo "   curl http://localhost:8000/"
echo "   Should return: {\"status\":\"online\",...}"
echo ""
echo -e "${GREEN}📚 Full documentation: INTEGRATION_GUIDE.md${NC}"
echo ""
echo -e "${YELLOW}⚡ Your platform is now powered by WinScope AI!${NC}"
echo ""
