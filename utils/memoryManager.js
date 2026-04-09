/**
 * Memory Manager - Mobile-optimized memory management
 * 
 * Features:
 * - LRU cache for document data
 * - Memory warning handling
 * - Storage availability checking
 */

import { Platform, AppState } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';

// LRU Cache Configuration
const DEFAULT_CACHE_SIZE = 10; // Max items in cache
const DEFAULT_MAX_ITEM_SIZE = 5 * 1024 * 1024; // 5MB per item
const MAX_TOTAL_CACHE_SIZE = 30 * 1024 * 1024; // 30MB total cache limit
const MIN_STORAGE_THRESHOLD = 50 * 1024 * 1024; // 50MB minimum free space

// Persistence
const CACHE_META_KEY = 'secureshare_lru_cache_meta';
const CACHE_FILES_DIR = FileSystem.cacheDirectory + 'secureshare_lru/';

// Simple LRU Cache implementation
class LRUCache {
    constructor(maxSize = DEFAULT_CACHE_SIZE) {
        this.maxSize = maxSize;
        this.cache = new Map();
        this.accessOrder = []; // Track access order for LRU
        this._totalSize = 0; // Track total cache size in bytes
    }

    get(key) {
        if (this.cache.has(key)) {
            // Update access order
            this._touch(key);
            return this.cache.get(key);
        }
        return null;
    }

    set(key, value, sizeBytes = 0) {
        // Check if item is too large
        if (sizeBytes > DEFAULT_MAX_ITEM_SIZE) {
            console.warn(`[MemoryManager] Item too large for cache: ${sizeBytes} bytes`);
            return false;
        }

        // If key exists, update it
        if (this.cache.has(key)) {
            const oldItem = this.cache.get(key);
            const oldSize = oldItem?.sizeBytes || 0;
            this.cache.set(key, { value, sizeBytes, timestamp: Date.now() });
            this._touch(key);
            // Update total size tracking
            this._totalSize = (this._totalSize || 0) - oldSize + sizeBytes;
            return true;
        }

        // Evict if at capacity (by count)
        while (this.cache.size >= this.maxSize && this.accessOrder.length > 0) {
            this._evictLRU();
        }

        // Evict if total cache size exceeds limit
        while ((this._totalSize || 0) + sizeBytes > MAX_TOTAL_CACHE_SIZE && this.accessOrder.length > 0) {
            this._evictLRU();
        }

        // Add new item
        this.cache.set(key, { value, sizeBytes, timestamp: Date.now() });
        this.accessOrder.push(key);
        this._totalSize = (this._totalSize || 0) + sizeBytes;
        return true;
    }

    has(key) {
        return this.cache.has(key);
    }

    delete(key) {
        if (this.cache.has(key)) {
            this.cache.delete(key);
            this.accessOrder = this.accessOrder.filter(k => k !== key);
            return true;
        }
        return false;
    }

    clear() {
        this.cache.clear();
        this.accessOrder = [];
        this._totalSize = 0;
        // Async disk cleanup (fire-and-forget)
        _clearDiskCache().catch(e => console.warn('[MemoryManager] Disk cache clear failed:', e));
    }

    getCacheStats() {
        const totalSize = this._totalSize || 0;
        return {
            itemCount: this.cache.size,
            maxItems: this.maxSize,
            totalSize,
            maxTotalSize: MAX_TOTAL_CACHE_SIZE,
            hitRate: this._hitRate || 0,
        };
    }

    _touch(key) {
        this.accessOrder = this.accessOrder.filter(k => k !== key);
        this.accessOrder.push(key);
    }

    _evictLRU() {
        const keyToEvict = this.accessOrder.shift();
        if (keyToEvict) {
            const item = this.cache.get(keyToEvict);
            const itemSize = item?.sizeBytes || 0;
            console.log(`[MemoryManager] Evicting LRU item: ${keyToEvict} (${itemSize} bytes)`);
            this.cache.delete(keyToEvict);
            this._totalSize = (this._totalSize || 0) - itemSize;
            // Remove file from disk cache
            _removeDiskEntry(keyToEvict).catch(() => {});
        }
    }

    _recalculateTotalSize() {
        let total = 0;
        this.cache.forEach(item => {
            total += item.sizeBytes || 0;
        });
        this._totalSize = total;
    }
}

// --- DISK PERSISTENCE HELPERS ---

const _ensureCacheDir = async () => {
    const info = await FileSystem.getInfoAsync(CACHE_FILES_DIR);
    if (!info.exists) {
        await FileSystem.makeDirectoryAsync(CACHE_FILES_DIR, { intermediates: true });
    }
};

/** Save cache metadata (keys, sizes, order) to AsyncStorage */
const _persistMeta = async (cache) => {
    try {
        const meta = {
            accessOrder: cache.accessOrder,
            items: {},
        };
        cache.cache.forEach((value, key) => {
            meta.items[key] = { sizeBytes: value.sizeBytes, timestamp: value.timestamp };
        });
        await AsyncStorage.setItem(CACHE_META_KEY, JSON.stringify(meta));
    } catch (e) {
        console.warn('[MemoryManager] Meta persist failed:', e);
    }
};

/** Save a document blob to the disk cache */
const _saveToDisk = async (key, data) => {
    try {
        await _ensureCacheDir();
        const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
        const path = CACHE_FILES_DIR + safeKey + '.cache';
        // data could be base64 string or serializable object
        const serialized = typeof data === 'string' ? data : JSON.stringify(data);
        await FileSystem.writeAsStringAsync(path, serialized);
    } catch (e) {
        console.warn('[MemoryManager] Disk write failed for', key, e);
    }
};

/** Load a document blob from the disk cache */
const _loadFromDisk = async (key) => {
    try {
        const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
        const path = CACHE_FILES_DIR + safeKey + '.cache';
        const info = await FileSystem.getInfoAsync(path);
        if (!info.exists) return null;
        const raw = await FileSystem.readAsStringAsync(path);
        try { return JSON.parse(raw); } catch { return raw; }
    } catch {
        return null;
    }
};

const _removeDiskEntry = async (key) => {
    try {
        const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
        const path = CACHE_FILES_DIR + safeKey + '.cache';
        await FileSystem.deleteAsync(path, { idempotent: true });
    } catch { /* ignore */ }
};

const _clearDiskCache = async () => {
    try {
        await FileSystem.deleteAsync(CACHE_FILES_DIR, { idempotent: true });
        await AsyncStorage.removeItem(CACHE_META_KEY);
    } catch { /* ignore */ }
};

/** Restore cache metadata from disk on init */
const _restoreCache = async (cache) => {
    try {
        const raw = await AsyncStorage.getItem(CACHE_META_KEY);
        if (!raw) return;
        const meta = JSON.parse(raw);
        if (!meta?.accessOrder || !meta?.items) return;

        // Restore access order and metadata (data loaded lazily from disk)
        for (const key of meta.accessOrder) {
            const item = meta.items[key];
            if (item) {
                const data = await _loadFromDisk(key);
                if (data !== null) {
                    cache.cache.set(key, {
                        value: data,
                        sizeBytes: item.sizeBytes || 0,
                        timestamp: item.timestamp || Date.now(),
                    });
                    cache.accessOrder.push(key);
                    cache._totalSize += item.sizeBytes || 0;
                }
            }
        }
        console.log(`[MemoryManager] Restored ${cache.cache.size} items from disk cache`);
    } catch (e) {
        console.warn('[MemoryManager] Cache restore failed:', e);
    }
};

// Singleton cache instance
const documentCache = new LRUCache(DEFAULT_CACHE_SIZE);

// Memory warning handling
let memoryWarningHandler = null;
let isLowMemory = false;

/**
 * Initialize memory manager
 * Call this on app startup
 */
export const initializeMemoryManager = async () => {
    // Restore persisted cache from disk
    await _restoreCache(documentCache);

    // Listen for app state changes
    AppState.addEventListener('change', (state) => {
        if (state === 'background') {
            // Persist metadata before going to background
            _persistMeta(documentCache).catch(() => {});
            // Clear half the cache when backgrounded to free memory
            const itemsToEvict = Math.floor(documentCache.cache.size / 2);
            for (let i = 0; i < itemsToEvict; i++) {
                documentCache._evictLRU();
            }
        }
    });

    console.log(`[MemoryManager] Initialized with ${documentCache.cache.size} cached items, max ${DEFAULT_CACHE_SIZE}`);
};

/**
 * Handle low memory situation
 * Call this when OS signals memory pressure
 */
export const handleMemoryWarning = () => {
    console.warn('[MemoryManager] Memory warning received!');
    isLowMemory = true;

    // Aggressive cache clearing
    documentCache.clear();

    // Clear AsyncStorage temp items
    try {
        AsyncStorage.getAllKeys().then(keys => {
            const tempKeys = keys.filter(k => k.startsWith('temp_') || k.startsWith('cache_'));
            if (tempKeys.length > 0) {
                AsyncStorage.multiRemove(tempKeys);
            }
        });
    } catch (e) {
        console.error('[MemoryManager] Failed to clear temp storage:', e);
    }

    // Reset flag after a delay
    setTimeout(() => {
        isLowMemory = false;
    }, 30000);
};

/**
 * Get cached document data
 * @param {string} documentId - Document ID
 * @returns {any|null} Cached data or null
 */
export const getCachedDocument = (documentId) => {
    return documentCache.get(`doc_${documentId}`);
};

/**
 * Cache document data
 * @param {string} documentId - Document ID
 * @param {any} data - Data to cache
 * @param {number} sizeBytes - Size of data in bytes
 */
export const cacheDocument = async (documentId, data, sizeBytes = 0) => {
    if (isLowMemory) {
        console.log('[MemoryManager] Skipping cache in low memory state');
        return false;
    }
    const key = `doc_${documentId}`;
    const result = documentCache.set(key, data, sizeBytes);
    if (result) {
        // Persist to disk (non-blocking)
        _saveToDisk(key, data).then(() => _persistMeta(documentCache)).catch(() => {});
    }
    return result;
};

/**
 * Remove document from cache
 * @param {string} documentId - Document ID
 */
export const uncacheDocument = (documentId) => {
    return documentCache.delete(`doc_${documentId}`);
};

/**
 * Check available storage space
 * @returns {Promise<{available: number, total: number, isLow: boolean}>}
 */
export const checkStorageAvailability = async () => {
    try {
        const info = await FileSystem.getFreeDiskStorageAsync();
        const total = info; // expo-file-system returns free space

        return {
            available: info,
            total: total,
            isLow: info < MIN_STORAGE_THRESHOLD,
            formatted: formatBytes(info),
        };
    } catch (e) {
        console.error('[MemoryManager] Failed to check storage:', e);
        return {
            available: 0,
            total: 0,
            isLow: true,
            formatted: 'Unknown',
            error: e.message,
        };
    }
};

/**
 * Check if there's enough space for a file
 * @param {number} fileSize - Required size in bytes
 * @returns {Promise<boolean>}
 */
export const hasSpaceForFile = async (fileSize) => {
    const storage = await checkStorageAvailability();
    return storage.available > fileSize + MIN_STORAGE_THRESHOLD;
};

/**
 * Get cache statistics
 * @returns {Object} Cache stats
 */
export const getCacheStats = () => {
    return {
        ...documentCache.getCacheStats(),
        isLowMemory,
    };
};

/**
 * Clear all caches
 */
export const clearAllCaches = () => {
    documentCache.clear();
    console.log('[MemoryManager] All caches cleared');
};

/**
 * Format bytes to human-readable string
 * @param {number} bytes - Bytes to format
 * @returns {string} Formatted string
 */
const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export default {
    initializeMemoryManager,
    handleMemoryWarning,
    getCachedDocument,
    cacheDocument,
    uncacheDocument,
    checkStorageAvailability,
    hasSpaceForFile,
    getCacheStats,
    clearAllCaches,
};
