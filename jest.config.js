/**
 * Jest Configuration for Singh Automation
 * @type {import('jest').Config}
 */
export default {
    // Use ES modules
    transform: {},

    // Test environment
    testEnvironment: 'node',

    // Test file patterns
    testMatch: [
        '**/tests/**/*.test.js',
        '**/__tests__/**/*.js',
    ],

    // Ignore patterns
    testPathIgnorePatterns: [
        '/node_modules/',
        '/dist/',
    ],

    // Coverage configuration
    collectCoverageFrom: [
        'lib/**/*.js',
        'middleware/**/*.js',
        'api/**/*.js',
        '!**/node_modules/**',
    ],

    // Coverage thresholds
    coverageThreshold: {
        global: {
            branches: 70,
            functions: 70,
            lines: 70,
            statements: 70,
        },
    },

    // Coverage reporters
    coverageReporters: ['text', 'lcov', 'html'],

    // Module file extensions
    moduleFileExtensions: ['js', 'mjs', 'json'],

    // Verbose output
    verbose: true,

    // Clear mocks between tests
    clearMocks: true,

    // Detect open handles
    detectOpenHandles: true,

    // Force exit after tests complete
    forceExit: true,
};
