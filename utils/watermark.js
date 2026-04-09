/**
 * SecureShare Watermark Utilities — Barrel Index
 * 
 * Re-exports all watermark modules so existing imports continue to work:
 *   import * as watermark from '../utils/watermark'
 *   import { getCleanImageBase64, extractDocumentWatermark } from '../utils/watermark'
 */

// Image watermarking (LSB + legacy delimiter)
export {
    isNativeLSBAvailable,
    embedImageWatermarkAsync,
    embedImageWatermarkFromFileAsync,
    embedImageWatermark,
    extractImageWatermarkAsync,
    extractImageWatermark,
    verifyImageWatermark,
    extractPayloadFromMessage,
    isValidWrappedMessage,
    getCleanImageBase64,
} from './watermark/image';

// Document watermarking (zero-width characters)
export {
    embedDocumentWatermark,
    extractDocumentWatermark,
} from './watermark/document';

// HMAC signatures & hashing
export {
    generateWatermarkSignature,
    verifyWatermarkSignature,
    createSignedWatermarkPayload,
    generateWatermarkHash,
} from './watermark/hmac';
