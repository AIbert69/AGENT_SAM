/**
 * @fileoverview Error handling utilities and custom error classes
 * @module lib/errors
 *
 * Provides structured error handling with proper logging, retry logic,
 * and user-friendly error messages.
 */

// =============================================================================
// CUSTOM ERROR CLASSES
// =============================================================================

/**
 * Base application error with structured data
 */
export class AppError extends Error {
    /**
     * @param {string} message - Error message
     * @param {string} code - Error code for programmatic handling
     * @param {number} statusCode - HTTP status code
     * @param {Object} details - Additional error details
     */
    constructor(message, code = 'INTERNAL_ERROR', statusCode = 500, details = {}) {
        super(message);
        this.name = 'AppError';
        this.code = code;
        this.statusCode = statusCode;
        this.details = details;
        this.timestamp = new Date().toISOString();

        // Capture stack trace
        Error.captureStackTrace(this, this.constructor);
    }

    /**
     * Converts error to JSON-safe object
     * @returns {Object}
     */
    toJSON() {
        return {
            error: {
                name: this.name,
                message: this.message,
                code: this.code,
                details: this.details,
                timestamp: this.timestamp,
            }
        };
    }
}

/**
 * Validation error for invalid input
 */
export class ValidationError extends AppError {
    /**
     * @param {string} message - Error message
     * @param {string[]} errors - Array of validation errors
     */
    constructor(message, errors = []) {
        super(message, 'VALIDATION_ERROR', 400, { errors });
        this.name = 'ValidationError';
        this.errors = errors;
    }
}

/**
 * Authentication/Authorization error
 */
export class AuthError extends AppError {
    constructor(message = 'Authentication required') {
        super(message, 'AUTH_ERROR', 401);
        this.name = 'AuthError';
    }
}

/**
 * Resource not found error
 */
export class NotFoundError extends AppError {
    /**
     * @param {string} resource - Resource type that was not found
     * @param {string} id - Resource identifier
     */
    constructor(resource, id) {
        super(`${resource} not found: ${id}`, 'NOT_FOUND', 404, { resource, id });
        this.name = 'NotFoundError';
    }
}

/**
 * Rate limit exceeded error
 */
export class RateLimitError extends AppError {
    /**
     * @param {number} retryAfter - Seconds until retry is allowed
     */
    constructor(retryAfter = 60) {
        super('Rate limit exceeded', 'RATE_LIMIT_EXCEEDED', 429, { retryAfter });
        this.name = 'RateLimitError';
        this.retryAfter = retryAfter;
    }
}

/**
 * External API error
 */
export class ExternalApiError extends AppError {
    /**
     * @param {string} service - External service name
     * @param {string} message - Error message
     * @param {number} statusCode - HTTP status from external service
     */
    constructor(service, message, statusCode = 502) {
        super(`${service} error: ${message}`, 'EXTERNAL_API_ERROR', statusCode, { service });
        this.name = 'ExternalApiError';
        this.service = service;
    }
}

/**
 * Configuration error
 */
export class ConfigError extends AppError {
    constructor(message) {
        super(message, 'CONFIG_ERROR', 500);
        this.name = 'ConfigError';
    }
}

// =============================================================================
// ERROR HANDLING UTILITIES
// =============================================================================

/**
 * Wraps an async function with error handling
 * @template T
 * @param {() => Promise<T>} fn - Async function to wrap
 * @param {string} context - Context for error logging
 * @returns {Promise<T>}
 */
export async function withErrorHandling(fn, context = 'operation') {
    try {
        return await fn();
    } catch (error) {
        if (error instanceof AppError) {
            throw error;
        }

        // Wrap unknown errors
        throw new AppError(
            `${context} failed: ${error.message}`,
            'INTERNAL_ERROR',
            500,
            { originalError: error.message }
        );
    }
}

/**
 * Retry configuration
 * @typedef {Object} RetryConfig
 * @property {number} maxRetries - Maximum number of retry attempts
 * @property {number[]} delays - Delay between retries (exponential backoff)
 * @property {Function} shouldRetry - Function to determine if error is retryable
 */

/**
 * Default retry configuration
 * @type {RetryConfig}
 */
const defaultRetryConfig = {
    maxRetries: 4,
    delays: [2000, 4000, 8000, 16000],
    shouldRetry: (error) => {
        // Retry on network errors and 5xx responses
        if (error.name === 'AbortError') return false; // Timeout - don't retry
        if (error instanceof RateLimitError) return false; // Rate limited - don't retry
        if (error instanceof ValidationError) return false; // Bad input - don't retry
        if (error instanceof AuthError) return false; // Auth error - don't retry

        // Retry on external API errors (except 4xx)
        if (error instanceof ExternalApiError) {
            return error.statusCode >= 500;
        }

        // Retry on network-related errors
        const retryableErrors = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EPIPE'];
        return retryableErrors.includes(error.code) || error.message.includes('fetch');
    }
};

/**
 * Executes a function with retry logic
 * @template T
 * @param {() => Promise<T>} fn - Async function to execute
 * @param {string} label - Label for logging
 * @param {Partial<RetryConfig>} config - Retry configuration
 * @returns {Promise<T>}
 */
export async function withRetry(fn, label = 'operation', config = {}) {
    const { maxRetries, delays, shouldRetry } = { ...defaultRetryConfig, ...config };

    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            // Check if we should retry
            if (attempt >= maxRetries || !shouldRetry(error)) {
                break;
            }

            // Calculate delay with jitter
            const baseDelay = delays[Math.min(attempt, delays.length - 1)];
            const jitter = Math.random() * 1000; // Add up to 1s jitter
            const delay = baseDelay + jitter;

            console.warn(`[Retry] ${label} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${Math.round(delay)}ms: ${error.message}`);

            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    throw lastError;
}

/**
 * Fetches with timeout and retry
 * @param {string} url - URL to fetch
 * @param {string} label - Label for logging
 * @param {Object} options - Fetch options
 * @param {number} options.timeout - Timeout in milliseconds
 * @param {boolean} options.retry - Enable retry logic
 * @returns {Promise<Response>}
 */
export async function fetchWithTimeout(url, label, options = {}) {
    const { timeout = 8000, retry = true, ...fetchOptions } = options;

    const fetchFn = async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            const response = await fetch(url, {
                ...fetchOptions,
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new ExternalApiError(
                    label,
                    `HTTP ${response.status}: ${response.statusText}`,
                    response.status >= 500 ? 502 : response.status
                );
            }

            return response;
        } catch (error) {
            clearTimeout(timeoutId);

            if (error.name === 'AbortError') {
                throw new ExternalApiError(label, 'Request timeout', 504);
            }

            throw error;
        }
    };

    if (retry) {
        return withRetry(fetchFn, label);
    }

    return fetchFn();
}

/**
 * Creates an error response object for API responses
 * @param {Error} error - Error object
 * @param {string} requestId - Request ID for correlation
 * @returns {{ success: false, error: Object, requestId: string }}
 */
export function createErrorResponse(error, requestId) {
    if (error instanceof AppError) {
        return {
            success: false,
            ...error.toJSON(),
            requestId,
        };
    }

    // Generic error
    return {
        success: false,
        error: {
            name: 'InternalError',
            message: 'An unexpected error occurred',
            code: 'INTERNAL_ERROR',
            timestamp: new Date().toISOString(),
        },
        requestId,
    };
}

/**
 * Express/Vercel error handler middleware
 * @param {Error} error - Error object
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {string} requestId - Request ID
 * @param {Function} log - Logging function
 */
export function handleApiError(error, req, res, requestId, log) {
    // Log the error
    log('error', error.message, {
        code: error.code,
        statusCode: error.statusCode,
        details: error.details,
        stack: error.stack,
    });

    // Determine status code
    const statusCode = error instanceof AppError ? error.statusCode : 500;

    // Send response
    res.status(statusCode).json(createErrorResponse(error, requestId));
}

export default {
    // Error classes
    AppError,
    ValidationError,
    AuthError,
    NotFoundError,
    RateLimitError,
    ExternalApiError,
    ConfigError,

    // Utilities
    withErrorHandling,
    withRetry,
    fetchWithTimeout,
    createErrorResponse,
    handleApiError,
};
