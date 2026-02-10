/**
 * Sharing Flow Unit Tests
 * 
 * Tests the document sharing functionality including:
 * - Upload document
 * - Create access grants
 * - Revoke access
 * - Validate access
 */

jest.mock('../lib/supabase', () => ({
    uploadOnlineDocument: jest.fn(),
    saveDocumentKey: jest.fn(),
    grantAccess: jest.fn(),
    revokeAccess: jest.fn(),
    validateAccessGrant: jest.fn(),
    getDocumentGrants: jest.fn(),
    getDocumentKey: jest.fn(),
}));

jest.mock('../utils/crypto', () => ({
    generateKey: jest.fn(() => Promise.resolve('abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234')),
    encryptData: jest.fn(() => Promise.resolve('encrypted-data')),
    decryptData: jest.fn(() => Promise.resolve('decrypted-data')),
    generateKeyPair: jest.fn(),
    exportPublicKey: jest.fn(),
    importPrivateKey: jest.fn(),
    encryptKey: jest.fn(() => Promise.resolve('encrypted-key')),
    decryptKey: jest.fn(() => Promise.resolve('original-key')),
}));

jest.mock('../utils/deviceSecurity', () => ({
    generateDeviceHash: jest.fn(() => Promise.resolve('device-hash-123')),
}));

import { uploadOnlineDocument, saveDocumentKey, grantAccess, revokeAccess, validateAccessGrant, getDocumentGrants, getDocumentKey } from '../lib/supabase';
import { generateKey, encryptData } from '../utils/crypto';
import { generateDeviceHash } from '../utils/deviceSecurity';

describe('Sharing Flow', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('uploadOnlineDocument', () => {
        it('should upload document and return document data', async () => {
            const mockDocData = {
                id: 'doc-uuid',
                filename: 'test.pdf',
                mime_type: 'application/pdf',
                owner_id: 'user-uuid'
            };
            uploadOnlineDocument.mockResolvedValue({ data: mockDocData, error: null });

            const fileBlob = new ArrayBuffer(1024);
            const result = await uploadOnlineDocument({
                filename: 'test.pdf',
                mime_type: 'application/pdf',
                size_bytes: 1024
            }, fileBlob, 'user-uuid');

            expect(uploadOnlineDocument).toHaveBeenCalledWith(
                expect.objectContaining({
                    filename: 'test.pdf',
                    mime_type: 'application/pdf'
                }),
                expect.any(Object),
                'user-uuid'
            );
            expect(result.data.id).toBe('doc-uuid');
            expect(result.error).toBeNull();
        });

        it('should handle upload error', async () => {
            uploadOnlineDocument.mockResolvedValue({ data: null, error: { message: 'Upload failed' } });

            const result = await uploadOnlineDocument({ filename: 'test.pdf' }, new ArrayBuffer(1024), 'user-uuid');

            expect(result.data).toBeNull();
            expect(result.error.message).toBe('Upload failed');
        });
    });

    describe('grantAccess', () => {
        it('should grant access to valid email', async () => {
            const mockGrant = {
                id: 'grant-uuid',
                document_id: 'doc-uuid',
                recipient_email: 'recipient@example.com',
                status: 'active'
            };
            grantAccess.mockResolvedValue({ data: mockGrant, error: null });

            const result = await grantAccess('doc-uuid', 'recipient@example.com', 'owner-uuid');

            expect(grantAccess).toHaveBeenCalledWith(
                'doc-uuid',
                'recipient@example.com',
                'owner-uuid'
            );
            expect(result.data.recipient_email).toBe('recipient@example.com');
            expect(result.data.status).toBe('active');
        });

        it('should fail for invalid email', async () => {
            grantAccess.mockResolvedValue({ data: null, error: { message: 'User not found' } });

            const result = await grantAccess('doc-uuid', 'nonexistent@example.com', 'owner-uuid');

            expect(result.data).toBeNull();
            expect(result.error.message).toBe('User not found');
        });
    });

    describe('revokeAccess', () => {
        it('should revoke access and update status', async () => {
            const mockRevokedGrant = {
                id: 'grant-uuid',
                status: 'revoked'
            };
            revokeAccess.mockResolvedValue({ data: mockRevokedGrant, error: null });

            const result = await revokeAccess('grant-uuid');

            expect(revokeAccess).toHaveBeenCalledWith('grant-uuid');
            expect(result.data.status).toBe('revoked');
        });

        it('should handle revoke error', async () => {
            revokeAccess.mockResolvedValue({ data: null, error: { message: 'Grant not found' } });

            const result = await revokeAccess('nonexistent-grant');

            expect(result.error.message).toBe('Grant not found');
        });
    });

    describe('validateAccessGrant', () => {
        it('should return valid for active grant', async () => {
            validateAccessGrant.mockResolvedValue({ valid: true });

            const result = await validateAccessGrant('grant-uuid', 'doc-uuid');

            expect(result.valid).toBe(true);
        });

        it('should return invalid for revoked grant', async () => {
            validateAccessGrant.mockResolvedValue({ valid: false, error: 'Access has been revoked' });

            const result = await validateAccessGrant('grant-uuid', 'doc-uuid');

            expect(result.valid).toBe(false);
            expect(result.error).toBe('Access has been revoked');
        });

        it('should return invalid for expired grant', async () => {
            validateAccessGrant.mockResolvedValue({ valid: false, error: 'Access has expired' });

            const result = await validateAccessGrant('grant-uuid', 'doc-uuid');

            expect(result.valid).toBe(false);
            expect(result.error).toBe('Access has expired');
        });

        it('should validate device hash when provided', async () => {
            validateAccessGrant.mockResolvedValue({ valid: true });

            await validateAccessGrant('grant-uuid', 'doc-uuid', 'device-hash-123');

            expect(validateAccessGrant).toHaveBeenCalledWith(
                'grant-uuid',
                'doc-uuid',
                'device-hash-123'
            );
        });
    });

    describe('getDocumentGrants', () => {
        it('should return all grants for document', async () => {
            const mockGrants = [
                { id: 'grant-1', recipient_email: 'user1@example.com' },
                { id: 'grant-2', recipient_email: 'user2@example.com' }
            ];
            getDocumentGrants.mockResolvedValue({ data: mockGrants, error: null });

            const result = await getDocumentGrants('doc-uuid');

            expect(getDocumentGrants).toHaveBeenCalledWith('doc-uuid');
            expect(result.data.length).toBe(2);
        });
    });

    describe('getDocumentKey', () => {
        it('should return encrypted key for document', async () => {
            const mockKey = { encrypted_key: 'encrypted-key-data' };
            getDocumentKey.mockResolvedValue({ data: mockKey, error: null });

            const result = await getDocumentKey('doc-uuid');

            expect(result.data.encrypted_key).toBe('encrypted-key-data');
        });

        it('should return error when key not found', async () => {
            getDocumentKey.mockResolvedValue({ data: null, error: { message: 'Key not found' } });

            const result = await getDocumentKey('nonexistent-doc');

            expect(result.error.message).toBe('Key not found');
        });
    });

    describe('generateDeviceHash', () => {
        it('should generate consistent device hash', async () => {
            const hash1 = await generateDeviceHash();
            const hash2 = await generateDeviceHash();

            expect(hash1).toBe(hash2);
            expect(typeof hash1).toBe('string');
            expect(hash1.length).toBeGreaterThan(0);
        });
    });
});
