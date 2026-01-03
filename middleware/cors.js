/**
 * @fileoverview CORS middleware with proper security configuration
 * @module middleware/cors
 *
 * Provides secure CORS handling that:
 * - Validates origins against allowlist
 * - Handles preflight requests properly
 * - Sets appropriate security headers
 */

import config from '../lib/config.js';

/**
 * Checks if an origin is allowed
 * @param {string} origin - Request origin
 * @returns {boolean}
 */
function isOriginAllowed(origin) {
    if (!origin) return false;

    // Check against allowlist
    const allowed = config.cors.allowedOrigins;

    // Exact match
    if (allowed.includes(origin)) return true;

    // Check for wildcard patterns (e.g., *.vercel.app)
    for (const pattern of allowed) {
        if (pattern.startsWith('*.')) {
            const domain = pattern.slice(2);
            if (origin.endsWith(domain)) return true;
        }
    }

    return false;
}

/**
 * Sets CORS headers on the response
 * @param {Object} res - Response object
 * @param {string} origin - Allowed origin
 */
function setCorsHeaders(res, origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', config.cors.allowedMethods.join(', '));
    res.setHeader('Access-Control-Allow-Headers', config.cors.allowedHeaders.join(', '));
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours

    // Security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
}

/**
 * CORS middleware for Vercel serverless functions
 *
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {boolean} - Returns true if request was handled (preflight), false otherwise
 *
 * @example
 * export default async function handler(req, res) {
 *   if (handleCors(req, res)) return; // Preflight handled
 *   // ... rest of handler
 * }
 */
export function handleCors(req, res) {
    const origin = req.headers.origin;

    // Check if origin is allowed
    if (origin && isOriginAllowed(origin)) {
        setCorsHeaders(res, origin);
    } else if (!origin) {
        // Same-origin request or non-browser client
        // Set restrictive headers but allow the request
        res.setHeader('Access-Control-Allow-Origin', config.cors.allowedOrigins[0] || 'null');
    } else {
        // Origin not allowed - still set headers for error response
        res.setHeader('Access-Control-Allow-Origin', 'null');
    }

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return true;
    }

    return false;
}

/**
 * Creates a CORS middleware with custom configuration
 *
 * @param {Object} options - CORS options
 * @param {string[]} options.origins - Allowed origins
 * @param {string[]} options.methods - Allowed methods
 * @param {string[]} options.headers - Allowed headers
 * @returns {Function} - CORS middleware function
 *
 * @example
 * const cors = createCorsMiddleware({
 *   origins: ['https://myapp.com'],
 *   methods: ['GET', 'POST'],
 *   headers: ['Content-Type']
 * });
 *
 * export default async function handler(req, res) {
 *   if (cors(req, res)) return;
 *   // ...
 * }
 */
export function createCorsMiddleware(options = {}) {
    const {
        origins = config.cors.allowedOrigins,
        methods = config.cors.allowedMethods,
        headers = config.cors.allowedHeaders,
    } = options;

    return function corsMiddleware(req, res) {
        const origin = req.headers.origin;

        if (origin && origins.includes(origin)) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Access-Control-Allow-Methods', methods.join(', '));
            res.setHeader('Access-Control-Allow-Headers', headers.join(', '));
            res.setHeader('Access-Control-Allow-Credentials', 'true');
            res.setHeader('Access-Control-Max-Age', '86400');
        }

        // Security headers
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');

        if (req.method === 'OPTIONS') {
            res.status(204).end();
            return true;
        }

        return false;
    };
}

/**
 * Development CORS middleware (allows all origins)
 * WARNING: Only use in development!
 *
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {boolean}
 */
export function handleDevCors(req, res) {
    const origin = req.headers.origin || '*';

    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return true;
    }

    return false;
}

export default {
    handleCors,
    createCorsMiddleware,
    handleDevCors,
    isOriginAllowed
};
