/**
 * Document Watermarking Module
 * 
 * Zero-width character injection for TXT, DOCX, and PDF files.
 * Uses invisible Unicode characters to embed payload without visual changes.
 */

// --- SHARED HELPERS ---

const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const lookup = new Uint8Array(256);
for (let i = 0; i < chars.length; i++) {
    lookup[chars.charCodeAt(i)] = i;
}

const decodeBase64 = (base64) => {
    let bufferLength = base64.length * 0.75;
    let len = base64.length;
    if (base64[len - 1] === '=') bufferLength--;
    if (base64[len - 2] === '=') bufferLength--;

    const bytes = new Uint8Array(bufferLength);
    let p = 0;
    for (let i = 0; i < len; i += 4) {
        const e1 = lookup[base64.charCodeAt(i)];
        const e2 = lookup[base64.charCodeAt(i + 1)];
        const e3 = lookup[base64.charCodeAt(i + 2)];
        const e4 = lookup[base64.charCodeAt(i + 3)];
        bytes[p++] = (e1 << 2) | (e2 >> 4);
        bytes[p++] = ((e2 & 15) << 4) | (e3 >> 2);
        bytes[p++] = ((e3 & 3) << 6) | (e4 & 63);
    }
    return bytes;
};

// --- ZERO-WIDTH CHARACTER ENCODING ---

const ZERO_WIDTH_SPACE = '\u200B';       // bit 0
const ZERO_WIDTH_NON_JOINER = '\u200C';  // bit 1
const ZERO_WIDTH_JOINER = '\u200D';      // char delimiter
const ZERO_WIDTH_NO_BREAK_SPACE = '\uFEFF'; // start marker

const stringToZeroWidth = (str) => {
    let zw = ZERO_WIDTH_NO_BREAK_SPACE;
    for (let i = 0; i < str.length; i++) {
        const bin = str.charCodeAt(i).toString(2).padStart(8, '0');
        for (let bit of bin) {
            zw += bit === '0' ? ZERO_WIDTH_SPACE : ZERO_WIDTH_NON_JOINER;
        }
        if (i < str.length - 1) zw += ZERO_WIDTH_JOINER;
    }
    return zw;
};

const zeroWidthToString = (zwStr) => {
    const parts = zwStr.split(ZERO_WIDTH_JOINER);
    let result = '';
    for (let part of parts) {
        let bin = '';
        for (let char of part) {
            if (char === ZERO_WIDTH_SPACE) bin += '0';
            else if (char === ZERO_WIDTH_NON_JOINER) bin += '1';
        }
        if (bin.length > 0) result += String.fromCharCode(parseInt(bin, 2));
    }
    return result;
};

/** UTF-8 encode a JS string to byte array (handles multibyte ZW chars) */
const utf8Encode = (str) => {
    const bytes = [];
    for (let i = 0; i < str.length; i++) {
        let code = str.charCodeAt(i);
        if (code <= 0x7F) bytes.push(code);
        else if (code <= 0x7FF) {
            bytes.push(0xC0 | (code >> 6));
            bytes.push(0x80 | (code & 0x3F));
        } else if (code <= 0xFFFF) {
            bytes.push(0xE0 | (code >> 12));
            bytes.push(0x80 | ((code >> 6) & 0x3F));
            bytes.push(0x80 | (code & 0x3F));
        }
    }
    return bytes;
};

// --- EMBEDDING ---

/**
 * Embed zero-width watermark into a document.
 * @param {Uint8Array|string} fileData - Document data
 * @param {string} fileExtension - "txt", "docx", or "pdf"
 * @param {string} payload - Watermark payload string
 * @returns {Uint8Array|string} Watermarked document data
 */
export const embedDocumentWatermark = (fileData, fileExtension, payload) => {
    const zwPayload = stringToZeroWidth(payload);
    const ext = fileExtension.toLowerCase().replace('.', '');

    if (ext === 'docx') {
        const bytes = embedDocx(fileData, zwPayload);
        return encodeBase64(bytes);
    }
    if (ext === 'pdf') {
        const bytes = embedPdf(fileData, zwPayload);
        return encodeBase64(bytes);
    }
    if (ext === 'txt') {
        const result = embedTxt(fileData, zwPayload);
        return result instanceof Uint8Array ? encodeBase64(result) : result;
    }

    return fileData; // unsupported format — pass through
};

const encodeBase64 = (bytes) => {
    let binary = '';
    const len = bytes.byteLength;
    // Chunking to avoid stack overflow on large arrays
    const chunkSize = 16384; 
    for (let i = 0; i < len; i += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunkSize, len)));
    }
    return (global.btoa || btoa)(binary);
};

const embedDocx = (fileData, zwPayload) => {
    let bytes = fileData instanceof Uint8Array ? fileData : decodeBase64(fileData);
    const searchBytes = [0x3C, 0x2F, 0x77, 0x3A, 0x62, 0x6F, 0x64, 0x79, 0x3E]; // </w:body>

    let insertIndex = -1;
    for (let i = 0; i < bytes.length - searchBytes.length; i++) {
        let match = true;
        for (let j = 0; j < searchBytes.length; j++) {
            if (bytes[i + j] !== searchBytes[j]) { match = false; break; }
        }
        if (match) { insertIndex = i; break; }
    }

    if (insertIndex !== -1) {
        const zwBytes = utf8Encode(zwPayload);
        const newBytes = new Uint8Array(bytes.length + zwBytes.length);
        newBytes.set(bytes.subarray(0, insertIndex), 0);
        newBytes.set(zwBytes, insertIndex);
        newBytes.set(bytes.subarray(insertIndex), insertIndex + zwBytes.length);
        return newBytes;
    }
    console.warn('[Watermark/Document] DOCX: </w:body> not found in raw bytes. File may use ZIP compression. Watermark NOT embedded.');
    return bytes;
};

const embedPdf = (fileData, zwPayload) => {
    let bytes = fileData instanceof Uint8Array ? fileData : decodeBase64(fileData);
    const searchBytes = [0x25, 0x25, 0x45, 0x4F, 0x46]; // %%EOF

    let insertIndex = -1;
    for (let i = bytes.length - searchBytes.length; i >= 0; i--) {
        let match = true;
        for (let j = 0; j < searchBytes.length; j++) {
            if (bytes[i + j] !== searchBytes[j]) { match = false; break; }
        }
        if (match) { insertIndex = i; break; }
    }

    if (insertIndex !== -1) {
        const metaStr = `\n%SecureShareWatermark: ${zwPayload}\n`;
        const metaBytes = utf8Encode(metaStr);
        const newBytes = new Uint8Array(bytes.length + metaBytes.length);
        newBytes.set(bytes.subarray(0, insertIndex), 0);
        newBytes.set(metaBytes, insertIndex);
        newBytes.set(bytes.subarray(insertIndex), insertIndex + metaBytes.length);
        return newBytes;
    }
    console.warn('[Watermark/Document] PDF: %%EOF not found. Watermark NOT embedded.');
    return bytes;
};

const embedTxt = (fileData, zwPayload) => {
    if (fileData instanceof Uint8Array) {
        const zwBytes = new TextEncoder().encode(zwPayload);
        const newBytes = new Uint8Array(fileData.length + zwBytes.length);
        newBytes.set(fileData, 0);
        newBytes.set(zwBytes, fileData.length);
        return newBytes;
    }
    return fileData + zwPayload;
};

// --- EXTRACTION ---

/**
 * Extract zero-width watermark from a document.
 * @param {string} fileData - Base64-encoded document data
 * @param {string} fileExtension - "txt", "docx", or "pdf"
 * @returns {string|null} Extracted payload or null
 */
export const extractDocumentWatermark = (fileData, fileExtension) => {
    const ext = fileExtension.toLowerCase().replace('.', '');
    const bytes = decodeBase64(fileData);

    if (ext === 'txt') return extractTxt(bytes);
    if (ext === 'docx') return extractDocx(bytes);
    if (ext === 'pdf') return extractPdf(bytes);
    return null;
};

const START_MARKER_BYTES = [0xEF, 0xBB, 0xBF]; // U+FEFF in UTF-8

const extractTxt = (bytes) => {
    let startIndex = -1;
    for (let i = 0; i < bytes.length - 2; i++) {
        if (bytes[i] === START_MARKER_BYTES[0] &&
            bytes[i + 1] === START_MARKER_BYTES[1] &&
            bytes[i + 2] === START_MARKER_BYTES[2]) {
            startIndex = i; break;
        }
    }
    if (startIndex === -1) return null;

    let extractedZw = '';
    for (let i = startIndex; i < bytes.length;) {
        let code = 0, len = 0;
        if ((bytes[i] & 0x80) === 0) { len = 1; code = bytes[i]; }
        else if ((bytes[i] & 0xE0) === 0xC0) { len = 2; code = ((bytes[i] & 0x1F) << 6) | (bytes[i + 1] & 0x3F); }
        else if ((bytes[i] & 0xF0) === 0xE0) { len = 3; code = ((bytes[i] & 0x0F) << 12) | ((bytes[i + 1] & 0x3F) << 6) | (bytes[i + 2] & 0x3F); }
        if (len === 0) break;
        const c = String.fromCharCode(code);
        if (c === ZERO_WIDTH_SPACE || c === ZERO_WIDTH_NON_JOINER || c === ZERO_WIDTH_JOINER || c === ZERO_WIDTH_NO_BREAK_SPACE) {
            if (c !== ZERO_WIDTH_NO_BREAK_SPACE) extractedZw += c;
        }
        i += len;
    }
    return extractedZw.length > 0 ? zeroWidthToString(extractedZw) : null;
};

const extractDocx = (bytes) => {
    const END_BYTES = [0x3C, 0x2F, 0x77, 0x3A, 0x62, 0x6F, 0x64, 0x79, 0x3E]; // </w:body>
    let endIndex = -1;
    for (let i = 0; i < bytes.length - END_BYTES.length; i++) {
        let match = true;
        for (let j = 0; j < END_BYTES.length; j++) { if (bytes[i + j] !== END_BYTES[j]) { match = false; break; } }
        if (match) { endIndex = i; break; }
    }
    if (endIndex === -1) return null;

    const chunk = bytes.subarray(Math.max(0, endIndex - 5000), endIndex);
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
    if (markerIndex === -1) return null;

    const sequence = str.substring(markerIndex + 1);
    let clean = '';
    for (let c of sequence) {
        if (c === ZERO_WIDTH_SPACE || c === ZERO_WIDTH_NON_JOINER || c === ZERO_WIDTH_JOINER) clean += c;
    }
    return zeroWidthToString(clean);
};

const extractPdf = (bytes) => {
    const chunk = bytes.subarray(Math.max(0, bytes.length - 20000));
    const prefix = '%SecureShareWatermark: ';
    const prefixBytes = [];
    for (let i = 0; i < prefix.length; i++) prefixBytes.push(prefix.charCodeAt(i));

    let foundPos = -1;
    for (let i = 0; i < chunk.length - prefixBytes.length; i++) {
        let m = true;
        for (let j = 0; j < prefixBytes.length; j++) if (chunk[i + j] !== prefixBytes[j]) { m = false; break; }
        if (m) { foundPos = i; break; }
    }
    if (foundPos === -1) return null;

    const payloadBytes = chunk.subarray(foundPos + prefixBytes.length);
    let decoded = '';
    for (let i = 0; i < payloadBytes.length && i < 5000;) {
        let code = 0, len = 0;
        if (payloadBytes[i] === 0x0A || payloadBytes[i] === 0x0D) break;
        if ((payloadBytes[i] & 0x80) === 0) { len = 1; code = payloadBytes[i]; }
        else if ((payloadBytes[i] & 0xE0) === 0xC0) { len = 2; code = ((payloadBytes[i] & 0x1F) << 6) | (payloadBytes[i + 1] & 0x3F); }
        else if ((payloadBytes[i] & 0xF0) === 0xE0) { len = 3; code = ((payloadBytes[i] & 0x0F) << 12) | ((payloadBytes[i + 1] & 0x3F) << 6) | (payloadBytes[i + 2] & 0x3F); }
        else { i++; continue; }
        decoded += String.fromCharCode(code);
        i += len;
    }
    return zeroWidthToString(decoded);
};
