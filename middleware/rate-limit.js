/**
 * @fileoverview Rate limiting middleware for API protection
 * @module middleware/rate-limit
 *
 * Implements sliding window rate limiting to prevent abuse.
 * Uses in-memory storage (for Vercel serverless, consider using Redis in production).
 */

import config from '../lib/config.js';
import { RateLimitError } from '../lib/errors.js';

/**
 * In-memory store for rate limiting
 * Note: This resets on cold starts in serverless environments
 * For production, use Redis or a similar distributed store
 */
const rateLimitStore = new Map();

/**
 * Rate limit configuration
 * @typedef {Object} RateLimitConfig
 * @property {number} max - Maximum requests per window
 * @property {number} windowMs - Window size in milliseconds
 * @property {string} keyGenerator - Function to generate rate limit key
 */

/**
 * Cleans up expired entries from the store
 * Called periodically to prevent memory leaks
 */
function cleanupExpiredEntries() {
    const now = Date.now();
    for (const [key, data] of rateLimitStore.entries()) {
        if (now - data.windowStart > config.rateLimit.windowMs * 2) {
            rateLimitStore.delete(key);
        }
    }
}

// Clean up every 5 minutes
setInterval(cleanupExpiredEntries, 5 * 60 * 1000);

/**
 * Gets the client identifier for rate limiting
 * @param {Object} req - Request object
 * @returns {string} - Client identifier
 */
function getClientKey(req) {
    // Try various headers for the real client IP
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }

    const realIp = req.headers['x-real-ip'];
    if (realIp) {
        return realIp;
    }

    // Fallback to connection info
    return req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown';
}

/**
 * Rate limiting data structure
 * @typedef {Object} RateLimitData
 * @property {number} count - Request count in current window
 * @property {number} windowStart - Window start timestamp
 */

/**
 * Checks if a request should be rate limited
 * @param {string} key - Client identifier
 * @param {number} max - Maximum requests per window
 * @param {number} windowMs - Window size in milliseconds
 * @returns {{ allowed: boolean, remaining: number, resetAt: number }}
 */
function checkRateLimit(key, max, windowMs) {
    const now = Date.now();

    // Get or create rate limit data
    let data = rateLimitStore.get(key);

    if (!data || now - data.windowStart >= windowMs) {
        // New window
        data = { count: 0, windowStart: now };
    }

    // Increment count
    data.count++;
    rateLimitStore.set(key, data);

    const remaining = Math.max(0, max - data.count);
    const resetAt = data.windowStart + windowMs;

    return {
        allowed: data.count <= max,
        remaining,
        resetAt,
        current: data.count,
    };
}

/**
 * Rate limiting middleware for Vercel serverless functions
 *
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Object} [options] - Rate limit options
 * @param {number} [options.max] - Maximum requests per window
 * @param {number} [options.windowMs] - Window size in milliseconds
 * @returns {boolean} - Returns true if rate limited, false otherwise
 *
 * @example
 * export default async function handler(req, res) {
 *   if (checkRateLimitMiddleware(req, res)) return; // Rate limited
 *   // ... rest of handler
 * }
 */
export function checkRateLimitMiddleware(req, res, options = {}) {
    const max = options.max || config.rateLimit.max;
    const windowMs = options.windowMs || config.rateLimit.windowMs;

    const key = getClientKey(req);
    const result = checkRateLimit(key, max, windowMs);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000));

    if (!result.allowed) {
        const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
        res.setHeader('Retry-After', retryAfter);

        res.status(429).json({
            success: false,
            error: {
                name: 'RateLimitError',
                message: 'Too many requests, please try again later',
                code: 'RATE_LIMIT_EXCEEDED',
                retryAfter,
            }
        });

        return true;
    }

    return false;
}

/**
 * Creates a rate limiter with custom configuration
 *
 * @param {Object} options - Rate limit options
 * @param {number} options.max - Maximum requests per window
 * @param {number} options.windowMs - Window size in milliseconds
 * @param {Function} [options.keyGenerator] - Custom key generator function
 * @returns {Function} - Rate limit middleware
 *
 * @example
 * const strictLimiter = createRateLimiter({
 *   max: 10,
 *   windowMs: 60000, // 10 requests per minute
 * });
 *
 * export default async function handler(req, res) {
 *   if (strictLimiter(req, res)) return;
 *   // ...
 * }
 */
export function createRateLimiter(options) {
    const {
        max = config.rateLimit.max,
        windowMs = config.rateLimit.windowMs,
        keyGenerator = getClientKey,
    } = options;

    return function rateLimiter(req, res) {
        const key = keyGenerator(req);
        const result = checkRateLimit(key, max, windowMs);

        res.setHeader('X-RateLimit-Limit', max);
        res.setHeader('X-RateLimit-Remaining', result.remaining);
        res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000));

        if (!result.allowed) {
            const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
            res.setHeader('Retry-After', retryAfter);

            res.status(429).json({
                success: false,
                error: {
                    name: 'RateLimitError',
                    message: 'Too many requests',
                    code: 'RATE_LIMIT_EXCEEDED',
                    retryAfter,
                }
            });

            return true;
        }

        return false;
    };
}

/**
 * Rate limiter for specific endpoints (stricter limits)
 * Use for expensive operations like proposal generation
 */
export const strictRateLimiter = createRateLimiter({
    max: 10,
    windowMs: 60000, // 10 requests per minute
});

/**
 * Rate limiter for scan operations
 */
export const scanRateLimiter = createRateLimiter({
    max: 5,
    windowMs: 60000, // 5 scans per minute
});

/**
 * Gets current rate limit status for a client
 * @param {Object} req - Request object
 * @returns {{ current: number, remaining: number, resetAt: number }}
 */
export function getRateLimitStatus(req) {
    const key = getClientKey(req);
    const data = rateLimitStore.get(key);

    if (!data) {
        return {
            current: 0,
            remaining: config.rateLimit.max,
            resetAt: Date.now() + config.rateLimit.windowMs,
        };
    }

    const max = config.rateLimit.max;
    return {
        current: data.count,
        remaining: Math.max(0, max - data.count),
        resetAt: data.windowStart + config.rateLimit.windowMs,
    };
}

export default {
    checkRateLimitMiddleware,
    createRateLimiter,
    strictRateLimiter,
    scanRateLimiter,
    getRateLimitStatus,
};
