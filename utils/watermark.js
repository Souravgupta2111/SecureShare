/**
 * SecureShare Watermark Utilities — Barrel Index
 * 
 * Re-exports all watermark modules so existing imports continue to work:
 *   import * as watermark from '../utils/watermark'
 *   import { getCleanImageBase64, extractDocumentWatermark } from '../utils/watermark'
 */

// Image watermarking (LSB + legacy delimiter)
export {
    embedImageWatermark, embedImageWatermarkAsync,
    embedImageWatermarkFromFileAsync, extractImageWatermark, extractImageWatermarkAsync, extractPayloadFromMessage, getCleanImageBase64, isNativeLSBAvailable, isValidWrappedMessage, verifyImageWatermark
} from './watermark/image';

// Document watermarking (zero-width characters)
export {
    embedDocumentWatermark,
    extractDocumentWatermark
} from './watermark/document';

// HMAC signatures & hashing
export {
    createSignedWatermarkPayload,
    generateWatermarkHash, generateWatermarkSignature, signWatermarkHash,
    verifyWatermarkHashSignature, verifyWatermarkSignature
} from './watermark/hmac';

