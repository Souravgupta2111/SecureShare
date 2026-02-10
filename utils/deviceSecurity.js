/**
 * Device Security Utility
 * 
 * Detects potentially compromised devices (jailbroken iOS / rooted Android)
 * and other security-relevant device information.
 */

import * as Device from 'expo-device';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

// Common jailbreak/root indicators
const JAILBREAK_PATHS_IOS = [
    '/Applications/Cydia.app',
    '/Library/MobileSubstrate/MobileSubstrate.dylib',
    '/bin/bash',
    '/usr/sbin/sshd',
    '/etc/apt',
    '/private/var/lib/apt/',
    '/private/var/lib/cydia',
    '/private/var/stash',
];

const ROOT_PATHS_ANDROID = [
    '/system/app/Superuser.apk',
    '/system/xbin/su',
    '/system/bin/su',
    '/sbin/su',
    '/data/local/xbin/su',
    '/data/local/bin/su',
    '/data/local/su',
    '/su/bin/su',
];

/**
 * Check if any suspicious paths exist
 * @param {string[]} paths - Array of paths to check
 * @returns {Promise<boolean>} - True if any path exists
 */
const checkPaths = async (paths) => {
    for (const path of paths) {
        try {
            const info = await FileSystem.getInfoAsync(path);
            if (info.exists) {
                return true;
            }
        } catch {
            // Path doesn't exist or not accessible - good
        }
    }
    return false;
};

/**
 * Check if device might be jailbroken (iOS) or rooted (Android)
 * 
 * Note: This is heuristic-based and can be bypassed by sophisticated attackers.
 * It provides a basic security layer against casual tampering.
 * 
 * @returns {Promise<{isCompromised: boolean, reason: string | null}>}
 */
export const checkDeviceSecurity = async () => {
    const result = {
        isCompromised: false,
        reason: null,
        isEmulator: !Device.isDevice,
        deviceType: Device.deviceType,
        osName: Device.osName,
        osVersion: Device.osVersion,
        brand: Device.brand,
        modelName: Device.modelName,
    };

    // Check if running on emulator (might be acceptable for testing)
    if (!Device.isDevice) {
        result.reason = 'Running on emulator/simulator';
        // Note: We don't set isCompromised for emulators as they're used in development
    }

    // Platform-specific checks
    if (Platform.OS === 'ios') {
        const hasJailbreakPaths = await checkPaths(JAILBREAK_PATHS_IOS);
        if (hasJailbreakPaths) {
            result.isCompromised = true;
            result.reason = 'Device appears to be jailbroken';
        }
    } else if (Platform.OS === 'android') {
        const hasRootPaths = await checkPaths(ROOT_PATHS_ANDROID);
        if (hasRootPaths) {
            result.isCompromised = true;
            result.reason = 'Device appears to be rooted';
        }
    }

    return result;
};

/**
 * Get basic device info for logging/debugging
 * @returns {object} Device information
 */
export const getDeviceInfo = () => ({
    isDevice: Device.isDevice,
    brand: Device.brand,
    manufacturer: Device.manufacturer,
    modelName: Device.modelName,
    deviceYearClass: Device.deviceYearClass,
    osName: Device.osName,
    osVersion: Device.osVersion,
    platformApiLevel: Device.platformApiLevel,
    deviceType: Device.deviceType,
});

/**
 * Check if device is too old for optimal performance
 * @returns {boolean} True if device might have performance issues
 */
export const isLowEndDevice = () => {
    // Consider devices from 2017 or earlier as potentially low-end
    const yearClass = Device.deviceYearClass;
    if (yearClass && yearClass < 2018) {
        return true;
    }
    return false;
};

/**
 * Generate a stable device hash for tracking and watermarking
 * Uses device identifiers to create a unique but stable hash per device
 * @returns {Promise<string>} Device hash (hex string)
 */
export const generateDeviceHash = async () => {
    try {
        const info = getDeviceInfo();
        const deviceString = `${info.brand || 'unknown'}-${info.modelName || 'unknown'}-${info.osName || 'unknown'}-${info.osVersion || 'unknown'}-${info.deviceYearClass || 'unknown'}`;

        // Use expo-crypto to hash the device string
        const { digestStringAsync } = await import('expo-crypto');
        const hash = await digestStringAsync(
            require('expo-crypto').CryptoDigestAlgorithm.SHA256,
            deviceString
        );

        // Return first 16 characters as device hash
        return hash.substring(0, 16);
    } catch (error) {
        console.error('Failed to generate device hash:', error);
        // Fallback: use a simple hash
        const info = getDeviceInfo();
        const fallback = `${info.brand || 'u'}-${info.modelName || 'u'}-${Date.now()}`;
        return Buffer.from(fallback).toString('hex').substring(0, 16);
    }
};

export default {
    checkDeviceSecurity,
    getDeviceInfo,
    isLowEndDevice,
    generateDeviceHash,
};
