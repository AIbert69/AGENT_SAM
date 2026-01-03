# Singh Automation Platform - Integration Guide

## Version 2.0.0 - Architecture Overview

This guide explains the Singh Automation platform architecture, setup, and API usage.

---

## 📁 Project Structure

```
Singh_Automation/
├── api/                        # Vercel serverless functions
│   ├── v1/                     # API v1 endpoints
│   │   └── scan.js             # Multi-portal scanner
│   ├── generate.js             # Context generation
│   ├── generate-proposal.js    # Proposal generation
│   ├── health.js               # Health check
│   ├── sam.js                  # Legacy SAM endpoint
│   └── validate.js             # Opportunity validation
│
├── lib/                        # Shared libraries
│   ├── config.js               # Configuration management
│   ├── errors.js               # Error handling utilities
│   ├── qualification.js        # Opportunity scoring logic
│   └── validation.js           # Input validation (Zod)
│
├── middleware/                 # Express/Vercel middleware
│   ├── cors.js                 # CORS handling
│   ├── rate-limit.js           # Rate limiting
│   └── security.js             # Security utilities
│
├── tests/                      # Jest test suites
│   ├── qualification.test.js
│   ├── validation.test.js
│   └── errors.test.js
│
├── agent.js                    # Frontend agent
├── index.html                  # Main dashboard
├── proposal-editor.html        # Proposal editor
├── winscope-integration.js     # WinScope connector
├── winscope_api.py             # Python backend (optional)
│
├── package.json                # Dependencies
├── jest.config.js              # Test configuration
├── vercel.json                 # Deployment config
├── .env.example                # Environment template
└── .gitignore                  # Git ignore rules
```

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your API keys
```

**Required:**
- `SAM_API_KEY` - Get from https://api.sam.gov/

**Optional:**
- `ANTHROPIC_API_KEY` - For AI-powered proposal generation
- `WINSCOPE_API_URL` - Custom backend URL

### 3. Run Development Server

```bash
npm run dev
# Opens at http://localhost:3000
```

### 4. Run Tests

```bash
npm test
npm run test:coverage
```

---

## 🔌 API Reference

### API Versioning

All APIs are versioned. Current version: **v1**

| Endpoint | Description |
|----------|-------------|
| `/api/v1/scan` | Scan procurement portals |
| `/api/v1/validate` | Validate opportunities |
| `/api/v1/generate` | Generate proposal context |
| `/api/v1/rfq` | Generate RFQ documents |
| `/api/v1/health` | Health check |

### Scan Portals

```http
GET /api/v1/scan
```

**Response:**
```json
{
  "success": true,
  "count": 47,
  "stats": {
    "total": 47,
    "federal": 12,
    "sbir": 8,
    "grants": 5,
    "state": 3,
    "county": 18,
    "go": 15,
    "review": 20,
    "nogo": 12
  },
  "opportunities": [
    {
      "id": "abc123",
      "title": "Robotic Welding System",
      "agency": "US Navy",
      "naicsCode": "333249",
      "value": 2500000,
      "status": "GO",
      "qualification": {
        "status": "GO",
        "score": 75,
        "reason": "Strong match: robotic/welding"
      }
    }
  ],
  "requestId": "req_abc123",
  "apiVersion": "v1"
}
```

### Email Subscription

```http
POST /api/v1/scan
Content-Type: application/json

{
  "email": "user@example.com",
  "frequency": "daily"  // daily | weekly | immediate
}
```

---

## 🎯 Qualification Logic

Opportunities are scored using the following algorithm:

### Scoring Points

| Factor | Points | Description |
|--------|--------|-------------|
| NAICS Match | 30 | Primary NAICS code matches company |
| Keyword Match | 5 each | Title/description contains keywords |
| Set-Aside | 20 | Compatible set-aside type |

### Thresholds

| Score | Status | Action |
|-------|--------|--------|
| ≥50 | GO | Recommend pursuing |
| 25-49 | Review | Manual review needed |
| <25 | Review | Low match, review for fit |

### Automatic Disqualifications

- SDVOSB set-asides
- 8(a) program requirements
- HUBZone set-asides
- Contract vehicle restrictions (SeaPort, OASIS, GSA MAS, etc.)

---

## 🔒 Security Features

### Rate Limiting

- Default: 60 requests/minute per IP
- Scan endpoint: 5 requests/minute
- Configurable via environment variables

### CORS

Origins are validated against an allowlist. Configure in `.env`:

```bash
ALLOWED_ORIGINS=https://yourapp.com,https://staging.yourapp.com
```

### Input Validation

All inputs are validated using Zod schemas. Invalid inputs return 400 errors:

```json
{
  "success": false,
  "error": {
    "message": "Validation failed",
    "errors": ["email: Invalid email address"]
  }
}
```

### XSS Prevention

- Frontend uses DOM manipulation (no innerHTML with user data)
- Event delegation instead of inline onclick handlers
- All IDs validated with regex: `/^[a-zA-Z0-9_-]+$/`

---

## 🧪 Testing

### Run All Tests

```bash
npm test
```

### Run with Coverage

```bash
npm run test:coverage
```

### Test Structure

```
tests/
├── qualification.test.js   # Scoring logic tests
├── validation.test.js      # Input validation tests
└── errors.test.js          # Error handling tests
```

### Coverage Thresholds

- Branches: 70%
- Functions: 70%
- Lines: 70%
- Statements: 70%

---

## 🔧 Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SAM_API_KEY` | Yes | - | SAM.gov API key |
| `ANTHROPIC_API_KEY` | No | - | Claude API key |
| `WINSCOPE_API_URL` | No | localhost:8000 | Backend URL |
| `ALLOWED_ORIGINS` | No | localhost:3000 | CORS origins |
| `RATE_LIMIT_MAX` | No | 60 | Max requests/min |
| `FETCH_TIMEOUT_MS` | No | 8000 | API timeout |
| `DEBUG_MODE` | No | false | Enable debug logs |

### Company Profile

Edit `lib/config.js` to customize:

```javascript
companyProfile: {
    naicsCodes: ['333249', '333922', '541330'],
    keywords: ['robotic', 'welding', 'automation'],
    certifications: ['Small Business', 'MBE'],
    // ...
}
```

---

## 🚀 Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables
vercel env add SAM_API_KEY
```

### Manual Deployment

1. Build: `npm run build`
2. Upload to your hosting provider
3. Set environment variables
4. Configure CORS for your domain

---

## 📊 Monitoring

### Health Check

```http
GET /api/v1/health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-12-31T21:00:00.000Z",
  "services": {
    "sam": "configured",
    "anthropic": "configured"
  }
}
```

### Request Tracing

All API responses include a `requestId` for correlation:

```json
{
  "requestId": "req_1234567_abc123xyz",
  "timestamp": "2024-12-31T21:00:00.000Z"
}
```

---

## 🔄 Migration from v1.x

### Breaking Changes

1. **API Key Required**: `SAM_API_KEY` environment variable is now required. Hardcoded fallback removed.

2. **API Versioning**: New endpoints use `/api/v1/` prefix. Legacy endpoints (`/api/sam`) still work but are deprecated.

3. **CORS**: Wildcard CORS removed. Configure `ALLOWED_ORIGINS` for your domains.

### Migration Steps

1. Set `SAM_API_KEY` environment variable
2. Update frontend to use `/api/v1/scan` endpoint
3. Configure `ALLOWED_ORIGINS` for production domain
4. Test all functionality

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Write tests for new functionality
4. Ensure all tests pass: `npm test`
5. Submit a pull request

---

## 📞 Support

- **Documentation**: This guide
- **Issues**: https://github.com/AIbert69/Singh_Automation/issues
- **Email**: albert@singhautomation.com

---

## 📋 Changelog

### v2.0.0 (2024-12-31)

**Security**
- Removed hardcoded API keys
- Fixed XSS vulnerabilities in agent.js
- Fixed race condition in scan processing
- Added input validation with Zod
- Restricted CORS to allowlisted origins

**Features**
- Added API versioning (v1)
- Added rate limiting middleware
- Added comprehensive error handling with retry logic
- Added Jest test suite

**Architecture**
- Created shared lib/ modules
- Added middleware layer
- Improved code organization
- Added JSDoc documentation

**DevOps**
- Added package.json
- Added .env.example
- Added .gitignore
- Added jest.config.js
