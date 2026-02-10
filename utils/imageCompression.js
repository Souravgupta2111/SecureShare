/**
 * Image Compression Utility
 * 
 * Compresses images before encryption to reduce file size and improve performance.
 * Uses expo-image-manipulator for cross-platform support.
 */

import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';

// Target max size in bytes (1MB)
const TARGET_MAX_SIZE = 1024 * 1024;

// Quality levels to try
const QUALITY_LEVELS = [0.8, 0.6, 0.4, 0.3, 0.2];

/**
 * Compress an image to target size
 * @param {string} uri - Image URI (file:// or content://)
 * @param {Object} options - Compression options
 * @returns {Promise<{uri: string, base64: string, width: number, height: number, size: number}>}
 */
export const compressImage = async (uri, options = {}) => {
    const {
        maxWidth = 1920,
        maxHeight = 1920,
        maxSizeBytes = TARGET_MAX_SIZE,
        format = ImageManipulator.SaveFormat.JPEG,
    } = options;

    console.log('[ImageCompression] Starting compression for:', uri);

    try {
        // Get original file info
        const originalInfo = await FileSystem.getInfoAsync(uri);
        const originalSize = originalInfo.size || 0;
        console.log('[ImageCompression] Original size:', formatBytes(originalSize));

        // If already small enough, just return with base64
        if (originalSize <= maxSizeBytes) {
            const base64 = await FileSystem.readAsStringAsync(uri, {
                encoding: FileSystem.EncodingType.Base64,
            });
            console.log('[ImageCompression] Already under target size, no compression needed');
            return {
                uri,
                base64,
                size: originalSize,
                compressed: false,
            };
        }

        // First pass: Resize if needed
        let result = await ImageManipulator.manipulateAsync(
            uri,
            [{ resize: { width: maxWidth, height: maxHeight } }],
            { compress: 0.9, format, base64: true }
        );

        let currentSize = estimateBase64Size(result.base64);
        console.log('[ImageCompression] After resize:', formatBytes(currentSize));

        // If still too large, try progressively lower quality
        for (const quality of QUALITY_LEVELS) {
            if (currentSize <= maxSizeBytes) break;

            console.log('[ImageCompression] Trying quality:', quality);
            result = await ImageManipulator.manipulateAsync(
                uri,
                [{ resize: { width: maxWidth, height: maxHeight } }],
                { compress: quality, format, base64: true }
            );

            currentSize = estimateBase64Size(result.base64);
            console.log('[ImageCompression] Size at quality', quality, ':', formatBytes(currentSize));
        }

        // If still too large, reduce dimensions
        if (currentSize > maxSizeBytes) {
            const scaleFactor = Math.sqrt(maxSizeBytes / currentSize);
            const newWidth = Math.floor(maxWidth * scaleFactor);
            const newHeight = Math.floor(maxHeight * scaleFactor);

            console.log('[ImageCompression] Reducing dimensions to:', newWidth, 'x', newHeight);
            result = await ImageManipulator.manipulateAsync(
                uri,
                [{ resize: { width: newWidth, height: newHeight } }],
                { compress: QUALITY_LEVELS[QUALITY_LEVELS.length - 1], format, base64: true }
            );

            currentSize = estimateBase64Size(result.base64);
        }

        console.log('[ImageCompression] Final size:', formatBytes(currentSize));
        console.log('[ImageCompression] Compression ratio:',
            Math.round((1 - currentSize / originalSize) * 100) + '%');

        return {
            uri: result.uri,
            base64: result.base64,
            width: result.width,
            height: result.height,
            size: currentSize,
            originalSize,
            compressed: true,
            compressionRatio: 1 - currentSize / originalSize,
        };

    } catch (error) {
        console.error('[ImageCompression] Error:', error);
        throw new Error(`Image compression failed: ${error.message}`);
    }
};

/**
 * Compress image from base64 string
 */
export const compressBase64Image = async (base64, mimeType = 'image/jpeg', options = {}) => {
    // Create temporary file
    const tempUri = FileSystem.cacheDirectory + 'temp_compress_' + Date.now() + '.jpg';

    try {
        await FileSystem.writeAsStringAsync(tempUri, base64, {
            encoding: FileSystem.EncodingType.Base64,
        });

        const result = await compressImage(tempUri, options);

        // Clean up temp file
        await FileSystem.deleteAsync(tempUri, { idempotent: true });

        return result;
    } catch (error) {
        // Clean up on error
        await FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(() => { });
        throw error;
    }
};

/**
 * Check if file needs compression
 */
export const needsCompression = async (uri, maxSizeBytes = TARGET_MAX_SIZE) => {
    try {
        const info = await FileSystem.getInfoAsync(uri);
        return info.size > maxSizeBytes;
    } catch {
        return false;
    }
};

/**
 * Estimate size of base64 string in bytes
 */
const estimateBase64Size = (base64) => {
    if (!base64) return 0;
    // Base64 inflates size by ~37%, so decoded size is roughly base64.length * 0.75
    return Math.ceil(base64.length * 0.75);
};

/**
 * Format bytes to human readable string
 */
const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export default {
    compressImage,
    compressBase64Image,
    needsCompression,
};
