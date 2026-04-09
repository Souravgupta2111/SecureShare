/**
 * Image Watermarking Module
 * 
 * - Native LSB steganography (secure, dev client required)
 * - Legacy delimiter fallback for old images
 */

import { Platform } from 'react-native';

// Try to import native LSB module (only available in dev client builds)
let SecureWatermarkNative = null;
try {
    SecureWatermarkNative = require('../../modules/secure-watermark').default;
} catch (e) {
    console.log('[Watermark/Image] Native LSB module not available, using fallback');
}

// --- CONSTANTS ---

const IMAGE_WATERMARK_DELIMITER = '###SWMK###';
const IMAGE_WATERMARK_END = '###ENDWM###';

const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
const btoa = (input) => {
    let str = input;
    let output = '';
    for (let block = 0, charCode, i = 0, map = chars;
        str.charAt(i | 0) || (map = '=', i % 1);
        output += map.charAt(63 & block >> 8 - i % 1 * 8)) {
        charCode = str.charCodeAt(i += 3 / 4);
        if (charCode > 0xFF) throw new Error("btoa: Latin1 range exceeded");
        block = block << 8 | charCode;
    }
    return output;
};
const atob = (input) => {
    let str = input.replace(/=+$/, '');
    let output = '';
    if (str.length % 4 == 1) throw new Error("atob: invalid input");
    for (let bc = 0, bs = 0, buffer, i = 0;
        buffer = str.charAt(i++);
        ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer,
            bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0) {
        buffer = chars.indexOf(buffer);
    }
    return output;
};

// --- PUBLIC API ---

/** Check if native LSB steganography is available */
export const isNativeLSBAvailable = () => {
    return SecureWatermarkNative !== null &&
        typeof SecureWatermarkNative?.embedLSB === 'function';
};

/**
 * Embed watermark into image using native LSB steganography.
 * REQUIRES dev client build.
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
        console.log('[Watermark/Image] Used native LSB steganography');
        return { data: result, method: 'lsb' };
    } catch (error) {
        throw new Error(`LSB watermark embedding failed: ${error.message}`);
    }
};

/** File-based LSB embedding (memory efficient — no JS memory copy) */
export const embedImageWatermarkFromFileAsync = async (fileUri, payload) => {
    if (!isNativeLSBAvailable()) {
        throw new Error('Native watermark module required for file-based processing.');
    }
    if (!SecureWatermarkNative.embedLSBFromFile) {
        throw new Error('Native module outdated. Rebuild required.');
    }
    try {
        const resultUri = await SecureWatermarkNative.embedLSBFromFile(fileUri, payload);
        console.log('[Watermark/Image] Used native file-based LSB');
        return resultUri;
    } catch (error) {
        throw new Error(`LSB file watermark failed: ${error.message}`);
    }
};

/**
 * @deprecated Use embedImageWatermarkAsync for new uploads.
 * Legacy delimiter method — easily removable, provides false security.
 */
export const embedImageWatermark = (imageBase64, payload) => {
    console.warn('[SECURITY] embedImageWatermark uses insecure delimiter method.');
    const wrappedPayload = IMAGE_WATERMARK_DELIMITER + payload + IMAGE_WATERMARK_END;
    const encodedPayload = (global.btoa || btoa)(wrappedPayload);
    return imageBase64 + encodedPayload;
};

/** Extract watermark from image — tries native LSB first, then legacy delimiter. */
export const extractImageWatermarkAsync = async (imageBase64) => {
    // Try native LSB first
    if (isNativeLSBAvailable()) {
        try {
            const fullMessage = await SecureWatermarkNative.extractLSB(imageBase64);
            if (fullMessage) {
                const payload = extractPayloadFromMessage(fullMessage);
                if (payload) {
                    console.log('[Watermark/Image] Extracted via native LSB');
                    return { data: payload, method: 'lsb' };
                }
            }
        } catch (error) {
            console.warn('[Watermark/Image] Native LSB extract failed:', error);
        }
    }

    // Fallback to delimiter method (legacy images)
    try {
        const wrappedPayload = findBase64WrappedPayload(imageBase64);
        if (wrappedPayload) {
            console.log('[Watermark/Image] Extracted via legacy delimiter');
            return { data: wrappedPayload, method: 'delimiter' };
        }
    } catch (error) {
        console.warn('[Watermark/Image] Legacy extraction failed:', error);
    }

    return { data: null, method: 'delimiter' };
};

/** @deprecated Use extractImageWatermarkAsync */
export const extractImageWatermark = (imageBase64) => null;

/** Verify if image contains a valid watermark */
export const verifyImageWatermark = async (imageBase64) => {
    if (isNativeLSBAvailable()) {
        try {
            return await SecureWatermarkNative.verifyLSB(imageBase64);
        } catch (error) {
            console.warn('[Watermark/Image] Native LSB verify failed:', error);
        }
    }
    return imageBase64.includes(IMAGE_WATERMARK_DELIMITER);
};

/** Extract payload from delimited message */
export const extractPayloadFromMessage = (fullMessage) => {
    if (!fullMessage || typeof fullMessage !== 'string') return null;
    const startIndex = fullMessage.indexOf(IMAGE_WATERMARK_DELIMITER);
    const endIndex = fullMessage.indexOf(IMAGE_WATERMARK_END);
    if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
        return fullMessage.substring(startIndex + IMAGE_WATERMARK_DELIMITER.length, endIndex);
    }
    return null;
};

/** Check if a message is a valid wrapped watermark */
export const isValidWrappedMessage = (fullMessage) => {
    if (!fullMessage || typeof fullMessage !== 'string') return false;
    return fullMessage.includes(IMAGE_WATERMARK_DELIMITER) &&
        fullMessage.includes(IMAGE_WATERMARK_END);
};

/** Get clean image data without watermark delimiter */
export const getCleanImageBase64 = (imageBase64) => {
    if (!imageBase64) return '';
    if (imageBase64.includes(IMAGE_WATERMARK_DELIMITER)) {
        // The watermark was appended as btoa(DELIMITER + payload + END_DELIMITER)
        // We need to find where the encoded payload starts in the base64 string.
        // Use the stepped search to find the exact encoded chunk boundary.
        const size = getChunkSizeForWatermark(imageBase64);
        if (size > 0) {
            // The encoded payload length is the base64 encoding of DELIMITER+payload+END.
            // embedImageWatermark appends btoa(wrapped) directly, so we know the encoded
            // payload is a clean base64 suffix. Find its exact start by checking that
            // the remainder (before the suffix) is still valid base64.
            const candidate = imageBase64.slice(0, -size);
            // Verify the candidate doesn't clip valid data (must end on a base64 boundary)
            if (candidate.length % 4 === 0 || candidate.endsWith('=')) {
                return candidate;
            }
            // Align to nearest 4-char base64 boundary (trim at most 3 extra chars)
            const aligned = candidate.slice(0, candidate.length - (candidate.length % 4));
            return aligned;
        }
    }
    return imageBase64;
};

// --- INTERNAL HELPERS ---

const findBase64WrappedPayload = (imageBase64) => {
    if (!imageBase64 || imageBase64.length < 100) return null;
    const minChunkSize = 50;
    const maxChunkSize = 500;

    for (let size = minChunkSize; size <= maxChunkSize; size += 10) {
        const chunk = imageBase64.slice(-size);
        try {
            const decoded = (global.atob || atob)(chunk);
            if (decoded.startsWith(IMAGE_WATERMARK_DELIMITER) &&
                decoded.includes(IMAGE_WATERMARK_END)) {
                const startIdx = decoded.indexOf(IMAGE_WATERMARK_DELIMITER) + IMAGE_WATERMARK_DELIMITER.length;
                const endIdx = decoded.indexOf(IMAGE_WATERMARK_END);
                return decoded.substring(startIdx, endIdx);
            }
        } catch (e) { /* not valid base64 */ }
    }
    return null;
};

const getChunkSizeForWatermark = (imageBase64) => {
    const minChunkSize = 50;
    const maxChunkSize = 500;
    for (let size = minChunkSize; size <= maxChunkSize; size += 10) {
        const chunk = imageBase64.slice(-size);
        try {
            const decoded = (global.atob || atob)(chunk);
            if (decoded.startsWith(IMAGE_WATERMARK_DELIMITER)) return size;
        } catch (e) { /* continue */ }
    }
    return minChunkSize;
};
