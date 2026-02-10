/**
 * Encryption Utilities
 * 
 * Implements client-side AES-256-GCM encryption for the Zero-Trust architecture.
 * Uses globalThis.crypto which is polyfilled by cryptoBootstrap.js at app startup.
 * 
 * SECURITY: This module REQUIRES the crypto bootstrap to run first.
 * It will NOT work in Expo Go - you MUST use a development client build.
 */

// Use the globally polyfilled crypto from cryptoBootstrap.js
const webcrypto = globalThis.crypto;

// Import node-forge for stable RSA operations (pure JS, no native crashes)
import forge from 'node-forge';

console.log('[Crypto] Using globalThis.crypto, subtle available:', !!webcrypto?.subtle);

// Polyfill for btoa/atob if missing (Common in RN)
const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
const btoa = (input) => {
    let str = input;
    let output = '';
    for (let block = 0, charCode, i = 0, map = chars;
        str.charAt(i | 0) || (map = '=', i % 1);
        output += map.charAt(63 & block >> 8 - i % 1 * 8)) {
        charCode = str.charCodeAt(i += 3 / 4);
        if (charCode > 0xFF) {
            throw new Error("'btoa' failed: The string to be encoded contains characters outside of the Latin1 range.");
        }
        block = block << 8 | charCode;
    }
    return output;
};

const atob = (input) => {
    let str = input.replace(/=+$/, '');
    let output = '';
    if (str.length % 4 == 1) {
        throw new Error("'atob' failed: The string to be decoded is not correctly encoded.");
    }
    for (let bc = 0, bs = 0, buffer, i = 0;
        buffer = str.charAt(i++);
        ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer,
            bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0) {
        buffer = chars.indexOf(buffer);
    }
    return output;
};

/**
 * Generate a random 32-byte key (256 bits for AES-256)
 * SECURITY: Uses react-native-quick-crypto's webcrypto - NO FALLBACKS
 */
export const generateKey = async () => {
    if (!webcrypto || !webcrypto.getRandomValues) {
        throw new Error(
            'react-native-quick-crypto not available.\n' +
            'This app requires a development client build:\n' +
            'npx expo prebuild --clean && npx expo run:android'
        );
    }

    const randomBytes = new Uint8Array(32);
    webcrypto.getRandomValues(randomBytes);

    // Convert to hex string for storage
    return Array.from(randomBytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
};

// Convert hex string to ArrayBuffer
const hexToArrayBuffer = (hex) => {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes.buffer;
};

// Convert ArrayBuffer to hex string
const arrayBufferToHex = (buffer) => {
    const bytes = new Uint8Array(buffer);
    return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
};

/**
 * Encrypt data using AES-256-GCM
 * SECURITY: Uses react-native-quick-crypto's webcrypto - NO FALLBACKS
 */
export const encryptData = async (data, keyHex) => {
    try {
        if (!webcrypto || !webcrypto.subtle) {
            throw new Error(
                'react-native-quick-crypto not available.\n' +
                'This app requires a development client build.'
            );
        }

        // Convert keys
        const keyBuffer = hexToArrayBuffer(keyHex);

        // Generate IV
        const iv = new Uint8Array(12);
        webcrypto.getRandomValues(iv);

        // Import Key
        const cryptoKey = await webcrypto.subtle.importKey(
            'raw',
            keyBuffer,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt']
        );

        // Prepare Data: Handle String or Uint8Array
        let dataBuffer;
        if (typeof data === 'string') {
            const encoder = new TextEncoder();
            dataBuffer = encoder.encode(data);
        } else if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
            dataBuffer = data;
        } else {
            throw new Error('encryptData expects string or Uint8Array');
        }

        // Encrypt
        const encrypted = await webcrypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv, tagLength: 128 },
            cryptoKey,
            dataBuffer
        );

        // Combine IV + Encrypted Data
        const combined = new Uint8Array(iv.length + encrypted.byteLength);
        combined.set(iv, 0);
        combined.set(new Uint8Array(encrypted), iv.length);

        // Return raw Uint8Array to avoid Base64 overhead
        return combined;
    } catch (error) {
        console.error('Encryption error:', error);
        throw new Error('Encryption failed: ' + error.message);
    }
};

/**
 * Decrypt data using AES-256-GCM
 * SECURITY: Uses react-native-quick-crypto's webcrypto - NO FALLBACKS
 */
export const decryptData = async (encryptedInput, keyHex) => {
    try {
        if (!webcrypto || !webcrypto.subtle) {
            throw new Error('react-native-quick-crypto not available.');
        }

        const keyBuffer = hexToArrayBuffer(keyHex);
        let combined;

        // Handle Base64 String or raw Uint8Array
        if (typeof encryptedInput === 'string') {
            const binaryString = (global.atob || atob)(encryptedInput);
            combined = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                combined[i] = binaryString.charCodeAt(i);
            }
        } else if (encryptedInput instanceof Uint8Array) {
            combined = encryptedInput;
        } else if (encryptedInput instanceof ArrayBuffer) {
            combined = new Uint8Array(encryptedInput);
        } else {
            throw new Error('decryptData expects Base64 string or Uint8Array');
        }

        const iv = combined.slice(0, 12);
        const encrypted = combined.slice(12);

        const cryptoKey = await webcrypto.subtle.importKey(
            'raw',
            keyBuffer,
            { name: 'AES-GCM', length: 256 },
            false,
            ['decrypt']
        );

        const decrypted = await webcrypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv, tagLength: 128 },
            cryptoKey,
            encrypted
        );

        // Return Base64 string for Viewer compatibility
        // (Viewer expects a base64 string to render PDF/Images)
        const bytes = new Uint8Array(decrypted);
        let binaryString = '';
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binaryString += String.fromCharCode(bytes[i]);
        }
        return (global.btoa || btoa)(binaryString);
    } catch (error) {
        console.error('Decryption error:', error);
        throw new Error('Decryption failed: ' + error.message);
    }
};

/**
 * Check if file size is within safe processing limits
 * PERFORMANCE: Limit reduced from 20MB to 10MB to prevent OOM on low-end devices
 * TODO: Implement streaming/chunked processing for larger files
 */
export const checkFileSize = (sizeBytes) => {
    const MB = 1024 * 1024;
    const MAX_SIZE_MB = 15;
    // STRICT SERVER LIMIT: Do not increase without scaling storage first
    return sizeBytes <= MAX_SIZE_MB * MB;
};

// ============================================================================
// RSA KEY MANAGEMENT - Using node-forge (pure JS, stable, no native crashes)
// ============================================================================

/**
 * Generate RSA-2048 Key Pair for Zero-Trust Architecture
 * Uses node-forge (pure JavaScript) - more stable than native crypto
 * Public Key -> Server (for sharing)
 * Private Key -> SecureStore (device only)
 */
export const generateKeyPair = async () => {
    console.log('[Crypto] generateKeyPair called (using node-forge)');

    try {
        const startTime = Date.now();
        console.log('[Crypto] Starting RSA-2048 key generation with node-forge...');

        // Generate RSA key pair using node-forge (pure JS - won't crash)
        // Use a worker-like approach with setTimeout to prevent UI blocking
        const keyPair = await new Promise((resolve, reject) => {
            // Small delay to let UI render
            setTimeout(() => {
                try {
                    const keys = forge.pki.rsa.generateKeyPair({
                        bits: 2048,
                        e: 0x10001, // 65537
                        workers: -1  // Use web workers if available
                    });
                    resolve(keys);
                } catch (err) {
                    reject(err);
                }
            }, 50);
        });

        const elapsed = Date.now() - startTime;
        console.log(`[Crypto] RSA Key pair generated successfully in ${elapsed}ms (node-forge)`);

        return {
            publicKey: keyPair.publicKey,
            privateKey: keyPair.privateKey,
            _isForge: true  // Flag to identify forge keys
        };
    } catch (error) {
        console.error('[Crypto] Key generation failed:', error);
        throw new Error('Key generation failed: ' + (error.message || 'Unknown error'));
    }
};

/**
 * Export public key to PEM-encoded base64
 */
export const exportPublicKey = async (publicKey) => {
    console.log('[Crypto] exportPublicKey called');

    // Handle forge key
    if (publicKey._isForge || publicKey.n) {
        const pem = forge.pki.publicKeyToPem(publicKey);
        // Extract the base64 content (remove PEM headers)
        const base64 = pem
            .replace('-----BEGIN PUBLIC KEY-----', '')
            .replace('-----END PUBLIC KEY-----', '')
            .replace(/\r?\n/g, '');
        return base64;
    }

    // Fallback to WebCrypto export
    const exported = await webcrypto.subtle.exportKey("spki", publicKey);
    return (global.btoa || btoa)(String.fromCharCode(...new Uint8Array(exported)));
};

/**
 * Export private key to PEM-encoded base64
 */
export const exportPrivateKey = async (privateKey) => {
    console.log('[Crypto] exportPrivateKey called');

    // Handle forge key
    if (privateKey._isForge || privateKey.d) {
        const pem = forge.pki.privateKeyToPem(privateKey);
        // Extract the base64 content (remove PEM headers)
        const base64 = pem
            .replace('-----BEGIN RSA PRIVATE KEY-----', '')
            .replace('-----END RSA PRIVATE KEY-----', '')
            .replace(/\r?\n/g, '');
        return base64;
    }

    // Fallback to WebCrypto export
    const exported = await webcrypto.subtle.exportKey("pkcs8", privateKey);
    return (global.btoa || btoa)(String.fromCharCode(...new Uint8Array(exported)));
};

/**
 * Import public key from base64-encoded PEM
 */
export const importPublicKey = async (base64) => {
    console.log('[Crypto] importPublicKey called');

    try {
        // Try to import as forge key first
        const pem = `-----BEGIN PUBLIC KEY-----\n${base64}\n-----END PUBLIC KEY-----`;
        const publicKey = forge.pki.publicKeyFromPem(pem);
        publicKey._isForge = true;
        return publicKey;
    } catch (forgeError) {
        console.log('[Crypto] Forge import failed, trying WebCrypto:', forgeError.message);

        // Fallback to WebCrypto import
        const binary = (global.atob || atob)(base64);
        const buffer = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i);

        return await webcrypto.subtle.importKey(
            "spki",
            buffer,
            { name: "RSA-OAEP", hash: "SHA-256" },
            false,
            ["encrypt"]
        );
    }
};

/**
 * Import private key from base64-encoded PEM
 */
export const importPrivateKey = async (base64) => {
    console.log('[Crypto] importPrivateKey called');

    try {
        // Try to import as forge key first (RSA PRIVATE KEY format)
        const pem = `-----BEGIN RSA PRIVATE KEY-----\n${base64}\n-----END RSA PRIVATE KEY-----`;
        const privateKey = forge.pki.privateKeyFromPem(pem);
        privateKey._isForge = true;
        return privateKey;
    } catch (forgeError) {
        console.log('[Crypto] Forge private key import failed, trying WebCrypto:', forgeError.message);

        // Fallback to WebCrypto import (PKCS8 format)
        const binary = (global.atob || atob)(base64);
        const buffer = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i);

        return await webcrypto.subtle.importKey(
            "pkcs8",
            buffer,
            { name: "RSA-OAEP", hash: "SHA-256" },
            false,
            ["decrypt"]
        );
    }
};

/**
 * Encrypt AES Key with Recipient's Public Key (RSA-OAEP)
 */
export const encryptKey = async (aesKeyHex, publicKey) => {
    console.log('[Crypto] encryptKey called');

    // Handle forge key
    if (publicKey._isForge || publicKey.n) {
        const encrypted = publicKey.encrypt(aesKeyHex, 'RSA-OAEP', {
            md: forge.md.sha256.create(),
            mgf1: { md: forge.md.sha256.create() }
        });
        return forge.util.encode64(encrypted);
    }

    // Fallback to WebCrypto
    const encoder = new TextEncoder();
    const data = encoder.encode(aesKeyHex);
    const encrypted = await webcrypto.subtle.encrypt(
        { name: "RSA-OAEP" },
        publicKey,
        data
    );
    return (global.btoa || btoa)(String.fromCharCode(...new Uint8Array(encrypted)));
};

/**
 * Decrypt AES Key with My Private Key (RSA-OAEP)
 */
export const decryptKey = async (encryptedBase64, privateKey) => {
    console.log('[Crypto] decryptKey called');

    // Handle forge key
    if (privateKey._isForge || privateKey.d) {
        const encrypted = forge.util.decode64(encryptedBase64);
        const decrypted = privateKey.decrypt(encrypted, 'RSA-OAEP', {
            md: forge.md.sha256.create(),
            mgf1: { md: forge.md.sha256.create() }
        });
        return decrypted;
    }

    // Fallback to WebCrypto
    const binary = (global.atob || atob)(encryptedBase64);
    const buffer = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i);

    const decrypted = await webcrypto.subtle.decrypt(
        { name: "RSA-OAEP" },
        privateKey,
        buffer
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
};
