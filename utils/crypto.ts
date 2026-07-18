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

    // Since `encryptData` uses `new TextEncoder().encode(data)` to convert the Base64 
    // string into UTF-8 bytes before encryption, we must decode the bytes back to 
    // the original string using `TextDecoder`, preventing double base64-encoding.
    return new TextDecoder().decode(decrypted);
};

// ============================================================================
// INVITE-LINK KEY WRAPPING (symmetric, for sharing to not-yet-registered users)
//
// The document's AES key is wrapped under a random "invite secret" that only
// ever travels inside the invite link fragment (never sent to the server). The
// recipient reads the secret from the link, unwraps the document key, and
// re-wraps it with their own RSA public key. Keeps sharing end-to-end encrypted
// even for people who aren't on the app yet.
// ============================================================================

/** Wrap a hex key with a hex secret (AES-256-GCM). Returns base64(iv+ciphertext). */
export const wrapKeyWithSecret = async (keyHex: string, secretHex: string): Promise<string> => {
    const combined = await encryptData(keyHex, secretHex); // Uint8Array (iv + ciphertext)
    let binary = '';
    for (let i = 0; i < combined.length; i++) binary += String.fromCharCode(combined[i]);
    return (global.btoa || btoa)(binary);
};

/** Unwrap a key wrapped by wrapKeyWithSecret. Returns the original hex key. */
export const unwrapKeyWithSecret = async (wrappedBase64: string, secretHex: string): Promise<string> => {
    return await decryptData(wrappedBase64, secretHex);
};

/** Generate a random 256-bit invite secret (hex). */
export const generateInviteSecret = generateKey;

/**
 * Maximum file size we process in a single in-memory pass.
 * Kept conservative (10 MB) because encryption/watermarking buffers the whole
 * file in memory, which can OOM low-end Android devices for larger files.
 * This is the single source of truth for both the Upload and Share flows.
 */
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

/** Check if file size is within safe processing limits (see MAX_FILE_SIZE_BYTES). */
export const checkFileSize = (sizeBytes: number): boolean => {
    return sizeBytes <= MAX_FILE_SIZE_BYTES;
};

// ============================================================================
// RSA KEY MANAGEMENT — WebCrypto native first, node-forge fallback
// ============================================================================

/**
 * Generate an RSA-2048 key pair using node-forge.
 *
 * We use node-forge (pure JS) rather than WebCrypto for generation because
 * `react-native-quick-crypto`'s subtle.generateKey for RSA-OAEP is not reliably
 * available across the RN targets we ship to. Forge keeps the whole crypto
 * round-trip (generate → wrap → unwrap) inside one implementation, which avoids
 * cross-library OAEP interop risk.
 *
 * PERFORMANCE: this uses forge's *async* callback API, which splits the prime
 * search into chunks and yields to the event loop between them. That keeps the
 * JS thread responsive and avoids Android ANR ("Application Not Responding")
 * kills. Typical time is a few seconds on mid/low-end devices, so callers
 * (see KeyGenerationScreen) show a progress UI. Generation is also deferred
 * until first needed rather than run during app startup.
 */
export const generateKeyPair = async (): Promise<ForgeKeyPair> => {
    const startTime = Date.now();
    console.log('[Crypto] Generating RSA-2048 key pair (node-forge, async)...');

    // Seed forge's PRNG with native CSPRNG bytes. This gives forge high-quality
    // entropy for prime candidate selection.
    try {
        const seed = new Uint8Array(64);
        webcrypto.getRandomValues(seed);
        const seedStr = Array.from(seed).map(b => String.fromCharCode(b)).join('');
        forge.random.collect(seedStr);
    } catch (e) {
        console.warn('[Crypto] Could not seed forge PRNG:', e);
    }

    const KEYGEN_TIMEOUT_MS = 60000;

    const keyPair = await new Promise<any>((resolve, reject) => {
        const timeoutId = setTimeout(() => reject(new Error(
            'Key generation timed out. Please try again.'
        )), KEYGEN_TIMEOUT_MS);

        // Async callback API — non-blocking prime generation.
        forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 }, (err: any, keys: any) => {
            clearTimeout(timeoutId);
            if (err) reject(err);
            else resolve(keys);
        });
    });

    console.log(`[Crypto] RSA-2048 generated in ${Date.now() - startTime}ms`);

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

// ============================================================================
// RSA DIGITAL SIGNATURES (RSASSA-PKCS1-v1.5 + SHA-256)
//
// Used to make watermark provenance NON-REPUDIABLE: the document owner signs
// with their RSA private key (which only they hold), and anyone can verify with
// the owner's public key. Unlike an HMAC keyed on the shared document key, a
// recipient cannot forge or rewrite an owner signature.
// ============================================================================

/** Sign a UTF-8 string with an RSA private key. Returns a base64 signature. */
export const signData = async (data: string, privateKey: any): Promise<string> => {
    if (privateKey._isForge || privateKey.d) {
        const md = forge.md.sha256.create();
        md.update(data, 'utf8');
        const signature = privateKey.sign(md);
        return forge.util.encode64(signature);
    }
    // WebCrypto fallback (key must be imported for RSASSA-PKCS1-v1_5 / sign)
    const enc = new TextEncoder().encode(data);
    const sig = await webcrypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, privateKey, enc);
    return arrayBufferToBase64(sig);
};

/** Verify an RSA signature (base64) over a UTF-8 string with an RSA public key. */
export const verifySignature = async (data: string, signatureBase64: string, publicKey: any): Promise<boolean> => {
    try {
        if (publicKey._isForge || publicKey.n) {
            const md = forge.md.sha256.create();
            md.update(data, 'utf8');
            const signature = forge.util.decode64(signatureBase64);
            return publicKey.verify(md.digest().bytes(), signature);
        }
        const enc = new TextEncoder().encode(data);
        const binary = (global.atob || atob)(signatureBase64);
        const sigBuf = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) sigBuf[i] = binary.charCodeAt(i);
        return await webcrypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, publicKey, sigBuf, enc);
    } catch (e) {
        console.warn('[Crypto] verifySignature failed:', e);
        return false;
    }
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
