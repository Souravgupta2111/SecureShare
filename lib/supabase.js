/**
 * Supabase Client Configuration & API
 * 
 * Central secure data access layer for SecureShare.
 * Handles Auth, Database, Storage, and Key Management.
 */

import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Supabase configuration
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Missing Supabase Configuration. Please check your .env file.');
}

// Custom storage adapter using SecureStore for native, localStorage for web
const ExpoSecureStoreAdapter = {
    getItem: async (key) => {
        if (Platform.OS === 'web') return localStorage.getItem(key);
        return await SecureStore.getItemAsync(key);
    },
    setItem: async (key, value) => {
        if (Platform.OS === 'web') {
            localStorage.setItem(key, value);
            return;
        }
        await SecureStore.setItemAsync(key, value);
    },
    removeItem: async (key) => {
        if (Platform.OS === 'web') {
            localStorage.removeItem(key);
            return;
        }
        await SecureStore.deleteItemAsync(key);
    },
};

// Create Supabase client
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        storage: ExpoSecureStoreAdapter,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
    },
});

// --- AUTHENTICATION ---

export const signUp = async (email, password, displayName) => {
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName } },
    });
    return { data, error };
};

export const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    return { data, error };
};

export const signOut = async () => {
    let result = { error: null };
    try {
        result = await supabase.auth.signOut();
    } catch (e) {
        console.warn('Backend signout failed, falling back to local wipe');
    }
    // Guarantee local session is wiped even if offline/backend fails
    await supabase.auth.signOut({ scope: 'local' });
    return result;
};

export const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
};

/**
 * Send a password-reset email. The email contains a recovery link that opens
 * the app via the `secureshare://` scheme; Supabase then fires a
 * PASSWORD_RECOVERY auth event the app can handle to set a new password.
 */
export const resetPassword = async (email) => {
    const { data, error } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        { redirectTo: 'secureshare://reset-password' }
    );
    return { data, error };
};

/** Set a new password for the currently authenticated (or recovering) user. */
export const updatePassword = async (newPassword) => {
    const { data, error } = await supabase.auth.updateUser({ password: newPassword });
    return { data, error };
};

// --- PROFILES ---

export const getProfile = async (userId) => {
    const { data, error } = await supabase
        .from('profiles')
        .select('id, email, display_name, avatar_url, public_key, created_at, updated_at')
        .eq('id', userId)
        .single();
    return { data, error };
};

export const updateProfile = async (userId, updates) => {
    const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();
    return { data, error };
};

// --- ONLINE DOCUMENTS (Zero-Trust) ---

export const uploadOnlineDocument = async (docData, fileBlob, userId) => {
    const path = `${userId}/${Date.now()}_${docData.filename}`;

    // 1. Create Document Record FIRST (Needed for Storage RLS policy)
    const { data: doc, error: docError } = await supabase
        .from('documents')
        .insert({
            ...docData,
            file_path: path,
            owner_id: userId,
            status: 'active'
        })
        .select()
        .single();

    if (docError) return { error: docError };

    // 2. Upload Blob
    const { data: uploadData, error: uploadError } = await supabase.storage
        .from('documents')
        .upload(path, fileBlob, {
            contentType: 'application/octet-stream',
            upsert: false,
        });

    if (uploadError) {
        // Cleanup: Delete the document record if upload fails
        await supabase.from('documents').delete().eq('id', doc.id);
        return { error: uploadError };
    }

    return { data: doc };
};

/**
 * Get cloud documents with pagination
 * @param {string} userId - Owner user ID
 * @param {number} page - Page number (0-indexed)
 * @param {number} pageSize - Items per page (default 20)
 */
export const getCloudDocuments = async (userId, page = 0, pageSize = 20, sortBy = 'created_at', ascending = false) => {
    const from = page * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await supabase
        .from('documents')
        .select('id, filename, file_path, mime_type, size_bytes, status, created_at, watermark_payload', { count: 'exact' })
        .eq('owner_id', userId)
        .neq('status', 'deleted')
        .order(sortBy, { ascending })
        .range(from, to);

    return { data, error, count, hasMore: count > to + 1 };
};

export const deleteCloudDocument = async (docId, path) => {
    if (path) {
        await supabase.storage.from('documents').remove([path]);
    }
    
    // Revoke all access grants so recipients lose access instantly
    await supabase.from('access_grants').update({ status: 'revoked' }).eq('document_id', docId);

    const { data, error } = await supabase
        .from('documents')
        .update({ status: 'deleted' })
        .eq('id', docId);
    return { data, error };
};

export const renameCloudDocument = async (docId, newName) => {
    const { data, error } = await supabase
        .from('documents')
        .update({ filename: newName })
        .eq('id', docId)
        .select()
        .single();
    return { data, error };
};

// --- KEY MANAGEMENT ---

// --- PROFILES & PUBLIC KEYS ---

export const getProfileByEmail = async (email) => {
    // Normalize email to lowercase for case-insensitive matching
    const normalizedEmail = email?.toLowerCase().trim();
    if (!normalizedEmail) return { data: null, error: { message: 'Invalid email' } };

    const { data, error } = await supabase
        .from('profiles')
        .select('id, email, display_name, avatar_url, public_key')
        .ilike('email', normalizedEmail)
        .maybeSingle();
    return { data, error };
};

// --- KEY MANAGEMENT ---

export const saveDocumentKey = async (docId, encryptedKey, userId = null) => {
    const { data: userData } = await supabase.auth.getUser();
    const targetUserId = userId || userData.user?.id;

    if (!targetUserId) return { error: { message: 'No target user for key storage' } };

    const { data, error } = await supabase
        .from('document_keys')
        .insert({
            document_id: docId,
            encrypted_key: encryptedKey,
            user_id: targetUserId
        })
        .select()
        .single();
    return { data, error };
};

export const getDocumentKey = async (docId) => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return { error: { message: 'Not authenticated' } };

    const { data, error } = await supabase
        .from('document_keys')
        .select('encrypted_key')
        .eq('document_id', docId)
        .eq('user_id', userData.user.id) // Fetch MY key
        .maybeSingle();
    return { data, error };
};

// --- ACCESS GRANTS (Figma-Style Sharing) ---

/**
 * Get documents shared with user (with pagination)
 * @param {string} userEmail - Recipient email
 * @param {number} page - Page number (0-indexed)
 * @param {number} pageSize - Items per page (default 20)
 */
export const getSharedWithMeCloud = async (userEmail, page = 0, pageSize = 20) => {
    const from = page * pageSize;
    const to = from + pageSize - 1;

    // Normalize email for case-insensitive matching
    const normalizedEmail = userEmail?.toLowerCase().trim();
    if (!normalizedEmail) return { data: [], error: null, count: 0, hasMore: false };

    const { data, error, count } = await supabase
        .from('access_grants')
        .select(`
            id, document_id, status, permissions, expires_at, created_at,
            document:documents (id, filename, file_path, mime_type, size_bytes, status, created_at)
        `, { count: 'exact' })
        .ilike('recipient_email', normalizedEmail)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .range(from, to);

    return { data: data || [], error, count: count || 0, hasMore: (count || 0) > to + 1 };
};

// Backward-compatible alias for SharedWithMeScreen (fixes function name mismatch)
export const getSharedWithMe = getSharedWithMeCloud;

/**
 * Get access grants for a document
 * @param {string} docId - Document ID
 */
export const getDocumentGrants = async (docId) => {
    const { data, error } = await supabase
        .from('access_grants')
        .select('id, recipient_email, status, permissions, expires_at, device_hash, created_at')
        .eq('document_id', docId)
        .order('created_at', { ascending: false });
    if (error) {
        console.error('getDocumentGrants failed:', error);
    }
    return { data: data || [], error };
};

export const grantAccess = async (documentId, recipientEmail, ownerId, deviceHash = null) => {
    const { data, error } = await supabase
        .from('access_grants')
        .insert({
            document_id: documentId,
            recipient_email: recipientEmail.toLowerCase(),
            grantor_id: ownerId,
            status: 'active',
            permissions: { view: true, download: false },
            device_hash: deviceHash || null // Optional device binding
        })
        .select('*, document:documents(filename)')
        .single();

    // If successful, trigger recipient notification
    if (!error && data) {
        try {
            // Queue notification event for potential push/email (via Edge Function)
            await logAccessEvent(data.id, 'access_granted', {
                recipient_email: recipientEmail,
                document_id: documentId,
                document_name: data.document?.filename || 'Document'
            });
        } catch (notifyError) {
            console.warn('Notification queue failed:', notifyError);
            // Don't fail the grant if notification fails
        }
    }

    return { data, error };
};

export const revokeAccess = async (grantId) => {
    const { data, error } = await supabase
        .from('access_grants')
        .update({ status: 'revoked' })
        .eq('id', grantId)
        .select()
        .single();
    return { data, error };
};

// Validate access grant using RPC (Atomic DB operation)
export const validateAccessGrant = async (grantId, documentId, deviceHash = null) => {
    try {
        const { data, error } = await supabase.rpc('validate_access_grant', {
            p_grant_id: grantId,
            p_document_id: documentId
        });

        if (error) {
            console.error('RPC Validation error:', error);
            // Fallback to client-side validation if RPC missing? 
            // Better to fail safe.
            return { valid: false, error: 'Validation service unavailable' };
        }

        return data; // returns { valid: boolean, error?: string }
    } catch (error) {
        console.error('Access validation exception:', error);
        return { valid: false, error: 'Validation failed' };
    }
};

// --- ANALYTICS ---
// Using access_logs table (from schema_online.sql) for unified logging
// This table handles both analytics and security events via event_type field
// SECURITY: User ID is automatically fetched from auth context for RLS compliance

/**
 * Get current authenticated user ID
 * @returns {Promise<string|null>} User ID or null if not authenticated
 */
export const getCurrentUserId = async () => {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        return user?.id || null;
    } catch {
        return null;
    }
};

/**
 * Log an analytics event with automatic user_id injection
 * @param {Object} event - Event data
 * @returns {Promise<{data, error}>}
 */
export const logAnalyticsEvent = async (event) => {
    // SECURITY: Automatically include user_id from auth context
    const userId = event.user_id || await getCurrentUserId();

    // COLUMN WHITELIST: analytics_events only has (user_id, event_name, document_id, meta).
    // The analytics queue attaches internal fields (queuedAt, type, _retryCount,
    // _nextRetryAt) that are NOT columns — spreading the raw event would make
    // PostgREST reject the insert with a schema error and silently drop the event.
    const { data, error } = await supabase
        .from('analytics_events')
        .insert({
            user_id: userId,
            event_name: event.event_name || event.event_type || 'view_start',
            document_id: event.document_id || null,
            meta: event.metadata || event.meta || {}
        })
        .select()
        .single();
    return { data, error };
};

/**
 * Log a security event with automatic user_id injection
 * @param {Object} event - Security event data
 * @returns {Promise<{data, error}>}
 */
export const logSecurityEvent = async (event) => {
    // SECURITY: Automatically include user_id from auth context
    const userId = event.user_id || await getCurrentUserId();

    const { data, error } = await supabase
        .from('security_events')
        .insert({
            document_id: event.document_id,
            user_id: userId,
            event_type: event.event_type || 'security_alert',
            meta: {
                ...event,
                blocked: event.blocked || false,
                platform: event.platform,
                device_hash: event.device_hash
            }
        })
        .select()
        .single();
    return { data, error };
};

// --- PUSH NOTIFICATIONS (owner alerts) ---

/**
 * Save this device's Expo push token to the current user's profile so the
 * `notify-owner` Edge Function can reach them. Idempotent — safe to call on
 * every launch. Written via the user's own "update own profile" RLS policy.
 *
 * @param {string} token - Expo push token (ExponentPushToken[...])
 * @returns {Promise<{error}>}
 */
export const savePushToken = async (token) => {
    if (!token) return { error: null };
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { error: new Error('Not authenticated') };
        const { error } = await supabase
            .from('profiles')
            .update({ push_token: token, push_token_updated_at: new Date().toISOString() })
            .eq('id', user.id);
        if (error) console.warn('[supabase] savePushToken error:', error.message);
        return { error };
    } catch (error) {
        console.warn('[supabase] savePushToken exception:', error?.message);
        return { error };
    }
};

/**
 * Ask the backend to push a real-time alert to a document's OWNER when a
 * recipient opens it or triggers a screenshot / screen-recording.
 *
 * Fire-and-forget and best-effort: the Edge Function authenticates the caller,
 * verifies they hold an active grant, skips owner-self views, and no-ops if the
 * owner has no push token. Never throws to the caller.
 *
 * @param {string} documentId
 * @param {'view_start'|'screenshot'|'screen_recording'} eventType
 */
export const notifyDocumentOwner = async (documentId, eventType) => {
    if (!documentId || !eventType) return;
    try {
        await supabase.functions.invoke('notify-owner', {
            body: { documentId, eventType },
        });
    } catch (error) {
        // Non-fatal — real-time alerts are best-effort.
        console.warn('[supabase] notifyDocumentOwner failed:', error?.message);
    }
};

// --- ACCOUNT MANAGEMENT ---

/**
 * Permanently delete the current user's account and all associated data.
 * Required by App Store Guideline 5.1.1(v). Invokes the `delete-account`
 * Edge Function, which authenticates the caller and uses the service role to
 * remove Storage objects, recipient grants, and the auth user (DB rows cascade).
 *
 * @returns {Promise<{data, error}>}
 */
export const deleteAccount = async () => {
    const { data, error } = await supabase.functions.invoke('delete-account', {
        method: 'POST',
    });
    // functions.invoke surfaces non-2xx responses as an error; normalize the shape.
    if (error) return { data: null, error };
    if (data && data.success === false) {
        return { data: null, error: new Error(data.message || data.error || 'Account deletion failed') };
    }
    return { data, error: null };
};

/** Count the user's non-deleted documents (for the Free 5-document limit). */
export const getMyDocumentCount = async (userId) => {
    if (!userId) return { count: 0, error: null };
    const { count, error } = await supabase
        .from('documents')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', userId)
        .neq('status', 'deleted');
    return { count: count || 0, error };
};

/**
 * Permanently delete ALL documents owned by the user (and their Storage files).
 * DB rows for keys/grants/watermarks/analytics cascade via foreign keys.
 * Used by "Clear All Data" in Settings.
 */
export const deleteAllMyDocuments = async (userId) => {
    if (!userId) return { error: new Error('Not authenticated') };
    // Remove Storage objects first (FKs don't cascade Storage).
    const { data: docs } = await supabase
        .from('documents')
        .select('file_path')
        .eq('owner_id', userId);
    const paths = (docs || []).map((d) => d.file_path).filter(Boolean);
    if (paths.length > 0) {
        try { await supabase.storage.from('documents').remove(paths); } catch (_e) { /* non-fatal */ }
    }
    const { error } = await supabase.from('documents').delete().eq('owner_id', userId);
    return { error };
};

// --- INVITE LINKS (share to anyone, even non-users) ---

/**
 * Create a shareable invite for a document. Stores only the wrapped document key
 * (encrypted under an invite secret that never leaves the link). Returns { token }.
 */
export const createInvite = async ({ document_id, wrapped_key, recipient_email = null, expires_at = null }) => {
    const userId = (await supabase.auth.getUser()).data.user?.id;
    const { data, error } = await supabase
        .from('document_invites')
        .insert({
            document_id,
            created_by: userId,
            wrapped_key,
            recipient_email: recipient_email ? recipient_email.toLowerCase() : null,
            expires_at,
        })
        .select('token')
        .single();
    return { data, error };
};

/**
 * Redeem an invite token: grants the current user access and returns the wrapped
 * key so the client can unwrap (with the link secret) and re-wrap with its own key.
 * @returns {Promise<{data: {doc_id, wkey}|null, error}>}
 */
export const redeemInvite = async (token) => {
    const { data, error } = await supabase.rpc('redeem_invite', { p_token: token });
    const row = Array.isArray(data) ? data[0] || null : data;
    return { data: row, error };
};

// --- UGC SAFETY: REPORTING & BLOCKING (App Store Guideline 1.2) ---

/**
 * File a content/abuse report. Stored server-side for review.
 * @param {Object} p
 * @param {string|null} p.documentId - Related document (optional)
 * @param {string|null} p.reportedEmail - Sender/owner being reported (optional)
 * @param {string} p.reason - Short reason code/label
 * @param {string|null} p.details - Free-text details (optional)
 */
export const reportContent = async ({ documentId = null, reportedEmail = null, reason, details = null }) => {
    const userId = await getCurrentUserId();
    if (!userId) return { data: null, error: new Error('Not authenticated') };
    const { data, error } = await supabase
        .from('content_reports')
        .insert({
            reporter_id: userId,
            document_id: documentId,
            reported_email: reportedEmail ? reportedEmail.toLowerCase() : null,
            reason,
            details,
        })
        .select()
        .single();
    return { data, error };
};

/** Block a sender by email so their future shares are hidden. */
export const blockSender = async (email) => {
    const userId = await getCurrentUserId();
    if (!userId) return { data: null, error: new Error('Not authenticated') };
    const { data, error } = await supabase
        .from('blocked_senders')
        .upsert(
            { blocker_id: userId, blocked_email: email.toLowerCase() },
            { onConflict: 'blocker_id,blocked_email' }
        )
        .select()
        .single();
    return { data, error };
};

/** Remove a sender from the block list. */
export const unblockSender = async (email) => {
    const userId = await getCurrentUserId();
    if (!userId) return { error: new Error('Not authenticated') };
    const { error } = await supabase
        .from('blocked_senders')
        .delete()
        .eq('blocker_id', userId)
        .eq('blocked_email', email.toLowerCase());
    return { error };
};

/** List emails the current user has blocked. */
export const getBlockedSenders = async () => {
    const userId = await getCurrentUserId();
    if (!userId) return { data: [], error: new Error('Not authenticated') };
    const { data, error } = await supabase
        .from('blocked_senders')
        .select('blocked_email')
        .eq('blocker_id', userId);
    return { data: (data || []).map((r) => r.blocked_email), error };
};

// --- STORAGE DOWNLOAD ---

export const downloadSecureBlob = async (path) => {
    const { data, error } = await supabase.storage
        .from('documents')
        .download(path);
    return { data, error };
};

// --- LEGACY / LOCAL METHODS (Backward Compat) ---
// Re-export old name for compatibility until replaced
export const getMyDocuments = getCloudDocuments;

// --- REAL-TIME SUBSCRIPTIONS ---

/**
 * Subscribe to new access grants for a user (recipient)
 * Triggers callback when a new document is shared with the user
 * 
 * @param {string} userEmail - User's email to watch for new grants
 * @param {function} onNewGrant - Callback with new grant data
 * @returns {object} Subscription channel (call .unsubscribe() to stop)
 */
export const subscribeToSharedWithMe = (userEmail, onNewGrant) => {
    const channel = supabase
        .channel('shared_with_me')
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'access_grants',
                filter: `recipient_email=eq.${userEmail}`
            },
            (payload) => {
                console.log('[Realtime] New document shared:', payload.new);
                onNewGrant(payload.new);
            }
        )
        .subscribe();

    return channel;
};

/**
 * Subscribe to access grant revocations for a user
 * Triggers callback when access is revoked
 * 
 * @param {string} userEmail - User's email to watch
 * @param {function} onRevoked - Callback when grant is revoked
 * @returns {object} Subscription channel
 */
export const subscribeToRevocations = (userEmail, onRevoked) => {
    const channel = supabase
        .channel('access_revocations')
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'access_grants',
                filter: `recipient_email=eq.${userEmail}`
            },
            (payload) => {
                if (payload.new.status === 'revoked' && payload.old.status !== 'revoked') {
                    console.log('[Realtime] Access revoked:', payload.new);
                    onRevoked(payload.new);
                }
            }
        )
        .subscribe();

    return channel;
};

/**
 * Log an access-related event for notifications/analytics
 */
export const logAccessEvent = async (grantId, eventType, metadata = {}) => {
    const { data, error } = await supabase
        .from('access_logs')
        .insert({
            access_token_id: grantId,
            event_type: eventType,
            meta: metadata
        })
        .select()
        .single();
    return { data, error };
};

// --- DOCUMENT ANALYTICS ---

/**
 * Start a document view session
 * @param {Object} sessionData - Session data
 * @returns {Promise<{data, error}>}
 */
export const startViewSession = async (sessionData) => {
    // Normalize platform to the values allowed by the document_analytics CHECK constraint.
    const allowedPlatforms = ['ios', 'android', 'web'];
    const platform = allowedPlatforms.includes(sessionData.platform) ? sessionData.platform : 'unknown';

    const { data, error } = await supabase
        .from('document_analytics')
        .insert({
            document_id: sessionData.documentId,
            viewer_email: (sessionData.viewerEmail || '').toLowerCase(),
            session_id: sessionData.sessionId,
            device_hash: sessionData.deviceHash,
            platform,
            app_version: sessionData.appVersion,
            // NOTE: schema column is `access_grant_id` (previously mismatched as access_token_id).
            access_grant_id: sessionData.accessGrantId || sessionData.accessTokenId || null,
            total_pages: sessionData.totalPages || 1,
            view_start: new Date().toISOString(),
        })
        .select()
        .single();
    if (error) console.warn('[supabase] startViewSession error:', error.message);
    return { data, error };
};

/**
 * End a document view session
 * @param {string} sessionId - Session ID
 * @param {Object} endData - End session data
 * @returns {Promise<{data, error}>}
 */
export const endViewSession = async (sessionId, endData = {}) => {
    const { data, error } = await supabase
        .from('document_analytics')
        .update({
            view_end: new Date().toISOString(),
            duration_seconds: endData.duration || 0,
            pages_viewed: endData.pagesViewed || 1,
            scroll_depth_percent: endData.scrollDepth || 0,
            screenshot_attempts: endData.screenshotAttempts || 0,
            recording_detected: endData.recordingDetected || false,
        })
        .eq('session_id', sessionId)
        .is('view_end', null) // Only end active sessions
        .select()
        .single();
    return { data, error };
};

/**
 * Update view session duration (called periodically)
 * @param {string} sessionId - Session ID
 * @param {number} durationSeconds - Current duration
 * @returns {Promise<{error}>}
 */
export const updateViewDuration = async (sessionId, durationSeconds) => {
    const { error } = await supabase
        .from('document_analytics')
        .update({
            duration_seconds: durationSeconds,
            updated_at: new Date().toISOString()
        })
        .eq('session_id', sessionId);
    return { error };
};

/**
 * Get document analytics summary for owner
 * @param {string} documentId - Document ID
 * @returns {Promise<{data, error}>}
 */
/**
 * Get document analytics summary using Database View
 * @param {string} documentId - Document ID
 * @returns {Promise<{data, error}>}
 */
export const getDocumentAnalytics = async (documentId) => {
    // 1. Get Aggregated Stats (Fast)
    const { data: stats, error: statsError } = await supabase
        .from('document_analytics_summary')
        .select('*')
        .eq('document_id', documentId)
        .single();

    if (statsError) return { data: null, error: statsError };

    // 2. Get Recent Sessions (Limit 20)
    const { data: recent, error: listError } = await supabase
        .from('document_analytics')
        .select('session_id, viewer_email, duration_seconds, screenshot_attempts, created_at, platform')
        .eq('document_id', documentId)
        .order('created_at', { ascending: false })
        .limit(20);

    return {
        data: {
            summary: {
                totalViews: stats.total_views || 0,
                uniqueViewers: stats.unique_viewers || 0,
                totalDuration: stats.total_duration_seconds || 0,
                avgDuration: stats.avg_duration_seconds || 0,
                screenshotAttempts: stats.total_screenshots || 0,
            },
            viewers: [], // Deprecated in favor of pre-calc, or fetch on demand
            recentSessions: recent || [],
        },
        error: listError,

    };
};

/**
 * Get security events for a document
 * @param {string} documentId - Document ID
 * @returns {Promise<{data, error}>}
 */
export const getSecurityEvents = async (documentId) => {
    const { data, error } = await supabase
        .from('security_events')
        .select('*')
        .eq('document_id', documentId)
        .order('created_at', { ascending: false })
        .limit(50);
    return { data: data || [], error };
};

/**
 * Revoke an access token
 * @param {string} tokenId - Access grant ID
 * @returns {Promise<{data, error}>}
 */
export const revokeAccessToken = async (tokenId) => {
    const { data, error } = await supabase
        .from('access_grants')
        .update({ status: 'revoked' })
        .eq('id', tokenId)
        .select()
        .single();
    return { data, error };
};

/**
 * Store watermark hash when granting access
 * Creates immutable forensic proof for leak verification
 *
 * @param {Object} params
 * @param {string} params.document_id - Document ID
 * @param {string} params.recipient_email - Recipient email
 * @param {string} params.watermark_hash - SHA-256 hash of watermark payload
 * @param {string} params.hmac_signature - HMAC signature
 * @param {string} params.device_hash - Expected device hash (optional)
 * @returns {Promise<{data, error}>}
 */
export const storeWatermarkHash = async ({ document_id, recipient_email, watermark_hash, hmac_signature, device_hash }) => {
    try {
        const { data, error } = await supabase
            .rpc('store_watermark_hash', {
                p_document_id: document_id,
                p_recipient_email: recipient_email.toLowerCase(),
                p_grantor_id: (await supabase.auth.getUser()).data.user?.id,
                p_watermark_hash: watermark_hash,
                p_hmac_signature: hmac_signature,
                p_device_hash: device_hash
            });

        if (error) {
            console.error('[supabase] storeWatermarkHash error:', error);
            return { data: null, error };
        }

        return { data, error: null };
    } catch (error) {
        console.error('[supabase] storeWatermarkHash exception:', error);
        return { data: null, error };
    }
};

/**
 * Get stored watermark hash for verification
 *
 * @param {string} document_id - Document ID
 * @param {string} recipient_email - Recipient email
 * @returns {Promise<{data, error}>}
 */
export const getWatermarkHash = async (document_id, recipient_email) => {
    try {
        const { data, error } = await supabase
            .rpc('get_watermark_hash', {
                p_document_id: document_id,
                p_recipient_email: recipient_email.toLowerCase()
            });

        if (error) {
            console.error('[supabase] getWatermarkHash error:', error);
            return { data: null, error };
        }

        // RPC returning TABLE gives an array; extract first row
        const row = Array.isArray(data) ? data[0] || null : data;
        return { data: row, error: null };
    } catch (error) {
        console.error('[supabase] getWatermarkHash exception:', error);
        return { data: null, error };
    }
};

/**
 * Deterministic server-side provenance confirmation (no Edge Function needed).
 *
 * Confirms that the SHA-256 hash of a recovered full watermark payload exists
 * in the immutable watermark registry, and returns who it was issued to. Use
 * this whenever a complete signed payload can be recovered from a leaked file
 * (documents always; legacy images). Only the owner or named recipient is
 * authorized (enforced in the RPC).
 *
 * @param {string} documentId - Document UUID (from payload part[0])
 * @param {string} watermarkHash - SHA-256 hex hash of the full signed payload
 * @returns {Promise<Object>} { valid, recipient_email, grantor_email, issued_at, ... }
 */
export const verifyWatermarkPayload = async (documentId, watermarkHash) => {
    try {
        const { data, error } = await supabase.rpc('verify_watermark_payload', {
            p_document_id: documentId,
            p_watermark_hash: watermarkHash,
        });
        if (error) {
            console.warn('[supabase] verifyWatermarkPayload error:', error.message);
            return { valid: false, error: error.message };
        }
        return data; // { valid, recipient_email, grantor_email, issued_at, ... }
    } catch (error) {
        console.warn('[supabase] verifyWatermarkPayload exception:', error.message);
        return { valid: false, error: error.message };
    }
};

/**
 * Verify watermark via Edge Function
 * Server-side forensic verification
 *
 * @param {string} document_id - Document ID
 * @param {string} watermark_payload - Full watermark payload
 * @returns {Promise<{data, error}>}
 */
export const verifyWatermarkServer = async (document_id, watermark_payload) => {
    try {
        // Call Edge Function
        const { data, error } = await supabase
            .functions.invoke('verify-watermark', {
                body: {
                    document_id,
                    watermark_payload
                }
            });

        if (error) {
            console.error('[supabase] verifyWatermarkServer error:', error);
            return { data: null, error };
        }

        return { data, error: null };
    } catch (error) {
        console.error('[supabase] verifyWatermarkServer exception:', error);
        return { data: null, error };
    }
};

/**
 * Get document analytics for owner
 * Returns pre-aggregated stats
 *
 * @param {string} documentId - Document ID
 * @returns {Promise<{data, error}>}
 */
export const getDocumentAnalyticsSummary = async (documentId) => {
    try {
        const { data, error } = await supabase
            .from('document_analytics')
            .select(`
                id,
                viewer_email,
                session_id,
                device_hash,
                platform,
                view_start,
                view_end,
                duration_seconds,
                screenshot_attempts,
                recording_detected
            `)
            .eq('document_id', documentId)
            .order('view_start', { ascending: false });

        if (error) {
            console.error('[supabase] getDocumentAnalyticsSummary error:', error);
            return { data: null, error };
        }

        // Aggregate stats
        const stats = {
            totalViews: data?.length || 0,
            uniqueViewers: [...new Set(data?.map(d => d.viewer_email))].length,
            totalScreenshots: data?.reduce((sum, d) => sum + (d.screenshot_attempts || 0), 0) || 0,
            totalDuration: data?.reduce((sum, d) => sum + (d.duration_seconds || 0), 0) || 0,
            lastViewed: data?.[0]?.view_start || null,
            sessions: data || []
        };

        return { data: stats, error: null };
    } catch (error) {
        console.error('[supabase] getDocumentAnalyticsSummary exception:', error);
        return { data: null, error };
    }
};


/**
 * Log screenshot attempt during a session
 * @param {string} sessionId - Session ID
 * @returns {Promise<{error}>}
 */
export const logScreenshotAttempt = async (sessionId) => {
    const { error } = await supabase.rpc('increment_screenshot_count', {
        p_session_id: sessionId
    });

    // Fallback if RPC not available
    if (error?.code === 'PGRST201') {
        const { data } = await supabase
            .from('document_analytics')
            .select('screenshot_attempts')
            .eq('session_id', sessionId)
            .single();

        if (data) {
            await supabase
                .from('document_analytics')
                .update({ screenshot_attempts: (data.screenshot_attempts || 0) + 1 })
                .eq('session_id', sessionId);
        }
    }

    return { error };
};

/**
 * Get per-recipient analytics for a document
 * @param {string} documentId - Document ID
 * @param {string} recipientEmail - Recipient email
 * @returns {Promise<{data, error}>}
 */
export const getRecipientAnalytics = async (documentId, recipientEmail) => {
    const { data: stats, error: statsError } = await supabase
        .from('document_analytics')
        .select(`
            viewer_email,
            duration_seconds,
            screenshot_attempts,
            recording_detected,
            created_at,
            view_start,
            view_end,
            pages_viewed
        `)
        .eq('document_id', documentId)
        .eq('viewer_email', recipientEmail)
        .order('created_at', { ascending: false });

    if (statsError) return { data: null, error: statsError };

    if (!stats || stats.length === 0) {
        return { data: null, error: null };
    }

    const firstView = stats[stats.length - 1]?.view_start;
    const lastView = stats[0]?.view_end || stats[0]?.created_at;
    const totalDuration = stats.reduce((sum, s) => sum + (s.duration_seconds || 0), 0);
    const totalScreenshots = stats.reduce((sum, s) => sum + (s.screenshot_attempts || 0), 0);
    const hasRecording = stats.some(s => s.recording_detected);

    return {
        data: {
            email: recipientEmail,
            opens: stats.length,
            firstOpened: firstView,
            lastOpened: lastView,
            totalViewTimeSeconds: totalDuration,
            screenshotAttempts: totalScreenshots,
            recordingDetected: hasRecording,
        },
        error: null
    };
};
