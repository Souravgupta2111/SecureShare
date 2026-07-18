/**
 * Notification Service
 * 
 * Handles all push notifications for SecureShare:
 * - Document opened alerts
 * - Expiry warnings
 * - Security alerts
 * - Background scheduling
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { savePushToken } from '../lib/supabase';

/**
 * Resolve the EAS projectId at runtime.
 * EAS injects this into the manifest for production/preview builds, and it can
 * also be read from app.json `extra.eas.projectId`. We never hard-code it.
 */
const getEasProjectId = () => {
    return (
        Constants?.expoConfig?.extra?.eas?.projectId ||
        Constants?.easConfig?.projectId ||
        null
    );
};

const NOTIFICATION_CHANNEL_ID = 'secureshare-alerts';
const PUSH_TOKEN_KEY = 'secureshare_push_token';
const PENDING_NOTIFICATIONS_KEY = 'secureshare_pending_notifications';

// Notification types
export const NotificationType = {
    DOCUMENT_OPENED: 'document_opened',
    DOCUMENT_EXPIRING: 'document_expiring',
    DOCUMENT_EXPIRED: 'document_expired',
    SECURITY_ALERT: 'security_alert',
    ACCESS_REVOKED: 'access_revoked',
};

/**
 * Initialize notification service
 */
export const initializeNotifications = async () => {
    // Set up notification handler
    Notifications.setNotificationHandler({
        handleNotification: async () => ({
            // SDK 54: shouldShowAlert is deprecated in favor of banner/list.
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: true,
            shouldSetBadge: true,
        }),
    });

    // Create Android notification channel (safe regardless of permission state)
    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL_ID, {
            name: 'SecureShare Alerts',
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#3d7aff',
            sound: 'default',
        });
    }

    // Do NOT prompt for permission here. Prompting on Home mount is an eager
    // cold-ish prompt; permission is requested contextually during onboarding
    // and when scheduling an expiry reminder. Only register a push token if the
    // user has ALREADY granted permission.
    const { status } = await Notifications.getPermissionsAsync();
    if (status === 'granted') {
        return registerForPushNotifications();
    }

    return null;
};

/**
 * Request notification permissions
 */
export const requestNotificationPermissions = async () => {
    if (!Device.isDevice) {
        console.log('Push notifications require physical device');
        return { status: 'denied' };
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
    }

    return { status: finalStatus };
};

/**
 * Register for push notifications and get token
 */
export const registerForPushNotifications = async () => {
    try {
        const projectId = getEasProjectId();
        if (!projectId) {
            // No EAS project configured yet — remote push is unavailable, but
            // local notifications still work. Fail quietly instead of throwing.
            console.warn(
                '[Notifications] No EAS projectId found. Remote push disabled. ' +
                'Set expo.extra.eas.projectId (via `eas init`) to enable push tokens.'
            );
            return null;
        }

        const token = await Notifications.getExpoPushTokenAsync({ projectId });

        await AsyncStorage.setItem(PUSH_TOKEN_KEY, token.data);
        // Upload the token to the user's profile so the notify-owner Edge
        // Function can push real-time alerts to them. Best-effort.
        try {
            await savePushToken(token.data);
        } catch (e) {
            console.warn('[Notifications] Failed to sync push token to profile:', e?.message);
        }
        return token.data;
    } catch (e) {
        console.error('Failed to get push token:', e);
        return null;
    }
};

/**
 * Schedule a local notification
 */
export const scheduleNotification = async ({
    title,
    body,
    data = {},
    trigger = null, // null = immediate
}) => {
    const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
            title,
            body,
            data,
            sound: 'default',
            priority: Notifications.AndroidNotificationPriority.HIGH,
            ...(Platform.OS === 'android' && {
                channelId: NOTIFICATION_CHANNEL_ID,
            }),
        },
        trigger,
    });

    return notificationId;
};

/**
 * Send document opened notification
 */
export const notifyDocumentOpened = async (documentName, recipientEmail) => {
    return scheduleNotification({
        title: '👁️ New Activity',
        body: 'A secure document was viewed. Open app for details.',
        data: {
            type: NotificationType.DOCUMENT_OPENED,
            documentName,
            recipientEmail, // Data payload remains for in-app handling
        },
    });
};

/**
 * Send security alert notification
 */
export const notifySecurityAlert = async (documentName, eventType, recipientEmail) => {
    const eventMessages = {
        screenshot: '📸 Screenshot attempt',
        recording: '🎥 Recording attempt',
        copy: '📋 Copy attempt',
    };

    return scheduleNotification({
        title: '🚨 Security Alert',
        body: `${eventMessages[eventType] || 'Security event'} on "${documentName}" by ${recipientEmail}`,
        data: {
            type: NotificationType.SECURITY_ALERT,
            eventType,
            documentName,
            recipientEmail,
        },
    });
};

/**
 * Schedule expiry warning notification
 * Warns 24h before expiry, or 1h before if short duration
 */
export const scheduleExpiryWarning = async (documentId, documentName, expiresAt) => {
    const now = Date.now();
    const timeUntilExpiry = expiresAt - now;

    if (timeUntilExpiry <= 0) return null;

    let triggerDate = null;
    let bodyText = '';

    // If > 25h remaining, warn at 24h mark
    if (timeUntilExpiry > 25 * 60 * 60 * 1000) {
        triggerDate = new Date(expiresAt - (24 * 60 * 60 * 1000));
        bodyText = `"${documentName}" expires in 24 hours`;
    }
    // If > 75m remaining, warn at 1h mark
    else if (timeUntilExpiry > 75 * 60 * 1000) {
        triggerDate = new Date(expiresAt - (60 * 60 * 1000));
        bodyText = `"${documentName}" expires in 1 hour`;
    }

    if (triggerDate) {
        return scheduleNotification({
            title: '⏰ Document Expiring Soon',
            body: bodyText,
            data: {
                type: NotificationType.DOCUMENT_EXPIRING,
                documentId,
                documentName,
            },
            trigger: {
                date: triggerDate,
            },
        });
    }

    return null;
};

/**
 * Cancel a scheduled notification
 */
export const cancelNotification = async (notificationId) => {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
};

/**
 * Cancel all notifications for a document
 */
export const cancelDocumentNotifications = async (documentId) => {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();

    for (const notification of scheduled) {
        if (notification.content.data?.documentId === documentId) {
            await cancelNotification(notification.identifier);
        }
    }
};

/**
 * Set up notification response handler
 */
export const setNotificationResponseHandler = (handler) => {
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
        const data = response.notification.request.content.data;
        handler(data);
    });

    return () => subscription.remove();
};

/**
 * Set up notification received handler (foreground)
 */
export const setNotificationReceivedHandler = (handler) => {
    const subscription = Notifications.addNotificationReceivedListener(notification => {
        handler(notification);
    });

    return () => subscription.remove();
};

/**
 * Get badge count
 */
export const getBadgeCount = async () => {
    return Notifications.getBadgeCountAsync();
};

/**
 * Set badge count
 */
export const setBadgeCount = async (count) => {
    await Notifications.setBadgeCountAsync(count);
};

/**
 * Clear all notifications
 */
export const clearAllNotifications = async () => {
    await Notifications.dismissAllNotificationsAsync();
    await setBadgeCount(0);
};

export default {
    initializeNotifications,
    requestNotificationPermissions,
    scheduleNotification,
    notifyDocumentOpened,
    notifySecurityAlert,
    scheduleExpiryWarning,
    cancelNotification,
    cancelDocumentNotifications,
    setNotificationResponseHandler,
    setNotificationReceivedHandler,
    getBadgeCount,
    setBadgeCount,
    clearAllNotifications,
};
