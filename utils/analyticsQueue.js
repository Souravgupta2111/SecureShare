/**
 * Analytics Event Queue
 * 
 * Batches analytics events to reduce API calls and costs.
 * Events are queued locally and sent in batches every 30 seconds
 * or when the app goes to background.
 * 
 * SECURITY: Automatically includes user_id from auth context for RLS compliance.
 * PRIVACY: Respects user consent settings before queuing events.
 */

import { AppState } from 'react-native';
import { logAnalyticsEvent, logSecurityEvent, supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = 'secureshare_analytics_queue';
const CONSENT_KEY = 'secureshare_analytics_consent';
const BATCH_INTERVAL = 30000; // 30 seconds
const MAX_BATCH_SIZE = 50;
const MAX_RETRY_ATTEMPTS = 5;
const BASE_RETRY_DELAY_MS = 1000; // 1 second base for exponential backoff

let queue = [];
let batchTimer = null;
let appStateSubscription = null;
let analyticsConsent = false; // Default OFF for privacy
let isInitialized = false; // Track initialization state
let initPromise = null; // Promise that resolves when initialized

/**
 * Get current authenticated user ID
 * @returns {Promise<string|null>} User ID or null if not authenticated
 */
const getCurrentUserId = async () => {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        return user?.id || null;
    } catch {
        return null;
    }
};

/**
 * Check if analytics consent is granted
 * @returns {Promise<boolean>}
 */
const checkAnalyticsConsent = async () => {
    try {
        const consent = await AsyncStorage.getItem(CONSENT_KEY);
        return consent === 'true';
    } catch {
        return false;
    }
};

/**
 * Update analytics consent setting
 * @param {boolean} consent - Whether analytics consent is granted
 */
export const setAnalyticsConsent = async (consent) => {
    analyticsConsent = consent;
    await AsyncStorage.setItem(CONSENT_KEY, consent ? 'true' : 'false');
    
    // If consent was revoked, clear pending analytics events (but keep security events)
    if (!consent && Array.isArray(queue)) {
        queue = queue.filter(e => e.type === 'security');
        await saveQueue();
    }
};

/**
 * Initialize analytics queue
 * Loads pending events and starts batch timer
 * SECURITY: Must complete before any events can be queued
 */
export const initializeAnalyticsQueue = async () => {
    if (initPromise) {
        return initPromise; // Return existing promise if already initializing
    }

    initPromise = (async () => {
        // Load consent setting FIRST (synchronously)
        analyticsConsent = await checkAnalyticsConsent();

        // Load pending events from storage
        try {
            const stored = await AsyncStorage.getItem(QUEUE_KEY);
            if (stored) {
                queue = JSON.parse(stored);
            }
        } catch (error) {
            console.error('Failed to load analytics queue:', error);
        }

        // Start batch timer
        startBatchTimer();

        // Listen for app state changes to flush on background
        appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
            if (nextAppState === 'background' || nextAppState === 'inactive') {
                flushQueue();
            }
        });

        isInitialized = true;
        console.log('[AnalyticsQueue] Initialized with consent:', analyticsConsent);
    })();

    return initPromise;
};

/**
 * Start the batch timer
 */
const startBatchTimer = () => {
    if (batchTimer) clearInterval(batchTimer);

    batchTimer = setInterval(() => {
        flushQueue();
    }, BATCH_INTERVAL);
};

/**
 * Add analytics event to queue
 * PRIVACY: Only queues if analytics consent is granted
 * SECURITY: Automatically includes user_id from auth context
 * 
 * @param {Object} event - Analytics event data
 */
export const queueAnalyticsEvent = async (event) => {
    // Wait for initialization to complete if not yet initialized
    if (!isInitialized && initPromise) {
        await initPromise;
    }

    // PRIVACY: Early return if consent not granted
    if (!analyticsConsent) {
        return;
    }

    // Ensure queue is an array
    if (!Array.isArray(queue)) {
        queue = [];
    }

    // SECURITY: Get user_id from auth context
    const userId = event.user_id || await getCurrentUserId();

    queue.push({
        ...event,
        user_id: userId,
        queuedAt: Date.now(),
        type: 'analytics'
    });

    // Save to storage
    await saveQueue();

    // Flush if queue is getting large
    if (queue.length >= MAX_BATCH_SIZE) {
        flushQueue();
    }
};

/**
 * Add security event to queue
 * NOTE: Security events are always logged regardless of consent
 * SECURITY: Automatically includes user_id from auth context
 * 
 * @param {Object} event - Security event data
 */
export const queueSecurityEvent = async (event) => {
    // Ensure queue is an array
    if (!Array.isArray(queue)) {
        queue = [];
    }

    // SECURITY: Get user_id from auth context
    const userId = event.user_id || await getCurrentUserId();

    queue.push({
        ...event,
        user_id: userId,
        queuedAt: Date.now(),
        type: 'security'
    });

    // Save to storage
    await saveQueue();

    // Security events are more critical, flush more aggressively
    if (queue.length >= 10) {
        flushQueue();
    }
};

/**
 * Save queue to storage
 */
const saveQueue = async () => {
    try {
        await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    } catch (error) {
        console.error('Failed to save analytics queue:', error);
    }
};

/**
 * Flush queue - send all pending events with exponential backoff retry
 */
export const flushQueue = async () => {
    if (!Array.isArray(queue) || queue.length === 0) return;

    const eventsToSend = [...queue];
    queue = [];
    await saveQueue();

    // Send events in batches with concurrency limit
    const batchSize = 10;
    for (let i = 0; i < eventsToSend.length; i += batchSize) {
        const batch = eventsToSend.slice(i, i + batchSize);

        const results = await Promise.allSettled(
            batch.map(async (event) => {
                const retryCount = event._retryCount || 0;

                // Skip if max retries exceeded
                if (retryCount >= MAX_RETRY_ATTEMPTS) {
                    console.warn('Event dropped after max retries:', event.event_type);
                    return { dropped: true };
                }

                try {
                    if (event.type === 'security') {
                        await logSecurityEvent(event);
                    } else {
                        await logAnalyticsEvent(event);
                    }
                    return { success: true };
                } catch (error) {
                    console.error('Failed to send event, will retry:', error);

                    // Re-queue with incremented retry count and backoff delay
                    const backoffMs = BASE_RETRY_DELAY_MS * Math.pow(2, retryCount);
                    event._retryCount = retryCount + 1;
                    event._nextRetryAt = Date.now() + backoffMs;
                    queue.push(event);

                    return { success: false, retryScheduled: true };
                }
            })
        );
    }

    // Save any re-queued events
    if (queue.length > 0) {
        await saveQueue();
        console.log(`Analytics queue: ${queue.length} events pending retry`);
    }
};

/**
 * Clear the queue (for testing or reset)
 */
export const clearQueue = async () => {
    queue = [];
    await AsyncStorage.removeItem(QUEUE_KEY);
};

/**
 * Cleanup - stop timers and listeners
 */
export const cleanupAnalyticsQueue = () => {
    if (batchTimer) {
        clearInterval(batchTimer);
        batchTimer = null;
    }
    if (appStateSubscription) {
        appStateSubscription.remove();
        appStateSubscription = null;
    }
    // Flush remaining events
    flushQueue();
};

export default {
    initializeAnalyticsQueue,
    queueAnalyticsEvent,
    queueSecurityEvent,
    flushQueue,
    clearQueue,
    cleanupAnalyticsQueue,
    setAnalyticsConsent,
};
