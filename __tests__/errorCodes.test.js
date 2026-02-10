/**
 * Error Handling Unit Tests
 * 
 * Tests the error codes utility and error handling functions.
 */

// Mock the analytics queue and supabase FIRST
jest.mock('../lib/supabase', () => ({
    getCurrentUserId: jest.fn(() => Promise.resolve('user-uuid-123')),
    logAnalyticsEvent: jest.fn(() => Promise.resolve({ data: {}, error: null })),
    logSecurityEvent: jest.fn(() => Promise.resolve({ data: {}, error: null })),
}));

jest.mock('../utils/analyticsQueue', () => ({
    queueAnalyticsEvent: jest.fn(() => Promise.resolve()),
    queueSecurityEvent: jest.fn(() => Promise.resolve()),
}));

const { ERROR_CODES, getErrorByCode, handleError } = require('../utils/errorCodes');
const { queueAnalyticsEvent, queueSecurityEvent } = require('../utils/analyticsQueue');

describe('Error Handling', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('ERROR_CODES structure', () => {
        it('should have all required error categories', () => {
            expect(ERROR_CODES.AUTH_NOT_SIGNED_IN).toBeDefined();
            expect(ERROR_CODES.UPLOAD_FILE_TOO_LARGE).toBeDefined();
            expect(ERROR_CODES.ACCESS_DENIED).toBeDefined();
            expect(ERROR_CODES.DECRYPT_FAILED).toBeDefined();
            expect(ERROR_CODES.WATERMARK_INVALID).toBeDefined();
            expect(ERROR_CODES.GENERAL_UNKNOWN).toBeDefined();
        });

        it('should have recoverable flag on all errors', () => {
            Object.values(ERROR_CODES).forEach((error) => {
                expect(typeof error.recoverable).toBe('boolean');
            });
        });

        it('should have severity level on all errors', () => {
            const validSeverities = ['info', 'warning', 'error'];
            Object.values(ERROR_CODES).forEach((error) => {
                expect(validSeverities).toContain(error.severity);
            });
        });
    });

    describe('getErrorByCode', () => {
        it('should return correct error for AUTH_NOT_SIGNED_IN', () => {
            const error = getErrorByCode('AUTH_NOT_SIGNED_IN');
            expect(error.message).toBe('Please sign in to continue');
            expect(error.title).toBe('Not Signed In');
        });

        it('should return GENERAL_UNKNOWN for invalid code', () => {
            const error = getErrorByCode('INVALID_CODE');
            expect(error.message).toBeDefined();
            expect(error.title).toBeDefined();
        });

        it('should return correct upload errors', () => {
            expect(getErrorByCode('UPLOAD_FILE_TOO_LARGE').message).toContain('too large');
            expect(getErrorByCode('UPLOAD_NETWORK_ERROR').message).toContain('Network error');
        });

        it('should return correct access errors', () => {
            expect(getErrorByCode('ACCESS_DENIED').message).toContain('permission');
            expect(getErrorByCode('ACCESS_EXPIRED').message).toContain('expired');
            expect(getErrorByCode('ACCESS_REVOKED').message).toContain('revoked');
        });

        it('should return security errors with security flag', () => {
            expect(getErrorByCode('WATERMARK_INVALID').security).toBe(true);
            expect(getErrorByCode('WATERMARK_MISSING').security).toBe(true);
        });

        it('should have unique codes', () => {
            const codes = Object.keys(ERROR_CODES);
            const uniqueCodes = new Set(codes);
            expect(codes.length).toBe(uniqueCodes.size);
        });

        it('should follow naming convention', () => {
            Object.keys(ERROR_CODES).forEach((code) => {
                expect(code).toMatch(/^[A-Z]+(_[A-Z0-9]+)*$/);
            });
        });
    });

    describe('handleError', () => {
        it('should handle string error code AUTH_NOT_SIGNED_IN', async () => {
            const result = await handleError('AUTH_NOT_SIGNED_IN', { screen: 'Home' });
            expect(result.code).toBe('AUTH_NOT_SIGNED_IN');
            expect(result.severity).toBe('info');
        });

        it('should handle error object with code', async () => {
            const error = new Error('Test error');
            error.code = 'UPLOAD_NETWORK_ERROR';
            const result = await handleError(error, { screen: 'Upload' });
            expect(result.code).toBe('UPLOAD_NETWORK_ERROR');
            expect(result.message).toBe('Test error');
        });

        it('should handle generic error', async () => {
            const result = await handleError(new Error('Something went wrong'));
            expect(result.code).toBe('GENERAL_UNKNOWN');
            expect(result.message).toBe('Something went wrong');
        });

        it('should queue analytics event for non-security errors', async () => {
            await handleError('AUTH_SESSION_EXPIRED', { screen: 'Auth' });
            expect(queueAnalyticsEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    event_type: 'app_error',
                    metadata: expect.objectContaining({
                        error_code: 'AUTH_SESSION_EXPIRED',
                        screen: 'Auth',
                    }),
                })
            );
        });

        it('should queue security event for security errors', async () => {
            await handleError('WATERMARK_INVALID', { screen: 'Viewer', documentId: 'doc-123' });
            expect(queueSecurityEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    document_id: 'doc-123',
                    event_type: 'error',
                    metadata: expect.objectContaining({
                        error_code: 'WATERMARK_INVALID',
                    }),
                })
            );
        });

        it('should include context in error metadata', async () => {
            await handleError('UPLOAD_SERVER_ERROR', {
                screen: 'Upload',
                action: 'selectFile',
                documentId: 'doc-456',
            });
            expect(queueAnalyticsEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    metadata: expect.objectContaining({
                        screen: 'Upload',
                        action: 'selectFile',
                    }),
                })
            );
        });
    });
});
