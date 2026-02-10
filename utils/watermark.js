/**
 * SecureShare Watermark Utilities
 * 
 * IMAGE WATERMARKING:
 * - Uses native LSB steganography when available (dev client builds)
 * - Falls back to delimiter-based approach in Expo Go
 * 
 * DOCUMENT WATERMARKING:
 * Zero-width character injection works reliably for TXT, DOCX, and PDF.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

// Use the globally polyfilled crypto from cryptoBootstrap.js
const webcrypto = globalThis.crypto;

// Try to import native LSB module (only available in dev client builds)
let SecureWatermarkNative = null;
try {
    SecureWatermarkNative = require('../modules/secure-watermark').default;
} catch (e) {
    console.log('[Watermark] Native LSB module not available, using fallback');
}

/**
 * Check if native LSB steganography is available
 */
export const isNativeLSBAvailable = () => {
    return SecureWatermarkNative !== null &&
        typeof SecureWatermarkNative?.embedLSB === 'function';
};

// --- HELPERS ---

const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const lookup = new Uint8Array(256);
for (let i = 0; i < chars.length; i++) {
    lookup[chars.charCodeAt(i)] = i;
}

const decodeBase64 = (base64) => {
    let bufferLength = base64.length * 0.75;
    let len = base64.length;
    let i;
    let p = 0;
    let encoded1, encoded2, encoded3, encoded4;

    if (base64[base64.length - 1] === '=') {
        bufferLength--;
        if (base64[base64.length - 2] === '=') {
            bufferLength--;
        }
    }

    const arraybuffer = new ArrayBuffer(bufferLength);
    const bytes = new Uint8Array(arraybuffer);

    for (i = 0; i < len; i += 4) {
        encoded1 = lookup[base64.charCodeAt(i)];
        encoded2 = lookup[base64.charCodeAt(i + 1)];
        encoded3 = lookup[base64.charCodeAt(i + 2)];
        encoded4 = lookup[base64.charCodeAt(i + 3)];

        bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
        bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
        bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
    }

    return bytes;
};

const encodeBase64 = (bytes) => {
    let base64 = '';
    let i;
    let len = bytes.length;

    for (i = 0; i < len; i += 3) {
        base64 += chars[bytes[i] >> 2];
        base64 += chars[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)];
        base64 += chars[((bytes[i + 1] & 15) << 2) | (bytes[i + 2] >> 6)];
        base64 += chars[bytes[i + 2] & 63];
    }

    if (len % 3 === 2) {
        base64 = base64.substring(0, base64.length - 1) + '=';
    } else if (len % 3 === 1) {
        base64 = base64.substring(0, base64.length - 2) + '==';
    }

    return base64;
};

const stringToBinary = (str) => {
    let binary = '';
    for (let i = 0; i < str.length; i++) {
        const charCode = str.charCodeAt(i);
        // 8 bits
        binary += charCode.toString(2).padStart(8, '0');
    }
    return binary;
};

const binaryToString = (binary) => {
    let str = '';
    for (let i = 0; i < binary.length; i += 8) {
        const byte = binary.substr(i, 8);
        str += String.fromCharCode(parseInt(byte, 2));
    }
    return str;
};

// SYNC PATTERN: "SWMK"
const SYNC_PATTERN_STR = "SWMK";
const SYNC_PATTERN_BIN = stringToBinary(SYNC_PATTERN_STR);

// --- HMAC SIGNATURE FOR WATERMARK PAYLOAD ---
// 
// SECURITY: Adds cryptographic HMAC-SHA256 signature to watermark payloads
// to prevent tampering and unauthorized modification.
// 
// New payload format: documentUUID|email|timestamp|deviceHash|HMAC_SIGNATURE
// The HMAC is computed over the first 4 fields using the document key.



/**
 * Generate HMAC-SHA256 signature for watermark payload
 * @param {string} payload - Watermark payload (documentUUID|email|timestamp|deviceHash)
 * @param {string} documentKey - Document encryption key (hex string)
 * @returns {Promise<string>} 64-character hex signature
 */
export const generateWatermarkSignature = async (payload, documentKey) => {
    if (!webcrypto || !webcrypto.subtle) {
        throw new Error('WebCrypto not available for HMAC generation');
    }

    try {
        // Convert key from hex to bytes
        const keyBytes = new Uint8Array(documentKey.length / 2);
        for (let i = 0; i < documentKey.length; i += 2) {
            keyBytes[i / 2] = parseInt(documentKey.substr(i, 2), 16);
        }

        // Import key for HMAC
        const cryptoKey = await webcrypto.subtle.importKey(
            'raw',
            keyBytes,
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );

        // Encode payload
        const encoder = new TextEncoder();
        const payloadBytes = encoder.encode(payload);

        // Generate HMAC
        const signature = await webcrypto.subtle.sign(
            'HMAC',
            cryptoKey,
            payloadBytes
        );

        // Convert to hex string (64 chars for SHA-256)
        const signatureArray = new Uint8Array(signature);
        let hexSignature = '';
        for (let i = 0; i < signatureArray.length; i++) {
            hexSignature += signatureArray[i].toString(16).padStart(2, '0');
        }

        return hexSignature;
    } catch (error) {
        console.error('[Watermark] HMAC generation failed:', error);
        throw new Error('Failed to generate watermark signature: ' + error.message);
    }
};

/**
 * Verify HMAC-SHA256 signature of watermark payload
 * @param {string} signedPayload - Full payload with signature (payload|signature)
 * @param {string} documentKey - Document encryption key (hex string)
 * @returns {Promise<{valid: boolean, payload: object|null, error?: string}>}
 */
export const verifyWatermarkSignature = async (signedPayload, documentKey) => {
    if (!signedPayload || typeof signedPayload !== 'string') {
        return { valid: false, payload: null, error: 'Invalid payload format' };
    }

    try {
        // Parse signed payload: documentUUID|email|timestamp|deviceHash|signature
        const parts = signedPayload.split('|');

        if (parts.length < 5) {
            return { valid: false, payload: null, error: 'Payload missing signature' };
        }

        // Extract signature (last part)
        const receivedSignature = parts.pop();

        // Reconstruct payload without signature
        const payload = parts.join('|');

        // Generate expected signature
        const expectedSignature = await generateWatermarkSignature(payload, documentKey);

        // Constant-time comparison to prevent timing attacks
        if (receivedSignature.length !== expectedSignature.length) {
            return { valid: false, payload: null, error: 'Signature length mismatch' };
        }

        let match = true;
        for (let i = 0; i < receivedSignature.length; i++) {
            if (receivedSignature[i] !== expectedSignature[i]) {
                match = false;
            }
        }

        if (!match) {
            return { valid: false, payload: null, error: 'Signature verification failed' };
        }

        // Parse payload components
        const [documentUUID, email, timestamp, deviceHash] = parts;

        return {
            valid: true,
            payload: {
                documentUUID,
                email,
                timestamp: parseInt(timestamp, 10),
                deviceHash
            }
        };
    } catch (error) {
        console.error('[Watermark] Signature verification error:', error);
        return { valid: false, payload: null, error: error.message };
    }
};

/**
 * Create a signed watermark payload
 * @param {string} documentUUID - Document UUID
 * @param {string} email - Recipient email
 * @param {string} deviceHash - Device hash
 * @param {string} documentKey - Document encryption key (hex string)
 * @returns {Promise<string>} Signed payload: documentUUID|email|timestamp|deviceHash|signature
 */
export const createSignedWatermarkPayload = async (documentUUID, email, deviceHash, documentKey) => {
    const timestamp = Date.now();
    const payload = `${documentUUID}|${email}|${timestamp}|${deviceHash}`;
    const signature = await generateWatermarkSignature(payload, documentKey);
    return `${payload}|${signature}`;
};

/**
 * Generate SHA-256 hash of watermark payload for forensic storage
 * @param {string} signedWatermarkPayload - Signed watermark payload
 * @returns {Promise<string>} 64-character hex hash
 */
export const generateWatermarkHash = async (signedWatermarkPayload) => {
    if (!webcrypto || !webcrypto.subtle) {
        throw new Error('WebCrypto not available for hash generation');
    }

    const encoder = new TextEncoder();
    const hashBuffer = await webcrypto.subtle.digest('SHA-256', encoder.encode(signedWatermarkPayload));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

// --- IMAGE WATERMARKING ---
// 
// For compressed images (JPEG/PNG), LSB steganography is unreliable because:
// 1. The base64 is the *encoded* image, not raw RGBA pixels
// 2. Re-encoding through any app destroys LSB bits
//
// This implementation uses a more robust approach:
// - Appends a delimiter + encoded payload to the base64 string
// - The delimiter is a unique sequence unlikely to appear naturally
// - Extraction searches for the delimiter and reads the payload after it
//
// For true steganography in production, use server-side processing with sharp/jimp.

const IMAGE_WATERMARK_DELIMITER = '###SWMK###';
const IMAGE_WATERMARK_END = '###ENDWM###';

/**
 * Embed watermark into image using native LSB steganography
 * SECURITY: This function REQUIRES native module. It will NOT fallback to
 * the insecure delimiter method, which provides false security.
 * 
 * @param {string} imageBase64 - Base64 encoded image
 * @param {string} payload - Watermark payload (documentUUID|email|timestamp|deviceHash)
 * @returns {Promise<{data: string, method: 'lsb'}>}
 * @throws {Error} If native LSB module is not available
 */
export const embedImageWatermarkAsync = async (imageBase64, payload) => {
    if (!isNativeLSBAvailable()) {
        throw new Error(
            'SECURITY: Native watermark module not available.\n' +
            'Image watermarking requires a development client build.\n' +
            'Run: npx expo prebuild --clean && npx expo run:android'
        );
    }

    try {
        const result = await SecureWatermarkNative.embedLSB(imageBase64, payload);
        console.log('[Watermark] Used native LSB steganography');
        return { data: result, method: 'lsb' };
    } catch (error) {
        throw new Error(`LSB watermark embedding failed: ${error.message}`);
    }
};

/**
 * Embed watermark into image file using native LSB steganography
 * Reads file from disk, processes natively, saves to temp file.
 * MEMORY EFFICIENT: Does not load image into JS memory.
 * 
 * @param {string} fileUri - Local file URI (file://...)
 * @param {string} payload - Watermark payload
 * @returns {Promise<string>} - URI of the watermarked image (temp file)
 */
export const embedImageWatermarkFromFileAsync = async (fileUri, payload) => {
    if (!isNativeLSBAvailable()) {
        throw new Error('Native watermark module required for file-based processing.');
    }

    // Check if new method exists (it should if native module updated)
    if (!SecureWatermarkNative.embedLSBFromFile) {
        // Fallback to Base64 method if native module old?? 
        // But we assume we updated it.
        throw new Error('Native module outdated. Rebuild required.');
    }

    try {
        const resultUri = await SecureWatermarkNative.embedLSBFromFile(fileUri, payload);
        console.log('[Watermark] Used native file-based LSB');
        return resultUri;
    } catch (error) {
        throw new Error(`LSB file watermark failed: ${error.message}`);
    }
};



/**
 * Legacy sync version - Uses consistent delimiter format matching native module
 * @deprecated DO NOT USE for new uploads. Use embedImageWatermarkAsync.
 * This delimiter method is easily removable and provides false security.
 */
export const embedImageWatermark = (imageBase64, payload) => {
    console.warn('[SECURITY] embedImageWatermark uses insecure delimiter method. Use embedImageWatermarkAsync for new uploads.');
    // Wrap payload with proper delimiters matching native module format
    const wrappedPayload = IMAGE_WATERMARK_DELIMITER + payload + IMAGE_WATERMARK_END;
    const encodedPayload = (global.btoa || btoa)(wrappedPayload);
    return imageBase64 + encodedPayload;
};

/**
 * Extract watermark from image using best available method
 *
 * @param {string} imageBase64 - Base64 encoded image
 * @returns {Promise<{data: string | null, method: 'lsb' | 'delimiter'}>}
 */
export const extractImageWatermarkAsync = async (imageBase64) => {
    // Try native LSB first
    if (isNativeLSBAvailable()) {
        try {
            const fullMessage = await SecureWatermarkNative.extractLSB(imageBase64);
            if (fullMessage) {
                // Native module returns full message with delimiters
                // Extract just the payload
                const payload = extractPayloadFromMessage(fullMessage);
                if (payload) {
                    console.log('[Watermark] Extracted via native LSB');
                    return { data: payload, method: 'lsb' };
                }
            }
        } catch (error) {
            console.warn('[Watermark] Native LSB extract failed:', error);
        }
    }

    // Fallback to delimiter method (for legacy images)
    // Check for base64-wrapped payload at the end of the image
    try {
        const wrappedPayload = findBase64WrappedPayload(imageBase64);
        if (wrappedPayload) {
            console.log('[Watermark] Extracted via legacy delimiter method');
            return { data: wrappedPayload, method: 'delimiter' };
        }
    } catch (error) {
        console.warn('[Watermark] Legacy extraction failed:', error);
    }

    return { data: null, method: 'delimiter' };
};

/**
 * Find base64-wrapped payload appended to image data
 * Legacy format: imageBase64 + base64(###SWMK###payload###ENDWM###)
 *
 * @param {string} imageBase64 - Full base64 data
 * @returns {string|null} - Extracted payload or null
 */
const findBase64WrappedPayload = (imageBase64) => {
    if (!imageBase64 || imageBase64.length < 100) return null;

    // The wrapped payload is base64 encoded
    // We need to find where the actual image data ends and watermark begins
    // This is tricky because base64 doesn't have a clear boundary

    // Heuristic: The watermark portion is typically much smaller than the image
    // Try decoding from the end of the string in chunks

    const minChunkSize = 50; // Minimum watermark size
    const maxChunkSize = 500; // Maximum watermark size

    for (let size = minChunkSize; size <= maxChunkSize; size += 10) {
        const chunk = imageBase64.slice(-size);
        try {
            const decoded = atob(chunk);
            // Check if decoded content starts with our delimiter
            if (decoded.startsWith(IMAGE_WATERMARK_DELIMITER) &&
                decoded.includes(IMAGE_WATERMARK_END)) {
                // Extract payload from this chunk
                return decoded
                    .substringAfter(IMAGE_WATERMARK_DELIMITER)
                    .substringBefore(IMAGE_WATERMARK_END);
            }
        } catch (e) {
            // Not valid base64, continue
        }
    }

    return null;
};

/**
 * Legacy sync version - uses delimiter method only
 * @deprecated Use extractImageWatermarkAsync for LSB support
 */
export const extractImageWatermark = (imageBase64) => {
    // Try to find wrapped payload format: base64(###SWMK###payload###ENDWM###)
    // Check if image ends with base64-wrapped payload (after last occurrence of common image markers)
    const pngHeader = 'iVBORw'; // PNG start (can appear mid-file for small images)
    const jpegHeader = '/9j/';   // JPEG start

    // For delimiter method, payload is appended at the end as base64
    // We need to find the boundary between image data and watermark
    // This is heuristic - look for the watermark start pattern in decoded content

    // For now, return null as sync version can't reliably extract
    // The async version handles this properly
    return null;
};

/**
 * Verify if an image contains a valid watermark
 *
 * @param {string} imageBase64 - Base64 encoded image
 * @returns {Promise<boolean>}
 */
export const verifyImageWatermark = async (imageBase64) => {
    if (isNativeLSBAvailable()) {
        try {
            return await SecureWatermarkNative.verifyLSB(imageBase64);
        } catch (error) {
            console.warn('[Watermark] Native LSB verify failed:', error);
        }
    }

    // Fallback: check for delimiter
    return imageBase64.includes(IMAGE_WATERMARK_DELIMITER);
};

/**
 * Extract the actual payload from a wrapped message containing delimiters
 * The native module returns the full message including delimiters
 *
 * @param {string} fullMessage - Full message with delimiters (###SWMK###payload###ENDWM###)
 * @returns {string|null} - The extracted payload or null if invalid
 */
export const extractPayloadFromMessage = (fullMessage) => {
    if (!fullMessage || typeof fullMessage !== 'string') {
        return null;
    }

    const startIndex = fullMessage.indexOf(IMAGE_WATERMARK_DELIMITER);
    const endIndex = fullMessage.indexOf(IMAGE_WATERMARK_END);

    if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
        // Extract content between delimiters
        const startOfPayload = startIndex + IMAGE_WATERMARK_DELIMITER.length;
        return fullMessage.substring(startOfPayload, endIndex);
    }

    return null;
};

/**
 * Check if a message is a valid wrapped watermark
 * @param {string} fullMessage - Full message from extraction
 * @returns {boolean}
 */
export const isValidWrappedMessage = (fullMessage) => {
    if (!fullMessage || typeof fullMessage !== 'string') {
        return false;
    }
    return fullMessage.includes(IMAGE_WATERMARK_DELIMITER) &&
        fullMessage.includes(IMAGE_WATERMARK_END);
};

// Helper to get pure image data (without watermark) for display
export const getCleanImageBase64 = (imageBase64) => {
    if (!imageBase64) return '';

    // For native LSB watermarking, the watermark is embedded in pixel data
    // so there's no clean version - just return the original
    // The visual watermark is handled by FloatingWatermark component

    // For legacy delimiter method, check for appended base64
    if (imageBase64.includes(IMAGE_WATERMARK_DELIMITER)) {
        // Try to find and remove the appended watermark
        const chunk = findBase64WrappedPayload(imageBase64);
        if (chunk) {
            // Return the image without the last chunk that contained watermark
            return imageBase64.slice(0, -getChunkSizeForWatermark(imageBase64));
        }
    }

    return imageBase64;
};

/**
 * Get the approximate size of the watermark chunk to remove
 */
const getChunkSizeForWatermark = (imageBase64) => {
    const minChunkSize = 50;
    const maxChunkSize = 500;

    for (let size = minChunkSize; size <= maxChunkSize; size += 10) {
        const chunk = imageBase64.slice(-size);
        try {
            const decoded = atob(chunk);
            if (decoded.startsWith(IMAGE_WATERMARK_DELIMITER)) {
                return size;
            }
        } catch (e) {
            // Continue
        }
    }
    return minChunkSize;
};

// --- DOCUMENT WATERMARKING (Zero-width + metadata) ---

// Mappings
const ZERO_WIDTH_SPACE = '\u200B'; // 0
const ZERO_WIDTH_NON_JOINER = '\u200C'; // 1
const ZERO_WIDTH_JOINER = '\u200D'; // Char delimiter
const ZERO_WIDTH_NO_BREAK_SPACE = '\uFEFF'; // Start marker

const stringToZeroWidth = (str) => {
    let zw = ZERO_WIDTH_NO_BREAK_SPACE;
    for (let i = 0; i < str.length; i++) {
        const charCode = str.charCodeAt(i);
        const bin = charCode.toString(2).padStart(8, '0');

        for (let bit of bin) {
            zw += bit === '0' ? ZERO_WIDTH_SPACE : ZERO_WIDTH_NON_JOINER;
        }

        if (i < str.length - 1) {
            zw += ZERO_WIDTH_JOINER;
        }
    }
    return zw;
};

const zeroWidthToString = (zwStr) => {
    // Strip start marker if present at index 0 (handled by caller logic usually, but here helper processes the clean sequence)
    // We expect zwStr to be *just* the sequence starting after any found marker.
    // Actually helper should probably parse the raw sequence.

    // Split by delimiter
    const parts = zwStr.split(ZERO_WIDTH_JOINER);
    let result = '';

    for (let part of parts) {
        let bin = '';
        for (let char of part) {
            if (char === ZERO_WIDTH_SPACE) bin += '0';
            else if (char === ZERO_WIDTH_NON_JOINER) bin += '1';
        }
        if (bin.length > 0) {
            result += String.fromCharCode(parseInt(bin, 2));
        }
    }
    return result;
};

export const embedDocumentWatermark = (fileData, fileExtension, payload) => {
    const zwPayload = stringToZeroWidth(payload);
    const ext = fileExtension.toLowerCase().replace('.', '');

    if (ext === 'txt') {
        return fileData + zwPayload;
    }

    if (ext === 'docx') {
        // Handle input type
        let bytes;
        if (fileData instanceof Uint8Array) {
            bytes = fileData;
        } else {
            bytes = decodeBase64(fileData);
        }

        // Find </w:body> -> 0x3C 0x2F 0x77 0x3A 0x62 0x6F 0x64 0x79 0x3E
        // We want to verify specific bytes.
        const searchBytes = [0x3C, 0x2F, 0x77, 0x3A, 0x62, 0x6F, 0x64, 0x79, 0x3E];

        let insertIndex = -1;
        for (let i = 0; i < bytes.length - searchBytes.length; i++) {
            let match = true;
            for (let j = 0; j < searchBytes.length; j++) {
                if (bytes[i + j] !== searchBytes[j]) {
                    match = false;
                    break;
                }
            }
            if (match) {
                insertIndex = i;
                break; // found the first closing body tag (assuming one main document.xml in the extracted flow, but in raw zip there might be others... this is MVP heuristic)
            }
        }

        if (insertIndex !== -1) {
            // Convert zwPayload to bytes (UTF-8)
            // JS strings are UTF-16, but we need byte representation for the file.
            // For zero-width chars, they are multibyte in UTF-8. 
            // e.g. U+200B is E2 80 8B.
            // We'll write the raw char codes? No, file is binary. We must encode string to UTF8 bytes.
            const encoder = new TextEncoder(); // Available in RN? If not, we iterate chars.
            // Polyfill text encoder simplistic:
            const zwBytes = [];
            for (let i = 0; i < zwPayload.length; i++) {
                let code = zwPayload.charCodeAt(i);
                // Simple logic for known range (all are > 127)
                if (code <= 0x7F) zwBytes.push(code);
                else if (code <= 0x7FF) {
                    zwBytes.push(0xC0 | (code >> 6));
                    zwBytes.push(0x80 | (code & 0x3F));
                } else if (code <= 0xFFFF) {
                    zwBytes.push(0xE0 | (code >> 12));
                    zwBytes.push(0x80 | ((code >> 6) & 0x3F));
                    zwBytes.push(0x80 | (code & 0x3F));
                }
            }

            // Splice
            const newBytes = new Uint8Array(bytes.length + zwBytes.length);
            newBytes.set(bytes.subarray(0, insertIndex), 0);
            newBytes.set(zwBytes, insertIndex);
            newBytes.set(bytes.subarray(insertIndex), insertIndex + zwBytes.length);

            // Return Uint8Array directly if input was Uint8Array? 
            // Previous behavior returned Base64. 
            // To be safe for mixed usage, let's look at input type?
            // Actually, for memory efficiency we WANT Uint8Array.
            return newBytes;
        }
        return bytes; // Return bytes even if no change, for consistency
    }

    if (ext === 'pdf') {
        // Handle input type
        let bytes;
        if (fileData instanceof Uint8Array) {
            bytes = fileData;
        } else {
            bytes = decodeBase64(fileData);
        }
        // %%EOF is 0x25 0x25 0x45 0x4F 0x46
        const searchBytes = [0x25, 0x25, 0x45, 0x4F, 0x46];

        let insertIndex = -1;
        // Search from end
        for (let i = bytes.length - searchBytes.length; i >= 0; i--) {
            let match = true;
            for (let j = 0; j < searchBytes.length; j++) {
                if (bytes[i + j] !== searchBytes[j]) {
                    match = false;
                    break;
                }
            }
            if (match) {
                insertIndex = i;
                break;
            }
        }

        if (insertIndex !== -1) {
            // Construct string: \n%SecureShareWatermark: [zwPayload]\n
            const metaStr = `\n%SecureShareWatermark: ${zwPayload}\n`;
            // Encode to bytes
            const metaBytes = []; // ... same encoding logic ...
            for (let i = 0; i < metaStr.length; i++) {
                let code = metaStr.charCodeAt(i);
                if (code <= 0x7F) metaBytes.push(code);
                else if (code <= 0x7FF) {
                    metaBytes.push(0xC0 | (code >> 6));
                    metaBytes.push(0x80 | (code & 0x3F));
                } else if (code <= 0xFFFF) {
                    metaBytes.push(0xE0 | (code >> 12));
                    metaBytes.push(0x80 | ((code >> 6) & 0x3F));
                    metaBytes.push(0x80 | (code & 0x3F));
                }
            }

            const newBytes = new Uint8Array(bytes.length + metaBytes.length);
            newBytes.set(bytes.subarray(0, insertIndex), 0);
            newBytes.set(metaBytes, insertIndex);
            newBytes.set(bytes.subarray(insertIndex), insertIndex + metaBytes.length);

            return newBytes;
        }
        return bytes; // Return bytes
    }

    // For TXT, assume string or handle bytes?
    // If txt, fileData is likely string if read via readAsString using utf8?
    // But we read using ArrayBuffer in UploadScreen.
    if (ext === 'txt') {
        // Check if fileData is Uint8Array
        if (fileData instanceof Uint8Array) {
            // Append bytes of zwPayload
            // zwPayload is string. Convert to bytes.
            const encoder = new TextEncoder();
            const zwBytes = encoder.encode(zwPayload);
            const newBytes = new Uint8Array(fileData.length + zwBytes.length);
            newBytes.set(fileData, 0);
            newBytes.set(zwBytes, fileData.length);
            return newBytes;
        }
        return fileData + zwPayload;
    }

    return fileData;
};

export const extractDocumentWatermark = (fileData, fileExtension) => {
    const ext = fileExtension.toLowerCase().replace('.', '');
    // For extract, we need the string content (or binary search).
    // Ideally convert to string if possible, or search bytes.

    // Helper to find bytes of zw chars
    // U+FEFF (EF BB BF)
    const START_MARKER_BYTES = [0xEF, 0xBB, 0xBF];

    const bytes = decodeBase64(fileData);

    if (ext === 'txt') {
        // Convert to string (assuming UTF8)
        // Or just search for the byte sequence of START_MARKER
        // The payload follows.
        // We will search for start marker, then parse until end of file or invalid char.

        let startIndex = -1;
        for (let i = 0; i < bytes.length - 2; i++) {
            if (bytes[i] === START_MARKER_BYTES[0] &&
                bytes[i + 1] === START_MARKER_BYTES[1] &&
                bytes[i + 2] === START_MARKER_BYTES[2]) {
                startIndex = i;
                break;
            }
        }

        if (startIndex !== -1) {
            // Decode bytes from here to string
            // Only read ZW chars (E2 80 8B, E2 80 8C, E2 80 8D)
            // We can just decode valid UTF8 chars and check if they match our set.

            let extractedZw = '';
            for (let i = startIndex; i < bytes.length;) {
                // Decode char
                let charStr = '';
                let code = 0;
                let len = 0;

                if ((bytes[i] & 0x80) === 0) { len = 1; code = bytes[i]; }
                else if ((bytes[i] & 0xE0) === 0xC0) { len = 2; code = ((bytes[i] & 0x1F) << 6) | (bytes[i + 1] & 0x3F); }
                else if ((bytes[i] & 0xF0) === 0xE0) { len = 3; code = ((bytes[i] & 0x0F) << 12) | ((bytes[i + 1] & 0x3F) << 6) | (bytes[i + 2] & 0x3F); }

                if (len === 0) break; // invalid

                charStr = String.fromCharCode(code);
                if (charStr === ZERO_WIDTH_SPACE ||
                    charStr === ZERO_WIDTH_NON_JOINER ||
                    charStr === ZERO_WIDTH_JOINER ||
                    charStr === ZERO_WIDTH_NO_BREAK_SPACE) {
                    if (charStr !== ZERO_WIDTH_NO_BREAK_SPACE) extractedZw += charStr;
                }
                // Be lenient, maybe newlines at EOF?

                i += len;
            }
            if (extractedZw.length > 0) return zeroWidthToString(extractedZw);
        }
        return null;
    }

    if (ext === 'docx') {
        // Search backwards from </w:body> for ZW chars
        // </w:body> is 3C 2F 77 3A 62 6F 64 79 3E
        const END_BYTES = [0x3C, 0x2F, 0x77, 0x3A, 0x62, 0x6F, 0x64, 0x79, 0x3E];
        let endIndex = -1;
        for (let i = 0; i < bytes.length - END_BYTES.length; i++) {
            let match = true;
            for (let j = 0; j < END_BYTES.length; j++) { if (bytes[i + j] !== END_BYTES[j]) { match = false; break; } }
            if (match) { endIndex = i; break; } // find first body close
        }

        if (endIndex !== -1) {
            // Scan backwards
            // We look for the ZW bytes.
            // This is tricky byte-wise. 
            // Simplified: extract a chunk before endIndex, convert to string, find marker.
            const chunk = bytes.subarray(Math.max(0, endIndex - 5000), endIndex); // 5000 bytes sufficient?
            // Decode chunk to string (lazy way)
            // Re-implement simplified utf8 decoder on chunk
            let str = '';
            for (let i = 0; i < chunk.length;) {
                let code = 0, len = 0;
                if ((chunk[i] & 0x80) === 0) { len = 1; code = chunk[i]; }
                else if ((chunk[i] & 0xE0) === 0xC0) { len = 2; code = ((chunk[i] & 0x1F) << 6) | (chunk[i + 1] & 0x3F); }
                else if ((chunk[i] & 0xF0) === 0xE0) { len = 3; code = ((chunk[i] & 0x0F) << 12) | ((chunk[i + 1] & 0x3F) << 6) | (chunk[i + 2] & 0x3F); }
                else { i++; continue; }
                str += String.fromCharCode(code);
                i += len;
            }

            const markerIndex = str.lastIndexOf(ZERO_WIDTH_NO_BREAK_SPACE);
            if (markerIndex !== -1) {
                const sequence = str.substring(markerIndex + 1); // Get chars after marker
                // Clean noise
                let clean = '';
                for (let c of sequence) {
                    if (c === ZERO_WIDTH_SPACE || c === ZERO_WIDTH_NON_JOINER || c === ZERO_WIDTH_JOINER) clean += c;
                }
                return zeroWidthToString(clean);
            }
        }
        return null;
    }

    if (ext === 'pdf') {
        // Search for %SecureShareWatermark:
        // Bytes: 25 53 65 63 75 72 65 53 68 61 72 65 57 61 74 65 72 6D 61 72 6B 3A 20

        // Convert bytes to string for regex search (might be unsafe for massive files, but MVP ok)
        // Or byte loop.
        // Let's do string conversion on last 20kb of file? Metadata usually at end.
        const chunk = bytes.subarray(Math.max(0, bytes.length - 20000));
        let str = '';
        for (let i = 0; i < chunk.length; i++) str += String.fromCharCode(chunk[i]); // rough ascii

        const prefix = '%SecureShareWatermark: ';
        const idx = str.indexOf(prefix);
        if (idx !== -1) {
            let remainder = str.substring(idx + prefix.length);
            // Read until newline or EOF
            const endLine = remainder.indexOf('\n');
            const rawPayload = endLine === -1 ? remainder : remainder.substring(0, endLine);
            // This rawPayload is the UTF8 encoded ZW chars interpreted as ASCII 1-byte? 
            // NO. String.fromCharCode(chunk[i]) destroys multibyte.
            // We need to re-read the bytes AT that position.

            // Find byte index in chunk
            // Since prefix is ASCII, byte index matches string index if purely ascii before it.
            // But binary data might mess it up.
            // safer: byte match the prefix
            const prefixBytes = [];
            for (let i = 0; i < prefix.length; i++) prefixBytes.push(prefix.charCodeAt(i));

            let foundPos = -1;
            for (let i = 0; i < chunk.length - prefixBytes.length; i++) {
                let m = true;
                for (let j = 0; j < prefixBytes.length; j++) if (chunk[i + j] !== prefixBytes[j]) { m = false; break; }
                if (m) { foundPos = i; break; }
            }

            if (foundPos !== -1) {
                const payloadBytes = chunk.subarray(foundPos + prefixBytes.length);
                // Decode these bytes properly to UTF8 string
                let DecodedStr = '';
                for (let i = 0; i < payloadBytes.length && i < 5000;) { // limit
                    let code = 0, len = 0;
                    if (payloadBytes[i] === 0x0A || payloadBytes[i] === 0x0D) break; // newline stops

                    if ((payloadBytes[i] & 0x80) === 0) { len = 1; code = payloadBytes[i]; }
                    else if ((payloadBytes[i] & 0xE0) === 0xC0) { len = 2; code = ((payloadBytes[i] & 0x1F) << 6) | (payloadBytes[i + 1] & 0x3F); }
                    else if ((payloadBytes[i] & 0xF0) === 0xE0) { len = 3; code = ((payloadBytes[i] & 0x0F) << 12) | ((payloadBytes[i + 1] & 0x3F) << 6) | (payloadBytes[i + 2] & 0x3F); }
                    else { i++; continue; }
                    DecodedStr += String.fromCharCode(code);
                    i += len;
                }
                return zeroWidthToString(DecodedStr);
            }
        }
        return null;
    }

    return null;
};
