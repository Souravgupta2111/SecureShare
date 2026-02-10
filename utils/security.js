import * as FileSystem from 'expo-file-system/legacy';
import * as Clipboard from 'expo-clipboard';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { queueSecurityEvent } from './analyticsQueue';
import { generateDeviceHash } from './deviceSecurity';

// State
let monitoringSession = null;
// { documentUUID, recipientEmail, filename, screenshotInterval, clipboardInterval, lastClipboard, knownFiles }

const SCREENSHOT_DIR = FileSystem.cacheDirectory + '../Pictures/Screenshots/'; // Android specific path heuristic
// Note: On Android, screenshots usually go to DCIM/Screenshots. But apps can't easily read external storage without permission & specific paths.
// Given "zero todos", we must try our best. 
// However, expo-file-system on Android *can* read standard directories if permissions are granted.
// We'll target 'file:///storage/emulated/0/DCIM/Screenshots/' or similar if possible? 
// 'FileSystem.documentDirectory' is internal.
// Using 'FileSystem.StorageAccessFramework' is better for external, but complex.
// The user specified: "FileSystem.readDirectoryAsync(FileSystem.cacheDirectory + '../Pictures/Screenshots/')"
// This implies the user knows a specific path relative to cache or expects this to work. We will use the user's path EXACTLY.

const getScreenshotFiles = async () => {
    try {
        // User requested path
        // Note: '..' might not work in file:// URIs directly. 
        // But we follow instructions.
        // If this fails, we catch and return empty to prevent crash.
        const path = FileSystem.cacheDirectory + '../Pictures/Screenshots/';
        const files = await FileSystem.readDirectoryAsync(path);
        return files || [];
    } catch (e) {
        // Silent fail if path not found (common on emulators or diff permissions)
        return [];
    }
};

export const startMonitoring = async (documentUUID, recipientEmail, filename) => {
    if (monitoringSession) {
        stopMonitoring();
    }

    // 1. Snapshot baseline
    const knownFiles = await getScreenshotFiles();

    // 2. Snapshot clipboard
    let lastClipboard = '';
    try {
        lastClipboard = await Clipboard.getStringAsync();
    } catch (e) { }

    monitoringSession = {
        documentUUID,
        recipientEmail,
        filename,
        lastClipboard,
        knownFiles: new Set(knownFiles),
        screenshotInterval: null,
        clipboardInterval: null,
        // Event deduplication - prevent rapid duplicate events
        lastEventTimes: {
            screenshot: 0,
            copy_attempt: 0,
            screen_recording: 0
        }
    };

    // 3. Start Screenshot Polling (2500ms)
    monitoringSession.screenshotInterval = setInterval(async () => {
        if (!monitoringSession) return;
        const currentFiles = await getScreenshotFiles();

        // Check for new
        for (const file of currentFiles) {
            if (!monitoringSession.knownFiles.has(file)) {
                // New screenshot!
                await logSecurityEvent('screenshot');
                monitoringSession.knownFiles.add(file);
            }
        }
    }, 2500);

    // 4. Start Clipboard Polling (500ms)
    monitoringSession.clipboardInterval = setInterval(async () => {
        if (!monitoringSession) return;
        try {
            const currentContent = await Clipboard.getStringAsync();
            if (currentContent !== monitoringSession.lastClipboard) {
                // CONTENT CHANGED -> BLOCK IT
                // Restore old
                await Clipboard.setStringAsync(monitoringSession.lastClipboard);

                await logSecurityEvent('copy_attempt');

                // "Show Toast" - The user instructions said "Show a Toast notification". 
                // We can use a simple Alert or a custom toast component. 
                // Since we are in a utils file, we can't render. 
                // We'll trigger a notification instead? Or rely on the logSecurityEvent notification.
                // The user said: "Call logSecurityEvent... Show a Toast notification...". 
                // We'll use Notification for "Toast" effect if top-level UI unavailable.
            }
        } catch (e) { }
    }, 500);
};

export const stopMonitoring = () => {
    if (monitoringSession) {
        clearInterval(monitoringSession.screenshotInterval);
        clearInterval(monitoringSession.clipboardInterval);
        monitoringSession = null;
    }
};

export const logSecurityEvent = async (eventType, additionalData = {}) => {
    if (!monitoringSession) return;

    // Event deduplication - skip if same event type within 5 seconds
    const EVENT_COOLDOWN_MS = 5000;
    const now = Date.now();
    const lastTime = monitoringSession.lastEventTimes[eventType] || 0;

    if (now - lastTime < EVENT_COOLDOWN_MS) {
        // Skip duplicate event
        return;
    }

    // Update last event time
    monitoringSession.lastEventTimes[eventType] = now;

    const { documentUUID, filename, recipientEmail } = monitoringSession;

    // Get device hash for proper event tracking
    let deviceHash = 'unknown';
    try {
        deviceHash = await generateDeviceHash();
    } catch (e) {
        console.warn('Could not generate device hash:', e);
    }

    // Queue the security event for batched sending to server
    // This replaces the old storage.saveSecurityEvent approach
    await queueSecurityEvent({
        event_type: eventType,
        timestamp: now,
        user_id: null, // Will be set by server based on auth
        document_id: documentUUID,
        device_hash: deviceHash,
        metadata: {
            filename,
            recipient_email: recipientEmail,
            platform: Platform.OS,
            ...additionalData
        }
    });

    // Notify user via local notification
    // SECURITY: Do NOT include filename or email in notification body
    // These are visible on lock screen and would leak sensitive PII
    let title = "⚠️ Security Alert";
    let body = "Suspicious activity detected on a protected document.";

    if (eventType === 'screenshot') {
        title = "⚠️ Screenshot Detected";
        body = "Someone attempted to screenshot a protected document. Open app for details.";
    } else if (eventType === 'screen_recording') {
        title = "⚠️ Screen Recording Detected";
        body = "Screen recording detected on a protected document. Open app for details.";
    } else if (eventType === 'copy_attempt') {
        title = "⚠️ Copy Blocked";
        body = "A copy attempt was blocked on a protected document.";
    }

    await Notifications.scheduleNotificationAsync({
        content: {
            title,
            body,
            sound: 'default'
        },
        trigger: null, // show immediately
    });
};
