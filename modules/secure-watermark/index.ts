import { requireNativeModule } from 'expo-modules-core';

// Types for the native module. Implemented on BOTH Android (Kotlin) and iOS (Swift).
export interface SecureWatermarkModule {
    // Render-time forensic engine
    renderSecureImage(encryptedInput: string, aesKeyHex: string, userId: string, docId: string): Promise<string>;
    embedWatermark(base64Image: string, userId: string, docId: string): Promise<string>;

    // Forensic detection (spread-spectrum NCC + OCR)
    detectDocumentId(base64Image: string, docIdsJson: string): Promise<string | null>;
    detectLeaker(base64Image: string, docId: string, candidatesJson: string): Promise<{ userId: string; confidence: number } | null>;
    extractVisibleWatermark(base64Image: string): Promise<string>;

    // DRM
    isScreenBeingMirrored(): Promise<boolean>;

    // Legacy LSB mocks (embedding now happens at render time on both platforms)
    embedLSB(imageBase64: string, watermarkText: string): Promise<string>;
    extractLSB(imageBase64: string): Promise<string | null>;
    verifyLSB(imageBase64: string): Promise<boolean>;
}

// Get the native module
const NativeModule = requireNativeModule<SecureWatermarkModule>('SecureWatermark');

/**
 * Check if the native watermark module is available.
 * Implemented on both Android and iOS — gate on the method existing rather than
 * the platform, so a missing/unlinked native module still degrades gracefully.
 */
export const isNativeLSBAvailable = (): boolean => {
    return !!NativeModule && typeof NativeModule.embedLSB === 'function';
};

/**
 * Embed watermark using LSB steganography
 * SECURITY: No fallback to delimiter method - fails if native unavailable
 * 
 * @param imageBase64 - Base64 encoded image (PNG recommended for lossless)
 * @param watermarkText - Text to embed (documentUUID|email|timestamp|deviceHash)
 * @returns Base64 encoded PNG with embedded watermark
 * @throws Error if native module not available
 */
export const embedLSBWatermark = async (
    imageBase64: string,
    watermarkText: string
): Promise<{ data: string; method: 'lsb' }> => {
    if (!isNativeLSBAvailable()) {
        throw new Error(
            'SECURITY: Native LSB module not available.\n' +
            'This app requires a development client build:\n' +
            'npx expo prebuild --clean && npx expo run:android'
        );
    }

    const result = await NativeModule.embedLSB(imageBase64, watermarkText);
    return { data: result, method: 'lsb' };
};

/**
 * Extract watermark using LSB steganography
 * Falls back to delimiter-based extraction if native not available
 * 
 * @param imageBase64 - Base64 encoded image
 * @returns Extracted watermark text or null if not found
 */
export const extractLSBWatermark = async (
    imageBase64: string
): Promise<{ data: string | null; method: 'lsb' | 'delimiter' }> => {
    if (isNativeLSBAvailable()) {
        try {
            const result = await NativeModule.extractLSB(imageBase64);
            if (result) {
                return { data: result, method: 'lsb' };
            }
        } catch (error) {
            console.warn('Native LSB extract failed:', error);
        }
    }

    // Fallback: delimiter-based extraction
    const delimiter = '<!--WATERMARK:';
    const endDelimiter = ':WATERMARK-->';
    const startIdx = imageBase64.indexOf(delimiter);
    const endIdx = imageBase64.indexOf(endDelimiter);

    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        const watermark = imageBase64.substring(startIdx + delimiter.length, endIdx);
        return { data: watermark, method: 'delimiter' };
    }

    return { data: null, method: 'delimiter' };
};

/**
 * Verify if an image contains a valid LSB watermark
 * 
 * @param imageBase64 - Base64 encoded image
 * @returns true if valid watermark found
 */
export const verifyLSBWatermark = async (imageBase64: string): Promise<boolean> => {
    if (isNativeLSBAvailable()) {
        try {
            return await NativeModule.verifyLSB(imageBase64);
        } catch (error) {
            console.warn('Native LSB verify failed:', error);
        }
    }

    // Fallback: check for delimiter
    return imageBase64.includes('<!--WATERMARK:') && imageBase64.includes(':WATERMARK-->');
};

/**
 * Parse watermark payload into structured data
 * Format: documentUUID|recipientEmail|timestamp|deviceHash
 */
export const parseWatermarkPayload = (payload: string): {
    documentUUID: string;
    recipientEmail: string;
    timestamp: number;
    deviceHash: string;
} | null => {
    const parts = payload.split('|');
    if (parts.length !== 4) return null;

    return {
        documentUUID: parts[0],
        recipientEmail: parts[1],
        timestamp: parseInt(parts[2], 10),
        deviceHash: parts[3]
    };
};

// Re-export the native module for direct access if needed
export default NativeModule;
