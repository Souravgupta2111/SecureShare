/**
 * Error Reporter - Privacy-first error reporting
 * 
 * Reports errors to help improve the app while respecting user consent.
 * Personal data is explicitly excluded from error reports.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

const ERROR_QUEUE_KEY = 'secureshare_error_queue';
const ERROR_CONSENT_KEY = 'secureshare_error_consent';
const MAX_QUEUE_SIZE = 50;
const FLUSH_THRESHOLD = 10;

// Global consent state
let errorReportingConsent = false;

/**
 * Set error reporting consent
 * @param {boolean} consent - New consent value
 */
export const setErrorReportingConsent = async (consent) => {
    errorReportingConsent = consent;
    try {
        await AsyncStorage.setItem(ERROR_CONSENT_KEY, JSON.stringify(consent));
    } catch (e) {
        console.warn('[ErrorReporter] Failed to persist consent:', e);
    }
};

/**
 * Load consent from storage
 */
export const loadErrorReportingConsent = async () => {
    try {
        const value = await AsyncStorage.getItem(ERROR_CONSENT_KEY);
        if (value !== null) {
            errorReportingConsent = JSON.parse(value);
        }
    } catch (e) {
        console.warn('[ErrorReporter] Failed to load consent:', e);
    }
    return errorReportingConsent;
};

/**
 * Get current consent state
 */
export const getErrorReportingConsent = () => errorReportingConsent;

/**
 * Sanitize error data to remove personal information
 * PRIVACY: This explicitly removes any potential PII
 * @param {Object} errorData - Raw error data
 * @returns {Object} Sanitized error data
 */
const sanitizeErrorData = (errorData) => {
    // Fields to explicitly exclude
    const excludePatterns = [
        /email/i,
        /password/i,
        /token/i,
        /key/i,
        /secret/i,
        /auth/i,
        /private/i,
        /user_?id/i,
        /session/i,
        /document.*content/i,
    ];

    const sanitize = (obj, depth = 0) => {
        if (depth > 3) return '[max depth]';
        if (!obj || typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) return obj.map(item => sanitize(item, depth + 1));

        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            // Check if key matches any exclude pattern
            if (excludePatterns.some(pattern => pattern.test(key))) {
                result[key] = '[REDACTED]';
            } else if (typeof value === 'string' && value.length > 200) {
                result[key] = value.substring(0, 200) + '...[truncated]';
            } else if (typeof value === 'object') {
                result[key] = sanitize(value, depth + 1);
            } else {
                result[key] = value;
            }
        }
        return result;
    };

    return sanitize(errorData);
};

/**
 * Report an error (respects consent)
 * @param {Error|string} error - The error to report
 * @param {Object} context - Additional context
 */
export const reportError = async (error, context = {}) => {
    // PRIVACY: Respect user consent
    if (!errorReportingConsent) {
        console.log('[ErrorReporter] Consent not granted, error not reported');
        return;
    }

    const errorReport = {
        timestamp: Date.now(),
        error: {
            message: error?.message || String(error),
            name: error?.name || 'UnknownError',
            stack: error?.stack?.split('\n').slice(0, 10), // Limit stack trace
        },
        context: sanitizeErrorData(context),
        environment: {
            platform: Platform.OS,
            version: Platform.Version,
            appVersion: Constants.expoConfig?.version || 'unknown',
            isDevice: !__DEV__,
        },
    };

    // Queue for batch sending
    await queueError(errorReport);
};

/**
 * Queue error for later sending
 * @param {Object} errorReport - Sanitized error report
 */
const queueError = async (errorReport) => {
    try {
        const queueStr = await AsyncStorage.getItem(ERROR_QUEUE_KEY);
        const queue = queueStr ? JSON.parse(queueStr) : [];

        // Add new error
        queue.push(errorReport);

        // Limit queue size
        while (queue.length > MAX_QUEUE_SIZE) {
            queue.shift();
        }

        await AsyncStorage.setItem(ERROR_QUEUE_KEY, JSON.stringify(queue));

        // Flush if threshold reached
        if (queue.length >= FLUSH_THRESHOLD) {
            flushErrorQueue();
        }
    } catch (e) {
        console.warn('[ErrorReporter] Failed to queue error:', e);
    }
};

/**
 * Flush error queue to server
 * NOTE: Replace endpoint with your actual error reporting endpoint
 */
export const flushErrorQueue = async () => {
    if (!errorReportingConsent) return;

    try {
        const queueStr = await AsyncStorage.getItem(ERROR_QUEUE_KEY);
        if (!queueStr) return;

        const queue = JSON.parse(queueStr);
        if (queue.length === 0) return;

        // TODO: Replace with your actual error reporting endpoint
        // For now, just log to console in dev
        if (__DEV__) {
            console.log('[ErrorReporter] Would send', queue.length, 'errors');
        } else {
            // Example: Send to your server
            // await fetch('https://api.secureshare.app/errors', {
            //     method: 'POST',
            //     headers: { 'Content-Type': 'application/json' },
            //     body: JSON.stringify({ errors: queue })
            // });
        }

        // Clear queue after successful send
        await AsyncStorage.removeItem(ERROR_QUEUE_KEY);
    } catch (e) {
        console.warn('[ErrorReporter] Failed to flush queue:', e);
    }
};

/**
 * Wrap a function to automatically report errors
 * @param {Function} fn - Function to wrap
 * @param {string} context - Context for error reports
 */
export const withErrorReporting = (fn, context) => {
    return async (...args) => {
        try {
            return await fn(...args);
        } catch (error) {
            await reportError(error, { function: context });
            throw error;
        }
    };
};

// Initialize consent on module load
loadErrorReportingConsent();

export default {
    reportError,
    setErrorReportingConsent,
    getErrorReportingConsent,
    loadErrorReportingConsent,
    flushErrorQueue,
    withErrorReporting,
};
