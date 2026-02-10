/**
 * Document Expiry Notifications
 * 
 * Schedules local notifications for documents that are about to expire.
 * Notifies users 24 hours and 1 hour before expiry.
 */

import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const SCHEDULED_NOTIFICATIONS_KEY = 'secureshare_scheduled_notifications';

// Notification timing (ms before expiry)
const NOTIFICATION_TIMES = {
    '24h': 24 * 60 * 60 * 1000,
    '1h': 60 * 60 * 1000,
};

/**
 * Initialize notification permissions and handlers
 */
export const initializeExpiryNotifications = async () => {
    try {
        // Request permissions
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }

        if (finalStatus !== 'granted') {
            console.log('[ExpiryNotifications] Permission not granted');
            return false;
        }

        // Configure notification handler
        Notifications.setNotificationHandler({
            handleNotification: async () => ({
                shouldShowAlert: true,
                shouldPlaySound: true,
                shouldSetBadge: true,
            }),
        });

        console.log('[ExpiryNotifications] Initialized successfully');
        return true;
    } catch (error) {
        console.error('[ExpiryNotifications] Init error:', error);
        return false;
    }
};

/**
 * Schedule expiry notifications for a document
 * @param {Object} document - Document object with id, filename, expiresAt
 */
export const scheduleExpiryNotifications = async (document) => {
    if (!document.expiresAt || !document.id) {
        console.warn('[ExpiryNotifications] Missing required document fields');
        return;
    }

    const expiresAt = typeof document.expiresAt === 'number'
        ? document.expiresAt
        : new Date(document.expiresAt).getTime();

    const now = Date.now();
    const scheduledIds = [];

    // Cancel any existing notifications for this document
    await cancelExpiryNotifications(document.id);

    // Schedule 24h notification
    const time24h = expiresAt - NOTIFICATION_TIMES['24h'];
    if (time24h > now) {
        try {
            const id = await Notifications.scheduleNotificationAsync({
                content: {
                    title: '📄 Document Expiring Soon',
                    body: `"${document.filename}" will expire in 24 hours`,
                    data: {
                        type: 'document_expiry',
                        documentId: document.id,
                        timing: '24h',
                    },
                    sound: true,
                },
                trigger: {
                    type: Notifications.SchedulableTriggerInputTypes.DATE,
                    date: new Date(time24h),
                },
            });
            scheduledIds.push({ id, timing: '24h' });
            console.log('[ExpiryNotifications] Scheduled 24h notification for:', document.filename);
        } catch (e) {
            console.error('[ExpiryNotifications] Failed to schedule 24h:', e);
        }
    }

    // Schedule 1h notification
    const time1h = expiresAt - NOTIFICATION_TIMES['1h'];
    if (time1h > now) {
        try {
            const id = await Notifications.scheduleNotificationAsync({
                content: {
                    title: '⚠️ Document Expiring!',
                    body: `"${document.filename}" will expire in 1 hour`,
                    data: {
                        type: 'document_expiry',
                        documentId: document.id,
                        timing: '1h',
                    },
                    sound: true,
                    priority: Platform.OS === 'android' ? 'high' : undefined,
                },
                trigger: {
                    type: Notifications.SchedulableTriggerInputTypes.DATE,
                    date: new Date(time1h),
                },
            });
            scheduledIds.push({ id, timing: '1h' });
            console.log('[ExpiryNotifications] Scheduled 1h notification for:', document.filename);
        } catch (e) {
            console.error('[ExpiryNotifications] Failed to schedule 1h:', e);
        }
    }

    // Store scheduled notification IDs
    if (scheduledIds.length > 0) {
        await storeScheduledNotification(document.id, scheduledIds);
    }

    return scheduledIds;
};

/**
 * Cancel all expiry notifications for a document
 */
export const cancelExpiryNotifications = async (documentId) => {
    try {
        const stored = await getStoredNotifications();
        const docNotifications = stored[documentId];

        if (docNotifications && Array.isArray(docNotifications)) {
            for (const { id } of docNotifications) {
                await Notifications.cancelScheduledNotificationAsync(id);
            }
            console.log('[ExpiryNotifications] Cancelled notifications for document:', documentId);
        }

        // Remove from storage
        delete stored[documentId];
        await AsyncStorage.setItem(SCHEDULED_NOTIFICATIONS_KEY, JSON.stringify(stored));
    } catch (e) {
        console.error('[ExpiryNotifications] Cancel error:', e);
    }
};

/**
 * Schedule notifications for multiple documents
 */
export const scheduleAllExpiryNotifications = async (documents) => {
    if (!Array.isArray(documents)) return;

    const activeDocuments = documents.filter(
        doc => doc.status === 'active' && doc.expiresAt
    );

    for (const doc of activeDocuments) {
        await scheduleExpiryNotifications(doc);
    }

    console.log(`[ExpiryNotifications] Scheduled for ${activeDocuments.length} documents`);
};

/**
 * Clear all scheduled expiry notifications
 */
export const clearAllExpiryNotifications = async () => {
    try {
        const stored = await getStoredNotifications();

        for (const documentId of Object.keys(stored)) {
            await cancelExpiryNotifications(documentId);
        }

        await AsyncStorage.removeItem(SCHEDULED_NOTIFICATIONS_KEY);
        console.log('[ExpiryNotifications] Cleared all notifications');
    } catch (e) {
        console.error('[ExpiryNotifications] Clear all error:', e);
    }
};

// Helper: Store notification IDs
const storeScheduledNotification = async (documentId, notifications) => {
    try {
        const stored = await getStoredNotifications();
        stored[documentId] = notifications;
        await AsyncStorage.setItem(SCHEDULED_NOTIFICATIONS_KEY, JSON.stringify(stored));
    } catch (e) {
        console.error('[ExpiryNotifications] Storage error:', e);
    }
};

// Helper: Get stored notifications
const getStoredNotifications = async () => {
    try {
        const data = await AsyncStorage.getItem(SCHEDULED_NOTIFICATIONS_KEY);
        return data ? JSON.parse(data) : {};
    } catch {
        return {};
    }
};

export default {
    initializeExpiryNotifications,
    scheduleExpiryNotifications,
    cancelExpiryNotifications,
    scheduleAllExpiryNotifications,
    clearAllExpiryNotifications,
};
