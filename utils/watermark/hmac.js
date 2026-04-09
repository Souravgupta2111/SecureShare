/**
 * Watermark HMAC Signature Module
 * 
 * Cryptographic HMAC-SHA256 signatures for watermark payload integrity.
 * Prevents tampering and unauthorized modification of watermark data.
 * 
 * Signed payload format: documentUUID|email|timestamp|deviceHash|HMAC_SIGNATURE
 */

// @ts-ignore — polyfilled by cryptoBootstrap.js
const webcrypto = globalThis.crypto;

/**
 * Generate HMAC-SHA256 signature for a watermark payload.
 * @param payload - Data to sign (e.g., "docUUID|email|ts|deviceHash")
 * @param documentKey - Hex-encoded document encryption key
 * @returns 64-character hex signature
 */
export const generateWatermarkSignature = async (payload, documentKey) => {
    if (!webcrypto?.subtle) {
        throw new Error('WebCrypto not available for HMAC generation');
    }

    const keyBytes = new Uint8Array(documentKey.length / 2);
    for (let i = 0; i < documentKey.length; i += 2) {
        keyBytes[i / 2] = parseInt(documentKey.substr(i, 2), 16);
    }

    const cryptoKey = await webcrypto.subtle.importKey(
        'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );

    const payloadBytes = new TextEncoder().encode(payload);
    const signature = await webcrypto.subtle.sign('HMAC', cryptoKey, payloadBytes);

    const arr = new Uint8Array(signature);
    let hex = '';
    for (let i = 0; i < arr.length; i++) {
        hex += arr[i].toString(16).padStart(2, '0');
    }
    return hex;
};

/**
 * Verify HMAC-SHA256 signature of a watermark payload.
 * Uses constant-time comparison to prevent timing attacks.
 * 
 * @param signedPayload - Full payload with signature appended ("data|signature")
 * @param documentKey - Hex-encoded document encryption key
 * @returns { valid, payload, error? }
 */
export const verifyWatermarkSignature = async (signedPayload, documentKey) => {
    if (!signedPayload || typeof signedPayload !== 'string') {
        return { valid: false, payload: null, error: 'Invalid payload format' };
    }

    try {
        const parts = signedPayload.split('|');
        if (parts.length < 5) {
            return { valid: false, payload: null, error: 'Payload missing signature' };
        }

        const receivedSignature = parts.pop();
        const payload = parts.join('|');
        const expectedSignature = await generateWatermarkSignature(payload, documentKey);

        // Constant-time comparison via XOR accumulator
        // Length mismatch is itself a failure, but we still iterate to avoid timing leaks
        let diff = receivedSignature.length ^ expectedSignature.length;
        const len = Math.max(receivedSignature.length, expectedSignature.length);
        for (let i = 0; i < len; i++) {
            diff |= (receivedSignature.charCodeAt(i) || 0) ^ (expectedSignature.charCodeAt(i) || 0);
        }
        const match = diff === 0;

        if (!match) {
            return { valid: false, payload: null, error: 'Signature verification failed' };
        }

        const [documentUUID, email, timestamp, deviceHash] = parts;
        return {
            valid: true,
            payload: { documentUUID, email, timestamp: parseInt(timestamp, 10), deviceHash }
        };
    } catch (error) {
        return { valid: false, payload: null, error: error.message };
    }
};

/**
 * Create a signed watermark payload string.
 * @returns "documentUUID|email|timestamp|deviceHash|hmacSignature"
 */
export const createSignedWatermarkPayload = async (documentUUID, email, deviceHash, documentKey) => {
    const timestamp = Date.now();
    const payload = `${documentUUID}|${email}|${timestamp}|${deviceHash}`;
    const signature = await generateWatermarkSignature(payload, documentKey);
    return `${payload}|${signature}`;
};

/**
 * Generate SHA-256 hash of a watermark payload for forensic storage.
 * @returns 64-character hex hash
 */
export const generateWatermarkHash = async (signedWatermarkPayload) => {
    if (!webcrypto?.subtle) {
        throw new Error('WebCrypto not available for hash generation');
    }
    const encoder = new TextEncoder();
    const hashBuffer = await webcrypto.subtle.digest('SHA-256', encoder.encode(signedWatermarkPayload));
    return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
};
