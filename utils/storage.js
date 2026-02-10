/**
 * SecureShare Storage Utility - Enhanced Version
 * 
 * Key improvements:
 * - Large file data stored in FileSystem (not AsyncStorage)
 * - Only metadata + file paths in AsyncStorage
 * - Better performance for images and documents
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

const DOCS_KEY = 'secureshare_docs';
const EVENTS_KEY = 'secureshare_security_events';
const FILES_DIR = FileSystem.documentDirectory + 'secureshare_files/';

// --- INITIALIZATION ---

const ensureFilesDir = async () => {
    const dirInfo = await FileSystem.getInfoAsync(FILES_DIR);
    if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(FILES_DIR, { intermediates: true });
    }
};

// --- FILE OPERATIONS ---

/**
 * Saves file data to FileSystem and returns the file path
 */
const saveFileData = async (uuid, dataType, base64Data) => {
    await ensureFilesDir();
    const filename = `${uuid}_${dataType}.dat`;
    const filepath = FILES_DIR + filename;

    try {
        await FileSystem.writeAsStringAsync(filepath, base64Data, {
            encoding: FileSystem.EncodingType.Base64
        });
        return filepath;
    } catch (error) {
        console.error('Failed to save file data:', error);
        throw error;
    }
};

/**
 * Reads file data from FileSystem
 */
const readFileData = async (filepath) => {
    try {
        const exists = await FileSystem.getInfoAsync(filepath);
        if (!exists.exists) return null;

        return await FileSystem.readAsStringAsync(filepath, {
            encoding: FileSystem.EncodingType.Base64
        });
    } catch (error) {
        console.error('Failed to read file data:', error);
        return null;
    }
};

/**
 * Deletes file data from FileSystem
 */
const deleteFileData = async (filepath) => {
    try {
        const exists = await FileSystem.getInfoAsync(filepath);
        if (exists.exists) {
            await FileSystem.deleteAsync(filepath, { idempotent: true });
        }
    } catch (error) {
        console.error('Failed to delete file data:', error);
    }
};

// --- DOCUMENTS ---

export const saveDocument = async (doc) => {
    try {
        await ensureFilesDir();

        // Extract large data to save to files
        const { watermarkedData, originalData, ...metadata } = doc;

        // Save file data to FileSystem
        let watermarkedPath = null;
        let originalPath = null;

        if (watermarkedData) {
            watermarkedPath = await saveFileData(doc.uuid, 'watermarked', watermarkedData);
        }
        if (originalData) {
            originalPath = await saveFileData(doc.uuid, 'original', originalData);
        }

        // Create document metadata (stored in AsyncStorage)
        const docMetadata = {
            ...metadata,
            watermarkedPath,
            originalPath,
            // Keep backwards compatibility flags
            hasWatermarkedData: !!watermarkedData,
            hasOriginalData: !!originalData,
            isStarred: doc.isStarred || false,
            isOffline: doc.isOffline || false,
        };

        // Save metadata to AsyncStorage
        const existingStr = await AsyncStorage.getItem(DOCS_KEY);
        const docs = existingStr ? JSON.parse(existingStr) : [];
        docs.push(docMetadata);
        await AsyncStorage.setItem(DOCS_KEY, JSON.stringify(docs));

        return docMetadata;
    } catch (e) {
        console.error('Failed to save document', e);
        throw e;
    }
};

export const getAllDocuments = async () => {
    try {
        const existingStr = await AsyncStorage.getItem(DOCS_KEY);
        return existingStr ? JSON.parse(existingStr) : [];
    } catch (e) {
        console.error('Failed to get documents', e);
        return [];
    }
};

export const getDocumentByUUID = async (uuid) => {
    try {
        const docs = await getAllDocuments();
        return docs.find(d => d.uuid === uuid) || null;
    } catch (e) {
        console.error('Failed to get document by uuid', e);
        return null;
    }
};

/**
 * Gets a document with its file data loaded
 */
export const getDocumentWithData = async (uuid) => {
    try {
        const doc = await getDocumentByUUID(uuid);
        if (!doc) return null;

        // Load file data from FileSystem
        const watermarkedData = doc.watermarkedPath
            ? await readFileData(doc.watermarkedPath)
            : null;
        const originalData = doc.originalPath
            ? await readFileData(doc.originalPath)
            : null;

        return {
            ...doc,
            watermarkedData,
            originalData
        };
    } catch (e) {
        console.error('Failed to get document with data', e);
        return null;
    }
};

export const updateDocument = async (uuid, updates) => {
    try {
        const existingStr = await AsyncStorage.getItem(DOCS_KEY);
        let docs = existingStr ? JSON.parse(existingStr) : [];

        const index = docs.findIndex(d => d.uuid === uuid);
        if (index !== -1) {
            // Handle file data updates if present
            const { watermarkedData, originalData, ...metadataUpdates } = updates;

            if (watermarkedData) {
                const path = await saveFileData(uuid, 'watermarked', watermarkedData);
                metadataUpdates.watermarkedPath = path;
                metadataUpdates.hasWatermarkedData = true;
            }
            if (originalData) {
                const path = await saveFileData(uuid, 'original', originalData);
                metadataUpdates.originalPath = path;
                metadataUpdates.hasOriginalData = true;
            }

            docs[index] = { ...docs[index], ...metadataUpdates };
            await AsyncStorage.setItem(DOCS_KEY, JSON.stringify(docs));
            return docs[index];
        }
        return null;
    } catch (e) {
        console.error('Failed to update document', e);
        throw e;
    }
};

export const renameDocument = async (uuid, newName) => {
    try {
        return await updateDocument(uuid, { filename: newName });
    } catch (e) {
        console.error('Failed to rename document', e);
        throw e;
    }
};

export const toggleStar = async (uuid, isStarred) => {
    return await updateDocument(uuid, { isStarred });
};

export const toggleOffline = async (uuid, isOffline) => {
    return await updateDocument(uuid, { isOffline });
};

export const revokeDocument = async (uuid) => {
    return await updateDocument(uuid, { status: 'revoked', expiresAt: Date.now() });
};

export const deleteDocument = async (uuid) => {
    // Soft delete by default
    return await updateDocument(uuid, {
        status: 'deleted',
        deletedAt: Date.now()
    });
};

export const restoreDocument = async (uuid) => {
    return await updateDocument(uuid, {
        status: 'active',
        deletedAt: null
    });
};

export const permanentlyDeleteDocument = async (uuid) => {
    try {
        const doc = await getDocumentByUUID(uuid);
        if (!doc) return;

        // Delete file data
        if (doc.watermarkedPath) {
            await deleteFileData(doc.watermarkedPath);
        }
        if (doc.originalPath) {
            await deleteFileData(doc.originalPath);
        }

        // Remove from AsyncStorage
        const existingStr = await AsyncStorage.getItem(DOCS_KEY);
        let docs = existingStr ? JSON.parse(existingStr) : [];
        docs = docs.filter(d => d.uuid !== uuid);
        await AsyncStorage.setItem(DOCS_KEY, JSON.stringify(docs));
    } catch (e) {
        console.error('Failed to delete document', e);
        throw e;
    }
};

export const duplicateDocument = async (uuid) => {
    try {
        const doc = await getDocumentWithData(uuid); // Get full data
        if (!doc) return null;

        const newUuid = crypto.randomUUID();
        const newDoc = {
            ...doc,
            uuid: newUuid,
            filename: `Copy of ${doc.filename}`,
            name: `Copy of ${doc.name || doc.filename}`,
            created_at: new Date().toISOString(),
            isStarred: false,
            status: 'active'
        };

        // If it has file data, we need to save new copies of the files
        // Note: In a real app we might use file references to save space, but here we copy for simplicity
        if (doc.watermarkedData) {
            // We need to re-save the data to get a new path
            // This is a bit inefficient (read->write) but safe
            // For now, let's just rely on the saveDocument logic which usually expects data
        }

        // Actually, since we have the data in memory from getDocumentWithData, we can just save it as a new doc
        // BUT saveDocument expects 'watermarkedData' property, not path.
        // getDocumentWithData returns that. Perfect.

        return await saveDocument(newDoc);
    } catch (e) {
        console.error('Failed to duplicate document', e);
        throw e;
    }
};

// --- SECURITY EVENTS ---

export const saveSecurityEvent = async (event) => {
    try {
        // 1. Save to global events list
        const existingEventsStr = await AsyncStorage.getItem(EVENTS_KEY);
        const events = existingEventsStr ? JSON.parse(existingEventsStr) : [];
        events.push(event);
        await AsyncStorage.setItem(EVENTS_KEY, JSON.stringify(events));

        // 2. Save to specific document's event list
        const existingDocsStr = await AsyncStorage.getItem(DOCS_KEY);
        let docs = existingDocsStr ? JSON.parse(existingDocsStr) : [];

        const docIndex = docs.findIndex(d => d.uuid === event.documentUUID);
        if (docIndex !== -1) {
            const doc = docs[docIndex];
            if (!doc.securityEvents) doc.securityEvents = [];
            doc.securityEvents.push(event);
            docs[docIndex] = doc;
            await AsyncStorage.setItem(DOCS_KEY, JSON.stringify(docs));
        }
    } catch (e) {
        console.error('Failed to save security event', e);
    }
};

export const getAllSecurityEvents = async () => {
    try {
        const str = await AsyncStorage.getItem(EVENTS_KEY);
        return str ? JSON.parse(str) : [];
    } catch (e) {
        console.error('Failed to get security events', e);
        return [];
    }
};

export const getSecurityEventsForDocument = async (documentUUID) => {
    try {
        const all = await getAllSecurityEvents();
        return all.filter(e => e.documentUUID === documentUUID);
    } catch (e) {
        console.error('Failed to get events for document', e);
        return [];
    }
};

export const clearAllData = async () => {
    try {
        // Delete all file data
        const dirInfo = await FileSystem.getInfoAsync(FILES_DIR);
        if (dirInfo.exists) {
            await FileSystem.deleteAsync(FILES_DIR, { idempotent: true });
        }

        // Clear AsyncStorage
        await AsyncStorage.removeItem(DOCS_KEY);
        await AsyncStorage.removeItem(EVENTS_KEY);
        await AsyncStorage.removeItem('secureshare_settings');
        await AsyncStorage.removeItem('secureshare_security_last_viewed');
    } catch (e) {
        console.error('Failed to clear data', e);
    }
};
