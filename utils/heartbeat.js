/**
 * SecureShare Heartbeat Utility - Enhanced Version
 * 
 * Improvements:
 * - Tracks view time per-recipient (not just first)
 * - Accepts recipientEmail parameter
 * - Integrates with document_analytics backend
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as storage from './storage';
import { startViewSession, endViewSession, updateViewDuration } from '../lib/supabase';
import { generateDeviceHash } from './deviceSecurity';

let activeSession = null;  // holds { uuid, recipientEmail, interval, seconds, sessionId, analyticsId }

/**
 * Starts tracking view time for a document and recipient
 * @param {string} documentUUID - Document UUID
 * @param {string} recipientEmail - Email of the recipient viewing (optional, defaults to first)
 * @param {Object} options - Additional options
 */
export const startTracking = async (documentUUID, recipientEmail = null, options = {}) => {
    if (activeSession) {
        await stopTracking(); // ensure clean switch
    }

    // Generate unique session ID
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    activeSession = {
        uuid: documentUUID,
        recipientEmail,
        sessionId,
        interval: null,
        durationInterval: null,
        seconds: 0,
        screenshotAttempts: 0,
        recordingDetected: false,
        accessTokenId: options.accessTokenId || null,
        isOnline: !!options.accessTokenId,
    };

    // 1. Start document_analytics session for ONLINE documents
    if (activeSession.isOnline && recipientEmail) {
        try {
            const deviceHash = await generateDeviceHash();
            const { data, error } = await startViewSession({
                documentId: documentUUID,
                viewerEmail: recipientEmail,
                sessionId,
                deviceHash,
                platform: Platform.OS,
                appVersion: Constants.expoConfig?.version || 'unknown',
                accessTokenId: options.accessTokenId,
                totalPages: options.totalPages || 1,
            });

            if (data) {
                activeSession.analyticsId = data.id;
                console.log('[Heartbeat] Analytics session started:', sessionId);
            }
            if (error) {
                console.warn('[Heartbeat] Failed to start analytics session:', error);
            }
        } catch (e) {
            console.error('[Heartbeat] Error starting analytics session:', e);
        }
    }

    // 2. Increment open count and set openedAt for LOCAL documents
    if (!activeSession.isOnline) {
        try {
            const doc = await storage.getDocumentByUUID(documentUUID);
            if (doc && doc.recipients && doc.recipients.length > 0) {
                const recipients = [...doc.recipients];

                // Find the recipient to update
                let recipientIndex = 0; // Default to first
                if (recipientEmail) {
                    const foundIndex = recipients.findIndex(r => r.email === recipientEmail);
                    if (foundIndex !== -1) {
                        recipientIndex = foundIndex;
                    }
                }

                // Update the specific recipient
                recipients[recipientIndex].openCount = (recipients[recipientIndex].openCount || 0) + 1;
                if (!recipients[recipientIndex].openedAt) {
                    recipients[recipientIndex].openedAt = Date.now();
                }

                // Store which recipient we're tracking
                activeSession.recipientIndex = recipientIndex;

                await storage.updateDocument(documentUUID, { recipients });
            }
        } catch (e) {
            console.error('[Heartbeat] Error starting tracking updates', e);
        }
    }

    // 3. Start Interval (5 second increments)
    activeSession.interval = setInterval(() => {
        if (activeSession) {
            activeSession.seconds += 5;
        }
    }, 5000);

    // 4. Periodic duration updates to server (every 30 seconds for online)
    if (activeSession.isOnline) {
        activeSession.durationInterval = setInterval(async () => {
            if (activeSession && activeSession.analyticsId) {
                try {
                    await updateViewDuration(activeSession.sessionId, activeSession.seconds);
                } catch (e) {
                    console.warn('[Heartbeat] Duration update failed:', e);
                }
            }
        }, 30000);
    }
};

/**
 * Stops tracking and saves accumulated view time
 * @param {string} documentUUID - Optional UUID to verify we're stopping the right session
 */
export const stopTracking = async (documentUUID) => {
    // Only stop if the session matches (or force stop if no UUID provided)
    if (activeSession && (!documentUUID || activeSession.uuid === documentUUID)) {
        clearInterval(activeSession.interval);
        if (activeSession.durationInterval) {
            clearInterval(activeSession.durationInterval);
        }

        const secondsToAdd = activeSession.seconds;
        const currentUUID = activeSession.uuid;
        const recipientIndex = activeSession.recipientIndex ?? 0;
        const sessionId = activeSession.sessionId;
        const isOnline = activeSession.isOnline;
        const screenshotAttempts = activeSession.screenshotAttempts;
        const recordingDetected = activeSession.recordingDetected;

        activeSession = null; // clear immediately

        // End analytics session for ONLINE documents
        if (isOnline && sessionId) {
            try {
                await endViewSession(sessionId, {
                    duration: secondsToAdd,
                    screenshotAttempts,
                    recordingDetected,
                });
                console.log('[Heartbeat] Analytics session ended:', sessionId);
            } catch (e) {
                console.error('[Heartbeat] Error ending analytics session:', e);
            }
        }

        // Update LOCAL documents
        if (!isOnline && secondsToAdd > 0) {
            try {
                const doc = await storage.getDocumentByUUID(currentUUID);
                if (doc && doc.recipients && doc.recipients.length > recipientIndex) {
                    const recipients = [...doc.recipients];
                    recipients[recipientIndex].totalViewTime =
                        (recipients[recipientIndex].totalViewTime || 0) + secondsToAdd;
                    await storage.updateDocument(currentUUID, { recipients });
                }
            } catch (e) {
                console.error('[Heartbeat] Error stopping tracking updates', e);
            }
        }
    }
};

/**
 * Record a screenshot attempt in the current session
 */
export const recordScreenshotAttempt = () => {
    if (activeSession) {
        activeSession.screenshotAttempts++;
    }
};

/**
 * Record that screen recording was detected
 */
export const recordRecordingDetected = () => {
    if (activeSession) {
        activeSession.recordingDetected = true;
    }
};

/**
 * Gets the current session's view time in seconds
 */
export const getCurrentViewTime = () => {
    return activeSession ? activeSession.seconds : 0;
};

/**
 * Gets current tracking session info
 */
export const getActiveSession = () => {
    return activeSession ? {
        uuid: activeSession.uuid,
        recipientEmail: activeSession.recipientEmail,
        sessionId: activeSession.sessionId,
        seconds: activeSession.seconds,
        screenshotAttempts: activeSession.screenshotAttempts,
    } : null;
};
