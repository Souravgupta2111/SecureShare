/**
 * Security Native Module Bridge
 *
 * Unified JS interface for screen-capture protection & screenshot detection.
 *
 * IMPLEMENTATION: Built on top of `expo-screen-capture`, which ships prebuilt
 * native code and works in any EAS Dev Client / production build WITHOUT any
 * custom native module wiring or config plugin.
 *
 *   - Android: `preventScreenCaptureAsync()` sets the window FLAG_SECURE flag,
 *     which blocks screenshots + screen recordings (they render black) and
 *     blanks the recent-apps preview.
 *   - iOS: iOS cannot *block* screenshots, but `addScreenshotListener()`
 *     detects them so we can blur/log/notify. Screen recordings are prevented
 *     via `preventScreenCaptureAsync()` on iOS 11+.
 *
 * NOTE: These APIs are no-ops inside Expo Go for some platforms, but are fully
 * functional in Dev Client and store builds.
 */

import * as Haptics from 'expo-haptics';
import {
    addScreenshotListener,
    allowScreenCaptureAsync,
    preventScreenCaptureAsync,
} from 'expo-screen-capture';
import { Platform } from 'react-native';

// Unique key so multiple prevent/allow calls don't conflict with the
// component-level usePreventScreenCapture() hook.
const SECURE_KEY = 'secureshare-viewer';

// Active screenshot subscription (iOS/Android)
let screenshotSubscription = null;
let onScreenshotCallback = null;
let onRecordingCallback = null;

/**
 * Enable screen-capture protection.
 * Android: sets FLAG_SECURE (screenshots/recordings blocked).
 * iOS: prevents screen recording (screenshots can only be detected).
 */
export const enableSecureMode = async () => {
    try {
        await preventScreenCaptureAsync(SECURE_KEY);
        console.log('[Security] Screen capture protection enabled');
        return { success: true, native: true };
    } catch (e) {
        console.warn('[Security] preventScreenCaptureAsync failed:', e?.message);
        return { success: false, error: e?.message };
    }
};

/**
 * Disable screen-capture protection (call on viewer close).
 */
export const disableSecureMode = async () => {
    try {
        await allowScreenCaptureAsync(SECURE_KEY);
        console.log('[Security] Screen capture protection disabled');
        return { success: true };
    } catch (e) {
        console.warn('[Security] allowScreenCaptureAsync failed:', e?.message);
        return { success: false, error: e?.message };
    }
};

/**
 * Start screenshot detection.
 * Fires `onScreenshot` when the user takes a screenshot (primarily iOS, also
 * supported on Android). `onRecording` is retained for API compatibility.
 */
export const startScreenshotDetection = (onScreenshot, onRecording) => {
    onScreenshotCallback = onScreenshot;
    onRecordingCallback = onRecording;

    // Avoid duplicate subscriptions
    stopScreenshotDetection();

    try {
        screenshotSubscription = addScreenshotListener(() => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
            if (onScreenshotCallback) onScreenshotCallback();
        });
        console.log('[Security] Screenshot detection active');
        return { success: true };
    } catch (e) {
        console.warn('[Security] addScreenshotListener failed:', e?.message);
        return { success: false, error: e?.message };
    }
};

/**
 * Stop screenshot detection and clean up the subscription.
 */
export const stopScreenshotDetection = () => {
    if (screenshotSubscription) {
        try {
            screenshotSubscription.remove();
        } catch {
            // ignore
        }
        screenshotSubscription = null;
    }
    onScreenshotCallback = null;
    onRecordingCallback = null;
};

/**
 * Report which security features are available on this platform/build.
 */
export const checkSecurityCapabilities = () => {
    return {
        platform: Platform.OS,
        // FLAG_SECURE (true screenshot block) is Android-only.
        flagSecureAvailable: Platform.OS === 'android',
        // Screenshot detection listener works on iOS (and Android).
        screenshotDetectionAvailable: true,
        isExpoGo: false,
    };
};

/**
 * Human-readable security status for UI banners.
 */
export const getSecurityStatusMessage = () => {
    if (Platform.OS === 'android') {
        return 'Screen capture blocked';
    }
    if (Platform.OS === 'ios') {
        return 'Screen recording blocked · screenshots detected';
    }
    return 'Security features active';
};

export default {
    enableSecureMode,
    disableSecureMode,
    startScreenshotDetection,
    stopScreenshotDetection,
    checkSecurityCapabilities,
    getSecurityStatusMessage,
};
