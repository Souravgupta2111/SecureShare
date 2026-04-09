/**
 * Encryption Utilities (TypeScript)
 * 
 * AES-256-GCM encryption via WebCrypto (react-native-quick-crypto).
 * RSA-2048 via WebCrypto native (fast) with node-forge fallback (slow but stable).
 * 
 * SECURITY: Requires cryptoBootstrap.js to run first.
 * Will NOT work in Expo Go — requires development client build.
 */

// @ts-ignore — globalThis.crypto polyfilled by cryptoBootstrap.js
const webcrypto: Crypto = globalThis.crypto;

// node-forge for RSA fallback (pure JS)
// @ts-ignore
import forge from 'node-forge';

type ForgeKeyPair = { publicKey: any; privateKey: any; _isForge?: boolean };

console.log('[Crypto] Using globalThis.crypto, subtle available:', !!webcrypto?.subtle);

// ============================================================================
// POLYFILLS
// ============================================================================

const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

const btoa = (input: string): string => {
    let str = input;
    let output = '';
    for (let block = 0, charCode: number, i = 0, map = chars;
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

const atob = (input: string): string => {
    let str = input.replace(/=+$/, '');
    let output = '';
    if (str.length % 4 == 1) {
        throw new Error("'atob' failed: The string to be decoded is not correctly encoded.");
    }
    for (let bc = 0, bs = 0, buffer: any, i = 0;
        buffer = str.charAt(i++);
        ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer,
            bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0) {
        buffer = chars.indexOf(buffer);
    }
    return output;
};

// ============================================================================
// AES-256-GCM (always via WebCrypto — fast native C++)
// ============================================================================

const hexToArrayBuffer = (hex: string): ArrayBuffer => {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes.buffer;
};

const arrayBufferToHex = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
};

/** Generate a random 32-byte AES-256 key (hex string) */
export const generateKey = async (): Promise<string> => {
    if (!webcrypto || !webcrypto.getRandomValues) {
        throw new Error(
            'react-native-quick-crypto not available.\n' +
            'This app requires a development client build:\n' +
            'npx expo prebuild --clean && npx expo run:android'
        );
    }
    const randomBytes = new Uint8Array(32);
    webcrypto.getRandomValues(randomBytes);
    return Array.from(randomBytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
};

/** Encrypt data using AES-256-GCM. Returns IV + ciphertext as Uint8Array. */
export const encryptData = async (data: string | Uint8Array | ArrayBuffer, keyHex: string): Promise<Uint8Array> => {
    if (!webcrypto?.subtle) {
        throw new Error('react-native-quick-crypto not available.');
    }

    const keyBuffer = hexToArrayBuffer(keyHex);
    const iv = new Uint8Array(12);
    webcrypto.getRandomValues(iv);

    const cryptoKey = await webcrypto.subtle.importKey(
        'raw', keyBuffer, { name: 'AES-GCM', length: 256 }, false, ['encrypt']
    );

    let dataBuffer: ArrayBuffer;
    if (typeof data === 'string') {
        const encoded = new TextEncoder().encode(data);
        // TextEncoder's output may share a larger buffer; copy to exact-sized ArrayBuffer
        dataBuffer = encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) as ArrayBuffer;
    } else if (data instanceof ArrayBuffer) {
        dataBuffer = data;
    } else if (data instanceof Uint8Array) {
        // CRITICAL: If data is a subarray/slice, .buffer is the FULL underlying ArrayBuffer.
        // We must extract only the viewed portion to avoid encrypting wrong bytes.
        dataBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    } else {
        throw new Error('encryptData expects string or Uint8Array');
    }

    const encrypted = await webcrypto.subtle.encrypt(
        { name: 'AES-GCM', iv, tagLength: 128 }, cryptoKey, dataBuffer
    );

    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);
    return combined;
};

/** Decrypt AES-256-GCM data. Accepts base64 string or Uint8Array. Returns base64 string. */
export const decryptData = async (encryptedInput: string | Uint8Array | ArrayBuffer, keyHex: string): Promise<string> => {
    if (!webcrypto?.subtle) {
        throw new Error('react-native-quick-crypto not available.');
    }

    const keyBuffer = hexToArrayBuffer(keyHex);
    let combined: Uint8Array;

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
        'raw', keyBuffer, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
    );

    const decrypted = await webcrypto.subtle.decrypt(
        { name: 'AES-GCM', iv, tagLength: 128 }, cryptoKey, encrypted
    );

    const bytes = new Uint8Array(decrypted);
    let binaryString = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binaryString += String.fromCharCode(bytes[i]);
    }
    return (global.btoa || btoa)(binaryString);
};

/** Check if file size is within safe processing limits (15 MB) */
export const checkFileSize = (sizeBytes: number): boolean => {
    return sizeBytes <= 15 * 1024 * 1024;
};

// ============================================================================
// RSA KEY MANAGEMENT — WebCrypto native first, node-forge fallback
// ============================================================================

/**
 * Generate RSA-2048 Key Pair.
 * Tries WebCrypto (native C++, <100ms) first.
 * Falls back to node-forge (pure JS, 3-10s) if WebCrypto RSA is unavailable.
 */
export const generateKeyPair = async (): Promise<ForgeKeyPair> => {
    console.log('[Crypto] generateKeyPair called');
    const startTime = Date.now();

    // --- Attempt 1: WebCrypto native RSA (fast) ---
    if (webcrypto?.subtle) {
        try {
            console.log('[Crypto] Trying WebCrypto native RSA generation...');
            const keyPair = await webcrypto.subtle.generateKey(
                {
                    name: 'RSA-OAEP',
                    modulusLength: 2048,
                    publicExponent: new Uint8Array([1, 0, 1]), // 65537
                    hash: 'SHA-256',
                },
                true, // extractable — needed for PEM export
                ['encrypt', 'decrypt']
            );

            const elapsed = Date.now() - startTime;
            console.log(`[Crypto] WebCrypto RSA generated in ${elapsed}ms (native)`);

            // Export to SPKI/PKCS8 DER → base64 PEM for compatibility
            const pubDer = await webcrypto.subtle.exportKey('spki', keyPair.publicKey);
            const privDer = await webcrypto.subtle.exportKey('pkcs8', keyPair.privateKey);

            // Import into forge for consistent key format across the app
            const pubPem = `-----BEGIN PUBLIC KEY-----\n${arrayBufferToBase64(pubDer)}\n-----END PUBLIC KEY-----`;
            const privPem = `-----BEGIN PRIVATE KEY-----\n${arrayBufferToBase64(privDer)}\n-----END PRIVATE KEY-----`;

            // Parse into forge keys so encrypt/decrypt paths stay consistent
            const forgePub = forge.pki.publicKeyFromPem(pubPem);
            forgePub._isForge = true;

            // PKCS8 → RSA private key via forge ASN.1
            const privAsn1 = forge.asn1.fromDer(forge.util.decode64(arrayBufferToBase64(privDer)));
            const privInfo = forge.pki.privateKeyFromAsn1(forge.pki.wrapRsaPrivateKey(privAsn1));
            privInfo._isForge = true;

            return { publicKey: forgePub, privateKey: privInfo, _isForge: true };
        } catch (wcError) {
            console.warn('[Crypto] WebCrypto RSA failed, falling back to forge:', (wcError as Error).message);
        }
    }

    // --- Attempt 2: node-forge (slow but guaranteed) ---
    console.log('[Crypto] Using node-forge RSA generation (pure JS, may take 3-10s)...');
    const KEYGEN_TIMEOUT_MS = 15000;

    const keyPair = await Promise.race([
        new Promise<any>((resolve, reject) => {
            setTimeout(() => {
                try {
                    const keys = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
                    resolve(keys);
                } catch (err) { reject(err); }
            }, 100);
        }),
        new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(
                'Key generation timed out (>15s). Please try again.'
            )), KEYGEN_TIMEOUT_MS)
        ),
    ]);

    const elapsed = Date.now() - startTime;
    console.log(`[Crypto] RSA generated in ${elapsed}ms (node-forge)`);

    return { publicKey: keyPair.publicKey, privateKey: keyPair.privateKey, _isForge: true };
};

// Helper: ArrayBuffer → base64 string
const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return (global.btoa || btoa)(binary);
};

/** Export public key to base64 (PEM content without headers) */
export const exportPublicKey = async (publicKey: any): Promise<string> => {
    if (publicKey._isForge || publicKey.n) {
        const pem = forge.pki.publicKeyToPem(publicKey);
        return pem
            .replace('-----BEGIN PUBLIC KEY-----', '')
            .replace('-----END PUBLIC KEY-----', '')
            .replace(/\r?\n/g, '');
    }
    const exported = await webcrypto.subtle.exportKey('spki', publicKey);
    return arrayBufferToBase64(exported);
};

/** Export private key to base64 (PEM content without headers) */
export const exportPrivateKey = async (privateKey: any): Promise<string> => {
    if (privateKey._isForge || privateKey.d) {
        const pem = forge.pki.privateKeyToPem(privateKey);
        return pem
            .replace('-----BEGIN RSA PRIVATE KEY-----', '')
            .replace('-----END RSA PRIVATE KEY-----', '')
            .replace(/\r?\n/g, '');
    }
    const exported = await webcrypto.subtle.exportKey('pkcs8', privateKey);
    return arrayBufferToBase64(exported);
};

/** Import public key from base64 PEM content */
export const importPublicKey = async (base64: string): Promise<any> => {
    try {
        const pem = `-----BEGIN PUBLIC KEY-----\n${base64}\n-----END PUBLIC KEY-----`;
        const publicKey = forge.pki.publicKeyFromPem(pem);
        publicKey._isForge = true;
        return publicKey;
    } catch (_forgeError) {
        const binary = (global.atob || atob)(base64);
        const buffer = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i);
        return await webcrypto.subtle.importKey(
            'spki', buffer, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']
        );
    }
};

/** Import private key from base64 PEM content */
export const importPrivateKey = async (base64: string): Promise<any> => {
    try {
        const pem = `-----BEGIN RSA PRIVATE KEY-----\n${base64}\n-----END RSA PRIVATE KEY-----`;
        const privateKey = forge.pki.privateKeyFromPem(pem);
        privateKey._isForge = true;
        return privateKey;
    } catch (_forgeError) {
        const binary = (global.atob || atob)(base64);
        const buffer = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i);
        return await webcrypto.subtle.importKey(
            'pkcs8', buffer, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt']
        );
    }
};

/** Encrypt AES key with recipient's RSA public key (RSA-OAEP) */
export const encryptKey = async (aesKeyHex: string, publicKey: any): Promise<string> => {
    if (publicKey._isForge || publicKey.n) {
        const encrypted = publicKey.encrypt(aesKeyHex, 'RSA-OAEP', {
            md: forge.md.sha256.create(),
            mgf1: { md: forge.md.sha256.create() }
        });
        return forge.util.encode64(encrypted);
    }
    const data = new TextEncoder().encode(aesKeyHex);
    const encrypted = await webcrypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, data);
    return arrayBufferToBase64(encrypted);
};

/** Decrypt AES key with my RSA private key (RSA-OAEP) */
export const decryptKey = async (encryptedBase64: string, privateKey: any): Promise<string> => {
    if (privateKey._isForge || privateKey.d) {
        const encrypted = forge.util.decode64(encryptedBase64);
        return privateKey.decrypt(encrypted, 'RSA-OAEP', {
            md: forge.md.sha256.create(),
            mgf1: { md: forge.md.sha256.create() }
        });
    }
    const binary = (global.atob || atob)(encryptedBase64);
    const buffer = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i);
    const decrypted = await webcrypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, buffer);
    return new TextDecoder().decode(decrypted);
};
