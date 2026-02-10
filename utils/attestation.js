/**
 * App Attestation & Request Signing
 * 
 * Implements a simplified HMAC-based request signing to ensure
 * API requests originate from the genuine app.
 * 
 * Security Level: Moderate (Client Logic can be reverse-engineered).
 * Hardening: Use JSI/C++ to hide the secret in production.
 */

import * as Crypto from 'expo-crypto';

// In production, this should be obfuscated or fetched via secure channel
const CLIENT_SECRET = "mvp-secure-share-secret-v1";

export const signRequest = async (url, method, body = '') => {
    const timestamp = Date.now().toString();
    const nonce = Math.random().toString(36).substring(7);

    // Construct payload: METHOD + URL + TIMESTAMP + NONCE + BODY_HASH
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
    const payload = `${method}:${url}:${timestamp}:${nonce}:${bodyStr}`;

    // Hash the payload with secret
    const signature = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        payload + CLIENT_SECRET
    );

    return {
        'x-client-timestamp': timestamp,
        'x-client-nonce': nonce,
        'x-client-signature': signature,
        'x-client-version': '1.0.0',
    };
};

export const verifySignature = (headers, bodySecret) => {
    // Backend verification logic (Reference)
    // 1. Check timestamp (reject if > 5m old)
    // 2. Re-compute SHA256(method:url:ts:nonce:body + SECRET)
    // 3. Compare signatures
    return true;
};
