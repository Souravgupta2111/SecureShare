/**
 * Integration Test for Full Crypto Flow
 * 
 * Simulates the key exchange protocol using Node's native WebCrypto implementation
 * to ensure that our logic holds up when using real crypto primitives.
 */

// MOCK: Redirect react-native-quick-crypto to Node's webcrypto
jest.mock('react-native-quick-crypto', () => {
    const { webcrypto } = require('node:crypto');
    return { webcrypto };
});

// Import our utilities (which will now use Node's webcrypto)
import {
    generateKey,
    encryptData,
    decryptData,
    generateKeyPair,
    exportPublicKey,
    importPublicKey,
    exportPrivateKey,
    importPrivateKey,
    encryptKey,
    decryptKey
} from '../utils/crypto';

describe('End-to-End Secure Sharing Flow', () => {

    // Test Data
    const SECRET_DOC_CONTENT = "This is a Top Secret Document. 007 Eyes Only.";

    // Actors
    let alice = {}; // Owner
    let bob = {};   // Recipient

    beforeAll(async () => {
        // 1. Setup Identities (Zero-Trust)
        alice.keyPair = await generateKeyPair();
        bob.keyPair = await generateKeyPair();

        // Export/Import check (simulate network transmission)
        alice.pubPem = await exportPublicKey(alice.keyPair.publicKey);
        bob.pubPem = await exportPublicKey(bob.keyPair.publicKey);

        // Simulating PrivKey storage is just keeping the object or PEM
        alice.privPem = await exportPrivateKey(alice.keyPair.privateKey);
        bob.privPem = await exportPrivateKey(bob.keyPair.privateKey);
    });

    test('Full Sharing Lifecycle', async () => {
        // --- STEP 1: Alice Encrypts Document ---

        // Generate AES Key
        const docKey = await generateKey();
        expect(docKey).toHaveLength(64); // 32 bytes hex

        // Encrypt Content
        const encryptedContent = await encryptData(SECRET_DOC_CONTENT, docKey);
        expect(encryptedContent).toBeInstanceOf(Uint8Array); // New behavior: returns Uint8Array

        // --- STEP 2: Alice Secures Key for Herself ---

        // Import her own public key (simulating fetching from profile)
        const alicePub = await importPublicKey(alice.pubPem);

        // Encrypt AES key with Alice's Public Key
        const encryptedKeyForAlice = await encryptKey(docKey, alicePub);
        expect(typeof encryptedKeyForAlice).toBe('string'); // Base64

        // --- STEP 3: Alice Shares with Bob ---

        // Alice fetches Bob's Public Key
        const bobPub = await importPublicKey(bob.pubPem);

        // Alice needs to get the raw key (she has it in memory as docKey here, 
        // but in a real "Share Later" scenario, she would decrypt her stored key first)

        // Let's simulate "Share Later": Alice lost raw docKey, recovers it from storage
        const alicePriv = await importPrivateKey(alice.privPem);
        const recoveredKey = await decryptKey(encryptedKeyForAlice, alicePriv);
        expect(recoveredKey).toBe(docKey); // Verify recovery

        // Now encrypt for Bob
        const encryptedKeyForBob = await encryptKey(recoveredKey, bobPub);
        expect(encryptedKeyForBob).not.toBe(encryptedKeyForAlice); // Different ciphertexts

        // --- STEP 4: Bob Receives and Views ---

        // Bob logs in, fetches his private key
        const bobPriv = await importPrivateKey(bob.privPem);

        // Bob decrypts the AES key
        const bobDecryptedKey = await decryptKey(encryptedKeyForBob, bobPriv);
        expect(bobDecryptedKey).toBe(docKey); // THE MOMENT OF TRUTH

        // Bob uses AES key to decrypt document
        // Note: decryptData in crypto.js now returns base64 string (view compatible) 
        // OR we might want to check the raw logic if we updated it?
        // Let's look at crypto.js logic: returns base64 string.
        const decryptedDocBase64 = await decryptData(encryptedContent, bobDecryptedKey);

        // Convert base64 result back to string to verify
        const decodedContent = atob(decryptedDocBase64);
        expect(decodedContent).toBe(SECRET_DOC_CONTENT);
    });
});
