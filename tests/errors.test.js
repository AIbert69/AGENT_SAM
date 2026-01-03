/**
 * @fileoverview Unit tests for error handling utilities
 * @module tests/errors.test
 */

import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import {
    AppError,
    ValidationError,
    AuthError,
    NotFoundError,
    RateLimitError,
    ExternalApiError,
    ConfigError,
    withErrorHandling,
    withRetry,
    createErrorResponse,
} from '../lib/errors.js';

describe('Custom Error Classes', () => {
    describe('AppError', () => {
        test('should create error with default values', () => {
            const error = new AppError('Test error');

            expect(error.message).toBe('Test error');
            expect(error.code).toBe('INTERNAL_ERROR');
            expect(error.statusCode).toBe(500);
            expect(error.details).toEqual({});
            expect(error.timestamp).toBeDefined();
        });

        test('should create error with custom values', () => {
            const error = new AppError('Custom error', 'CUSTOM_CODE', 400, { field: 'test' });

            expect(error.code).toBe('CUSTOM_CODE');
            expect(error.statusCode).toBe(400);
            expect(error.details.field).toBe('test');
        });

        test('should serialize to JSON correctly', () => {
            const error = new AppError('Test', 'TEST_CODE', 400);
            const json = error.toJSON();

            expect(json.error.name).toBe('AppError');
            expect(json.error.message).toBe('Test');
            expect(json.error.code).toBe('TEST_CODE');
        });

        test('should have proper stack trace', () => {
            const error = new AppError('Test');
            expect(error.stack).toBeDefined();
            expect(error.stack).toContain('AppError');
        });
    });

    describe('ValidationError', () => {
        test('should create with validation errors array', () => {
            const errors = ['Field is required', 'Invalid format'];
            const error = new ValidationError('Validation failed', errors);

            expect(error.statusCode).toBe(400);
            expect(error.code).toBe('VALIDATION_ERROR');
            expect(error.errors).toEqual(errors);
        });

        test('should default to empty errors array', () => {
            const error = new ValidationError('Validation failed');
            expect(error.errors).toEqual([]);
        });
    });

    describe('AuthError', () => {
        test('should create with default message', () => {
            const error = new AuthError();

            expect(error.message).toBe('Authentication required');
            expect(error.statusCode).toBe(401);
            expect(error.code).toBe('AUTH_ERROR');
        });

        test('should accept custom message', () => {
            const error = new AuthError('Invalid token');
            expect(error.message).toBe('Invalid token');
        });
    });

    describe('NotFoundError', () => {
        test('should include resource and id in details', () => {
            const error = new NotFoundError('Opportunity', 'abc-123');

            expect(error.message).toBe('Opportunity not found: abc-123');
            expect(error.statusCode).toBe(404);
            expect(error.details.resource).toBe('Opportunity');
            expect(error.details.id).toBe('abc-123');
        });
    });

    describe('RateLimitError', () => {
        test('should include retry-after value', () => {
            const error = new RateLimitError(30);

            expect(error.statusCode).toBe(429);
            expect(error.retryAfter).toBe(30);
            expect(error.details.retryAfter).toBe(30);
        });

        test('should default to 60 seconds', () => {
            const error = new RateLimitError();
            expect(error.retryAfter).toBe(60);
        });
    });

    describe('ExternalApiError', () => {
        test('should include service name', () => {
            const error = new ExternalApiError('SAM.gov', 'API timeout');

            expect(error.message).toBe('SAM.gov error: API timeout');
            expect(error.service).toBe('SAM.gov');
            expect(error.statusCode).toBe(502);
        });

        test('should accept custom status code', () => {
            const error = new ExternalApiError('API', 'Not found', 404);
            expect(error.statusCode).toBe(404);
        });
    });

    describe('ConfigError', () => {
        test('should create configuration error', () => {
            const error = new ConfigError('Missing API key');

            expect(error.message).toBe('Missing API key');
            expect(error.code).toBe('CONFIG_ERROR');
            expect(error.statusCode).toBe(500);
        });
    });
});

describe('withErrorHandling', () => {
    test('should return result on success', async () => {
        const fn = async () => 'success';
        const result = await withErrorHandling(fn, 'test operation');

        expect(result).toBe('success');
    });

    test('should pass through AppError subclasses', async () => {
        const fn = async () => {
            throw new ValidationError('Invalid');
        };

        await expect(withErrorHandling(fn, 'test')).rejects.toBeInstanceOf(ValidationError);
    });

    test('should wrap unknown errors in AppError', async () => {
        const fn = async () => {
            throw new Error('Unknown error');
        };

        try {
            await withErrorHandling(fn, 'test operation');
        } catch (error) {
            expect(error).toBeInstanceOf(AppError);
            expect(error.message).toContain('test operation failed');
        }
    });
});

describe('withRetry', () => {
    test('should return result on first success', async () => {
        const fn = jest.fn().mockResolvedValue('success');

        const result = await withRetry(fn, 'test', {
            maxRetries: 3,
            delays: [10, 20, 40],
        });

        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(1);
    });

    test('should retry on transient failure', async () => {
        const fn = jest.fn()
            .mockRejectedValueOnce(new Error('Network error'))
            .mockResolvedValueOnce('success');

        const result = await withRetry(fn, 'test', {
            maxRetries: 3,
            delays: [10, 20, 40],
            shouldRetry: () => true,
        });

        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(2);
    });

    test('should throw after max retries', async () => {
        const fn = jest.fn().mockRejectedValue(new Error('Persistent error'));

        await expect(
            withRetry(fn, 'test', {
                maxRetries: 2,
                delays: [10, 20],
                shouldRetry: () => true,
            })
        ).rejects.toThrow('Persistent error');

        expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    test('should not retry ValidationError', async () => {
        const fn = jest.fn().mockRejectedValue(new ValidationError('Invalid'));

        await expect(
            withRetry(fn, 'test', {
                maxRetries: 3,
                delays: [10, 20, 40],
            })
        ).rejects.toBeInstanceOf(ValidationError);

        expect(fn).toHaveBeenCalledTimes(1);
    });

    test('should not retry RateLimitError', async () => {
        const fn = jest.fn().mockRejectedValue(new RateLimitError(60));

        await expect(
            withRetry(fn, 'test', {
                maxRetries: 3,
                delays: [10, 20, 40],
            })
        ).rejects.toBeInstanceOf(RateLimitError);

        expect(fn).toHaveBeenCalledTimes(1);
    });
});

describe('createErrorResponse', () => {
    test('should format AppError correctly', () => {
        const error = new ValidationError('Invalid input', ['Field required']);
        const response = createErrorResponse(error, 'req-123');

        expect(response.success).toBe(false);
        expect(response.error.name).toBe('ValidationError');
        expect(response.error.message).toBe('Invalid input');
        expect(response.requestId).toBe('req-123');
    });

    test('should format generic Error as InternalError', () => {
        const error = new Error('Something went wrong');
        const response = createErrorResponse(error, 'req-456');

        expect(response.success).toBe(false);
        expect(response.error.name).toBe('InternalError');
        expect(response.error.message).toBe('An unexpected error occurred');
        expect(response.error.code).toBe('INTERNAL_ERROR');
    });
});
