// Singh Automation - Health Check API
// PRODUCTION BUILD - Structured logging, requestId tracking
// Deploy to: /api/health.js on Vercel

export default async function handler(req, res) {
    const requestId = req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const log = (level, message, data = {}) => {
        console.log(JSON.stringify({ level, requestId, timestamp: new Date().toISOString(), message, ...data }));
    };
    
    // CORS - Restrict to allowed origins
    const allowedOrigins = ['https://singh-automation.vercel.app', 'https://singhautomation.com', 'http://localhost:3000', 'http://localhost:5173'];
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Request-ID');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    const health = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        requestId,
        services: {}
    };
    
    // Check Claude API key
    const claudeKey = process.env.ANTHROPIC_API_KEY;
    health.services.claude = !!(claudeKey && claudeKey.startsWith('sk-ant-'));
    
    // Check SAM.gov API key
    const samKey = process.env.SAM_API_KEY;
    health.services.sam = !!(samKey && samKey.startsWith('SAM-'));
    health.services.samPublic = true; // Public API always available as fallback
    
    // Shorthand for frontend
    health.sam = health.services.sam || health.services.samPublic;
    health.claude = health.services.claude;
    
    // Determine overall status
    const errors = [];
    
    if (!health.services.claude) {
        errors.push('ANTHROPIC_API_KEY not configured');
    }
    
    if (!health.services.sam) {
        // Not an error - public API works
    }
    
    if (errors.length > 0) {
        health.status = 'degraded';
        health.errors = errors;
        health.warning = 'Some features unavailable: ' + errors.join(', ');
        log('warn', 'Health check degraded', { errors });
    } else {
        log('info', 'Health check passed', { services: health.services });
    }
    
    return res.status(200).json(health);
}
