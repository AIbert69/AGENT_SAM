# Singh Automation Agent

Autonomous government contracting intelligence platform.

## 🚀 Live Platform
**Web App:** [singh-automation.vercel.app](https://singh-automation.vercel.app)

## 📦 Repository Structure

### Frontend (Web Interface)
- `agent.js` - Main agent orchestration
- `generate-proposal.js` - Proposal generation logic
- `index.html` - Opportunity viewer
- `proposal-editor.html` - Interactive proposal editor
- `sam.js` - SAM.gov API integration
- `api/` - Vercel serverless functions

### WinScope Intelligence Platform (Backend)
**Location:** [`/winscope-platform`](./winscope-platform)

Autonomous backend system that:
- 🔍 Monitors 50+ procurement portals 24/7
- 🤖 AI-powered opportunity scoring and ranking
- 📄 Auto-downloads and parses solicitation documents
- 💰 Generates complete RFQ drafts with pricing
- 📝 Creates AI-powered proposal drafts
- 📊 Continuous learning from win/loss data

**See full documentation:** [winscope-platform/README.md](./winscope-platform/README.md)

## 🎯 Quick Start

### Web Interface (Vercel)
Already deployed at: https://singh-automation.vercel.app

### WinScope Backend (Local/VPS)
```bash
cd winscope-platform
bash quickstart.sh
python3 winscope_master_orchestrator.py
```

## 🏗️ Technology Stack

**Frontend:**
- HTML/CSS/JavaScript
- Vercel (deployment)
- SAM.gov API

**Backend (WinScope):**
- Python 3.10+
- Claude (Anthropic AI)
- Playwright (web automation)
- pdfplumber (document parsing)
- SQLite → PostgreSQL

## 📞 Contact

**Albert Mizuno**
- Email: albert@singhautomation.com
- Phone: 786-344-8955
- Company: Singh Automation
- UEI: GJ1DPYQ3X8K5 | CAGE: 86VF7
```

### 3. Update Repository Settings

1. **Click "About" ⚙️** (gear icon, top right of repo page)
2. **Add description:**
```
   Autonomous government contracting intelligence platform with AI-powered proposal generation
