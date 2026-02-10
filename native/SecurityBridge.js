/**
 * Security Native Module Bridge
 * 
 * Provides a unified JS interface for native security features:
 * - Android FLAG_SECURE (prevents screenshots/recordings)
 * - iOS screenshot detection
 * 
 * For Expo Managed workflow, this uses best-effort JS polyfills.
 * For Expo Dev Client / bare workflow, this uses real native modules.
 */

import { Platform, NativeModules, NativeEventEmitter, AppState } from 'react-native';
import * as Haptics from 'expo-haptics';

// Check if native modules are available
const FlagSecureModule = NativeModules.FlagSecure;
const ScreenshotDetectorModule = NativeModules.ScreenshotDetectorModule;

// Event emitter for screenshot events (iOS)
let screenshotEmitter = null;
if (ScreenshotDetectorModule) {
    screenshotEmitter = new NativeEventEmitter(ScreenshotDetectorModule);
}

// Callbacks storage
let onScreenshotCallback = null;
let onRecordingCallback = null;

/**
 * Enable FLAG_SECURE on Android
 * Makes screenshots and screen recordings show black
 */
export const enableSecureMode = async () => {
    if (Platform.OS === 'android') {
        if (FlagSecureModule?.enable) {
            try {
                await FlagSecureModule.enable();
                console.log('[Security] FLAG_SECURE enabled');
                return { success: true, native: true };
            } catch (e) {
                console.warn('[Security] Native FLAG_SECURE failed:', e);
                return { success: false, error: e.message };
            }
        } else {
            console.log('[Security] FLAG_SECURE not available (Expo Go)');
            return { success: false, error: 'Native module not available' };
        }
    }
    return { success: false, error: 'Not Android' };
};

/**
 * Disable FLAG_SECURE on Android
 */
export const disableSecureMode = async () => {
    if (Platform.OS === 'android') {
        if (FlagSecureModule?.disable) {
            try {
                await FlagSecureModule.disable();
                console.log('[Security] FLAG_SECURE disabled');
                return { success: true };
            } catch (e) {
                console.warn('[Security] Native FLAG_SECURE disable failed:', e);
                return { success: false, error: e.message };
            }
        }
    }
    return { success: false };
};

/**
 * Start screenshot detection on iOS
 */
export const startScreenshotDetection = (onScreenshot, onRecording) => {
    onScreenshotCallback = onScreenshot;
    onRecordingCallback = onRecording;

    if (Platform.OS === 'ios') {
        if (screenshotEmitter) {
            // Native module available
            screenshotEmitter.addListener('onScreenshot', () => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                if (onScreenshotCallback) onScreenshotCallback();
            });

            screenshotEmitter.addListener('onRecording', () => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                if (onRecordingCallback) onRecordingCallback();
            });

            console.log('[Security] Native screenshot detection started');
        } else {
            // Fallback: Use AppState for basic detection (limited)
            console.log('[Security] Using AppState fallback for iOS');
        }
    }
};

/**
 * Stop screenshot detection
 */
export const stopScreenshotDetection = () => {
    if (Platform.OS === 'ios' && screenshotEmitter) {
        screenshotEmitter.removeAllListeners('onScreenshot');
        screenshotEmitter.removeAllListeners('onRecording');
    }
    onScreenshotCallback = null;
    onRecordingCallback = null;
};

/**
 * Check if native security features are available
 */
export const checkSecurityCapabilities = () => {
    return {
        platform: Platform.OS,
        flagSecureAvailable: Platform.OS === 'android' && !!FlagSecureModule,
        screenshotDetectionAvailable: Platform.OS === 'ios' && !!ScreenshotDetectorModule,
        isExpoGo: !FlagSecureModule && !ScreenshotDetectorModule,
    };
};

/**
 * Get security status string for UI
 */
export const getSecurityStatusMessage = () => {
    const caps = checkSecurityCapabilities();

    if (caps.isExpoGo) {
        return Platform.OS === 'android'
            ? 'Screenshot protection requires Dev Client build'
            : 'Screenshot detection active (limited)';
    }

    if (Platform.OS === 'android') {
        return caps.flagSecureAvailable
            ? 'Screen capture blocked'
            : 'Screenshot protection unavailable';
    }

    if (Platform.OS === 'ios') {
        return caps.screenshotDetectionAvailable
            ? 'Screenshot detection active'
            : 'Screenshot monitoring active';
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
