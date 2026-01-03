/**
 * @fileoverview Unit tests for validation utilities
 * @module tests/validation.test
 */

import { describe, test, expect } from '@jest/globals';
import {
    validateInput,
    validateOrThrow,
    sanitizeHtml,
    sanitizeJs,
    emailSchema,
    safeIdSchema,
    urlSchema,
    naicsCodeSchema,
    opportunitySchema,
    emailSubscriptionSchema,
} from '../lib/validation.js';

describe('Schema Validation', () => {
    describe('emailSchema', () => {
        test('should accept valid emails', () => {
            const validEmails = [
                'test@example.com',
                'user.name@domain.org',
                'user+tag@example.co.uk',
            ];

            validEmails.forEach(email => {
                const result = validateInput(emailSchema, email);
                expect(result.success).toBe(true);
            });
        });

        test('should reject invalid emails', () => {
            const invalidEmails = [
                'notanemail',
                '@nodomain.com',
                'no@',
                '',
            ];

            invalidEmails.forEach(email => {
                const result = validateInput(emailSchema, email);
                expect(result.success).toBe(false);
            });
        });

        test('should reject emails longer than 254 characters', () => {
            const longEmail = 'a'.repeat(250) + '@example.com';
            const result = validateInput(emailSchema, longEmail);
            expect(result.success).toBe(false);
        });
    });

    describe('safeIdSchema', () => {
        test('should accept valid IDs', () => {
            const validIds = [
                'abc123',
                'test-id',
                'test_id',
                'ABC-123_xyz',
            ];

            validIds.forEach(id => {
                const result = validateInput(safeIdSchema, id);
                expect(result.success).toBe(true);
            });
        });

        test('should reject IDs with special characters', () => {
            const invalidIds = [
                "id'injection",
                'id<script>',
                'id;drop table',
                'id\nwith\nnewlines',
                '../path/traversal',
            ];

            invalidIds.forEach(id => {
                const result = validateInput(safeIdSchema, id);
                expect(result.success).toBe(false);
            });
        });

        test('should reject empty IDs', () => {
            const result = validateInput(safeIdSchema, '');
            expect(result.success).toBe(false);
        });

        test('should reject IDs longer than 100 characters', () => {
            const longId = 'a'.repeat(101);
            const result = validateInput(safeIdSchema, longId);
            expect(result.success).toBe(false);
        });
    });

    describe('urlSchema', () => {
        test('should accept valid URLs', () => {
            const validUrls = [
                'https://example.com',
                'http://localhost:3000',
                'https://api.sam.gov/prod/opportunities',
            ];

            validUrls.forEach(url => {
                const result = validateInput(urlSchema, url);
                expect(result.success).toBe(true);
            });
        });

        test('should reject invalid URLs', () => {
            const invalidUrls = [
                'not-a-url',
                'ftp://example.com',
                '',
            ];

            invalidUrls.forEach(url => {
                const result = validateInput(urlSchema, url);
                expect(result.success).toBe(false);
            });
        });
    });

    describe('naicsCodeSchema', () => {
        test('should accept valid 6-digit NAICS codes', () => {
            const validCodes = ['333249', '541330', '238210'];

            validCodes.forEach(code => {
                const result = validateInput(naicsCodeSchema, code);
                expect(result.success).toBe(true);
            });
        });

        test('should reject invalid NAICS codes', () => {
            const invalidCodes = [
                '12345',    // Too short
                '1234567',  // Too long
                'abcdef',   // Letters
                '12-345',   // Contains hyphen
            ];

            invalidCodes.forEach(code => {
                const result = validateInput(naicsCodeSchema, code);
                expect(result.success).toBe(false);
            });
        });
    });

    describe('opportunitySchema', () => {
        test('should accept valid opportunity objects', () => {
            const validOpp = {
                id: 'abc-123',
                title: 'Test Opportunity',
                agency: 'Test Agency',
                naicsCode: '333249',
            };

            const result = validateInput(opportunitySchema, validOpp);
            expect(result.success).toBe(true);
        });

        test('should require id and title', () => {
            const noId = { title: 'Test' };
            const noTitle = { id: 'abc-123' };

            expect(validateInput(opportunitySchema, noId).success).toBe(false);
            expect(validateInput(opportunitySchema, noTitle).success).toBe(false);
        });

        test('should reject invalid opportunity ID', () => {
            const invalidOpp = {
                id: 'id<script>alert(1)</script>',
                title: 'Test',
            };

            const result = validateInput(opportunitySchema, invalidOpp);
            expect(result.success).toBe(false);
        });
    });

    describe('emailSubscriptionSchema', () => {
        test('should accept valid subscription', () => {
            const valid = {
                email: 'test@example.com',
                frequency: 'daily',
            };

            const result = validateInput(emailSubscriptionSchema, valid);
            expect(result.success).toBe(true);
        });

        test('should default frequency to daily', () => {
            const noFrequency = {
                email: 'test@example.com',
            };

            const result = validateInput(emailSubscriptionSchema, noFrequency);
            expect(result.success).toBe(true);
            expect(result.data.frequency).toBe('daily');
        });

        test('should reject invalid frequency', () => {
            const invalidFreq = {
                email: 'test@example.com',
                frequency: 'hourly',
            };

            const result = validateInput(emailSubscriptionSchema, invalidFreq);
            expect(result.success).toBe(false);
        });
    });
});

describe('validateInput', () => {
    test('should return success with data for valid input', () => {
        const result = validateInput(emailSchema, 'test@example.com');

        expect(result.success).toBe(true);
        expect(result.data).toBe('test@example.com');
    });

    test('should return failure with errors for invalid input', () => {
        const result = validateInput(emailSchema, 'invalid');

        expect(result.success).toBe(false);
        expect(result.errors).toBeDefined();
        expect(result.errors.length).toBeGreaterThan(0);
    });
});

describe('validateOrThrow', () => {
    test('should return data for valid input', () => {
        const result = validateOrThrow(emailSchema, 'test@example.com');
        expect(result).toBe('test@example.com');
    });

    test('should throw ValidationError for invalid input', () => {
        expect(() => {
            validateOrThrow(emailSchema, 'invalid');
        }).toThrow();
    });

    test('should include error details in thrown error', () => {
        try {
            validateOrThrow(emailSchema, 'invalid');
        } catch (error) {
            expect(error.name).toBe('ValidationError');
            expect(error.errors).toBeDefined();
        }
    });
});

describe('sanitizeHtml', () => {
    test('should escape HTML special characters', () => {
        expect(sanitizeHtml('<script>')).toBe('&lt;script&gt;');
        expect(sanitizeHtml('a & b')).toBe('a &amp; b');
        expect(sanitizeHtml('"quoted"')).toBe('&quot;quoted&quot;');
        expect(sanitizeHtml("'single'")).toBe('&#39;single&#39;');
    });

    test('should handle null/undefined', () => {
        expect(sanitizeHtml(null)).toBe('');
        expect(sanitizeHtml(undefined)).toBe('');
    });

    test('should preserve safe text', () => {
        expect(sanitizeHtml('Hello World')).toBe('Hello World');
        expect(sanitizeHtml('Test 123')).toBe('Test 123');
    });

    test('should prevent XSS attacks', () => {
        const xssAttempts = [
            '<script>alert("XSS")</script>',
            '<img src=x onerror=alert(1)>',
            '"><script>alert(1)</script>',
            "javascript:alert('XSS')",
        ];

        xssAttempts.forEach(attempt => {
            const sanitized = sanitizeHtml(attempt);
            expect(sanitized).not.toContain('<script>');
            expect(sanitized).not.toContain('onerror=');
        });
    });
});

describe('sanitizeJs', () => {
    test('should escape JavaScript special characters', () => {
        expect(sanitizeJs("'")).toBe("\\'");
        expect(sanitizeJs('"')).toBe('\\"');
        expect(sanitizeJs('\\')).toBe('\\\\');
        expect(sanitizeJs('\n')).toBe('\\n');
    });

    test('should handle null/undefined', () => {
        expect(sanitizeJs(null)).toBe('');
        expect(sanitizeJs(undefined)).toBe('');
    });

    test('should prevent injection in JS context', () => {
        const injection = "'); alert('XSS'); //";
        const sanitized = sanitizeJs(injection);

        expect(sanitized).not.toContain("');");
        expect(sanitized).toContain("\\'");
    });
});

describe('Integration: XSS Prevention', () => {
    test('should prevent stored XSS in opportunity titles', () => {
        const maliciousOpp = {
            id: 'safe-id-123',
            title: '<img src=x onerror=alert(document.cookie)>',
        };

        const result = validateInput(opportunitySchema, maliciousOpp);
        expect(result.success).toBe(true);

        // The title should be accepted (validation doesn't sanitize)
        // but when displayed, sanitizeHtml should prevent XSS
        const sanitized = sanitizeHtml(result.data.title);
        expect(sanitized).not.toContain('onerror=');
        expect(sanitized).toContain('&lt;img');
    });

    test('should prevent SQL injection in IDs', () => {
        const sqlInjection = {
            id: "1'; DROP TABLE users; --",
            title: 'Test',
        };

        const result = validateInput(opportunitySchema, sqlInjection);
        expect(result.success).toBe(false);
    });
});
