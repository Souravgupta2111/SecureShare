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
        const currentTotal = this._totalSize || 0;
        while (currentTotal + sizeBytes > MAX_TOTAL_CACHE_SIZE && this.accessOrder.length > 0) {
            this._evictLRU();
            // Recalculate after eviction
            this._recalculateTotalSize();
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
    }

    getCacheStats() {
        // Use tracked total size for efficiency
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

// Singleton cache instance
const documentCache = new LRUCache(DEFAULT_CACHE_SIZE);

// Memory warning handling
let memoryWarningHandler = null;
let isLowMemory = false;

/**
 * Initialize memory manager
 * Call this on app startup
 */
export const initializeMemoryManager = () => {
    // Listen for app state changes to clear cache on background
    AppState.addEventListener('change', (state) => {
        if (state === 'background') {
            // Clear half the cache when backgrounded to free memory
            const itemsToEvict = Math.floor(documentCache.cache.size / 2);
            for (let i = 0; i < itemsToEvict; i++) {
                documentCache._evictLRU();
            }
        }
    });

    // Platform-specific memory warning handlers
    if (Platform.OS === 'ios') {
        // iOS sends memory warnings through AppState events
        // Note: Actual memory warning listener requires native module
        console.log('[MemoryManager] Initialized for iOS');
    } else if (Platform.OS === 'android') {
        // Android doesn't have a built-in JS memory warning API in RN
        // Could be handled via native module
        console.log('[MemoryManager] Initialized for Android');
    }

    console.log('[MemoryManager] Cache initialized with max', DEFAULT_CACHE_SIZE, 'items');
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
export const cacheDocument = (documentId, data, sizeBytes = 0) => {
    if (isLowMemory) {
        console.log('[MemoryManager] Skipping cache in low memory state');
        return false;
    }
    return documentCache.set(`doc_${documentId}`, data, sizeBytes);
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
