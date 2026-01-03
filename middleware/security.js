/**
 * @fileoverview Security middleware and utilities
 * @module middleware/security
 *
 * Provides security-related middleware including:
 * - Request ID generation
 * - Security headers
 * - Input sanitization
 * - Logging utilities
 */

import { validateInput, safeIdSchema } from '../lib/validation.js';

/**
 * Generates a unique request ID for tracing
 * @returns {string}
 */
export function generateRequestId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 11);
    return `req_${timestamp}_${random}`;
}

/**
 * Creates a structured logger for a request
 * @param {string} requestId - Request ID for correlation
 * @returns {Function} - Logging function
 */
export function createLogger(requestId) {
    /**
     * @param {'info' | 'warn' | 'error' | 'debug'} level - Log level
     * @param {string} message - Log message
     * @param {Object} [data] - Additional data
     */
    return function log(level, message, data = {}) {
        const logEntry = {
            level,
            requestId,
            timestamp: new Date().toISOString(),
            message,
            ...data,
        };

        // Use appropriate console method
        const consoleMethod = level === 'error' ? 'error' :
                             level === 'warn' ? 'warn' :
                             level === 'debug' ? 'debug' : 'log';

        console[consoleMethod](JSON.stringify(logEntry));
    };
}

/**
 * Sets security headers on the response
 * @param {Object} res - Response object
 */
export function setSecurityHeaders(res) {
    // Prevent MIME type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'DENY');

    // Enable XSS filter
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // Referrer policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Content Security Policy (adjust as needed)
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'");

    // Permissions Policy
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
}

/**
 * Validates and sanitizes an opportunity ID
 * @param {string} id - ID to validate
 * @returns {{ valid: boolean, id?: string, error?: string }}
 */
export function validateOpportunityId(id) {
    if (!id) {
        return { valid: false, error: 'ID is required' };
    }

    const result = validateInput(safeIdSchema, id);

    if (!result.success) {
        return { valid: false, error: result.errors[0] };
    }

    return { valid: true, id: result.data };
}

/**
 * Middleware to extract and validate request ID
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {{ requestId: string, log: Function }}
 */
export function setupRequest(req, res) {
    // Get or generate request ID
    const requestId = req.headers['x-request-id'] || generateRequestId();

    // Set request ID in response header for tracing
    res.setHeader('X-Request-ID', requestId);

    // Set security headers
    setSecurityHeaders(res);

    // Create logger
    const log = createLogger(requestId);

    return { requestId, log };
}

/**
 * Sanitizes user input to prevent injection attacks
 * @param {string} input - User input
 * @param {Object} options - Sanitization options
 * @param {number} options.maxLength - Maximum allowed length
 * @param {boolean} options.allowHtml - Allow HTML tags
 * @returns {string}
 */
export function sanitizeInput(input, options = {}) {
    const { maxLength = 10000, allowHtml = false } = options;

    if (typeof input !== 'string') return '';

    let sanitized = input;

    // Trim and limit length
    sanitized = sanitized.trim().substring(0, maxLength);

    // Remove null bytes
    sanitized = sanitized.replace(/\0/g, '');

    // Strip HTML if not allowed
    if (!allowHtml) {
        sanitized = sanitized.replace(/<[^>]*>/g, '');
    }

    return sanitized;
}

/**
 * Validates request method
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {string[]} allowedMethods - Allowed HTTP methods
 * @returns {boolean} - Returns true if method is not allowed
 */
export function checkMethod(req, res, allowedMethods) {
    if (!allowedMethods.includes(req.method)) {
        res.setHeader('Allow', allowedMethods.join(', '));
        res.status(405).json({
            success: false,
            error: {
                name: 'MethodNotAllowed',
                message: `Method ${req.method} not allowed`,
                code: 'METHOD_NOT_ALLOWED',
                allowedMethods,
            }
        });
        return true;
    }
    return false;
}

/**
 * Combined security middleware for API handlers
 *
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Object} options - Middleware options
 * @param {string[]} options.methods - Allowed HTTP methods
 * @returns {{ handled: boolean, requestId?: string, log?: Function }}
 *
 * @example
 * export default async function handler(req, res) {
 *   const { handled, requestId, log } = securityMiddleware(req, res, {
 *     methods: ['GET', 'POST']
 *   });
 *   if (handled) return;
 *
 *   log('info', 'Processing request');
 *   // ...
 * }
 */
export function securityMiddleware(req, res, options = {}) {
    const { methods = ['GET', 'POST', 'OPTIONS'] } = options;

    // Setup request (IDs, headers, logging)
    const { requestId, log } = setupRequest(req, res);

    // Check method
    if (req.method !== 'OPTIONS' && checkMethod(req, res, methods)) {
        return { handled: true };
    }

    return { handled: false, requestId, log };
}

export default {
    generateRequestId,
    createLogger,
    setSecurityHeaders,
    validateOpportunityId,
    setupRequest,
    sanitizeInput,
    checkMethod,
    securityMiddleware,
};
