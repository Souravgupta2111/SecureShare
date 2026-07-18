/**
 * Authentication Context Provider
 * 
 * Manages authentication state across the app.
 * Provides user info, loading state, and auth methods.
 */

import * as SecureStore from 'expo-secure-store';
import { createContext, useContext, useEffect, useState } from 'react';
import { Alert, Linking } from 'react-native';
import { deleteAccount, getProfile, redeemInvite, resetPassword, saveDocumentKey, signIn, signOut, signUp, supabase, updatePassword, updateProfile } from '../lib/supabase';
import { setAnalyticsConsent as syncQueueAnalyticsConsent } from '../utils/analyticsQueue';
import { encryptKey, exportPrivateKey, exportPublicKey, generateKeyPair, importPrivateKey, importPublicKey, unwrapKeyWithSecret } from '../utils/crypto';

// Key for SecureStore
const PRIVATE_KEY_STORAGE_KEY = 'secureshare_private_key';

const AuthContext = createContext({});

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const [initialized, setInitialized] = useState(false);

    // Key generation state - tracks if user needs to generate keys
    const [needsKeyGeneration, setNeedsKeyGeneration] = useState(false);

    // Consent state (default OFF for privacy)
    const [analyticsConsent, setAnalyticsConsent] = useState(false);
    const [errorReportingConsent, setErrorReportingConsent] = useState(false);

    // Password-recovery state — true while the user arrived via a reset link and
    // must choose a new password before continuing.
    const [passwordRecovery, setPasswordRecovery] = useState(false);

    // Pending invite captured from a secureshare://invite deep link, redeemed
    // once the user is authenticated (they may need to sign up first).
    const [pendingInvite, setPendingInvite] = useState(null);

    // Helper: Ensure Zero-Trust Keys Exist
    const ensureKeysExist = async (userId) => {
        try {
            // Check chunked storage first
            const part0 = await SecureStore.getItemAsync(`${PRIVATE_KEY_STORAGE_KEY}_0`);
            const part1 = await SecureStore.getItemAsync(`${PRIVATE_KEY_STORAGE_KEY}_1`);
            const hasChunked = part0 && part1;

            const { data: userProfile } = await getProfile(userId);

            if (hasChunked && userProfile?.public_key) {
                // Verify chunk integrity: try to import the reconstructed PEM
                try {
                    const reconstructed = part0 + part1;
                    await importPrivateKey(reconstructed);
                    console.log('[Auth] Zero-Trust Identity verified (chunks intact).');
                    return;
                } catch (integrityError) {
                    console.error('[Auth] Private key chunks corrupted, will regenerate:', integrityError.message);
                    // Clear corrupted chunks
                    await SecureStore.deleteItemAsync(`${PRIVATE_KEY_STORAGE_KEY}_0`);
                    await SecureStore.deleteItemAsync(`${PRIVATE_KEY_STORAGE_KEY}_1`);
                }
            }

            console.log('[Auth] Zero-Trust Identity missing. Generating keys...');

            // Generate RSA-2048 Key Pair
            const keys = await generateKeyPair();
            const pubPem = await exportPublicKey(keys.publicKey);
            const privPem = await exportPrivateKey(keys.privateKey);

            // Store Private Key securely on device (CHUNKED to avoid 2048b limit)
            const mid = Math.floor(privPem.length / 2);
            const chunk0 = privPem.slice(0, mid);
            const chunk1 = privPem.slice(mid);

            await SecureStore.setItemAsync(`${PRIVATE_KEY_STORAGE_KEY}_0`, chunk0);
            await SecureStore.setItemAsync(`${PRIVATE_KEY_STORAGE_KEY}_1`, chunk1);

            // Verify what we stored can be read back and imported
            const verify0 = await SecureStore.getItemAsync(`${PRIVATE_KEY_STORAGE_KEY}_0`);
            const verify1 = await SecureStore.getItemAsync(`${PRIVATE_KEY_STORAGE_KEY}_1`);
            if (!verify0 || !verify1 || verify0 !== chunk0 || verify1 !== chunk1) {
                throw new Error('SecureStore write verification failed — stored data does not match');
            }

            // Publish Public Key to Profile
            await updateProfile(userId, { public_key: pubPem });

            // Update local profile state
            setProfile(prev => ({ ...prev, public_key: pubPem }));

            console.log('[Auth] Identity established and keys synced.');

        } catch (e) {
            console.warn('[Auth] Key generation failed:', e);
            // Non-blocking, but secure features will be limited
        }
    };

    // Check if keys exist (without generating)
    const checkKeysExist = async (userId) => {
        try {
            const part0 = await SecureStore.getItemAsync(`${PRIVATE_KEY_STORAGE_KEY}_0`);
            const part1 = await SecureStore.getItemAsync(`${PRIVATE_KEY_STORAGE_KEY}_1`);
            const hasChunked = part0 && part1;

            const { data: userProfile } = await getProfile(userId);

            return hasChunked && userProfile?.public_key;
        } catch {
            return false;
        }
    };

    // Called when KeyGenerationScreen completes
    const completeKeyGeneration = async () => {
        setNeedsKeyGeneration(false);
        // Refresh profile to get the new public key
        if (user) {
            const { data } = await getProfile(user.id);
            setProfile(data);
        }
    };

    // Called if user skips key generation
    const skipKeyGeneration = () => {
        setNeedsKeyGeneration(false);
    };

    // Initialize auth state
    useEffect(() => {
        const initializeAuth = async () => {
            try {
                // Get initial session
                const { data: { session: initialSession } } = await supabase.auth.getSession();
                setSession(initialSession);
                setUser(initialSession?.user ?? null);

                if (initialSession?.user) {
                    const { data: profileData } = await getProfile(initialSession.user.id);
                    if (profileData) {
                        setProfile(profileData);

                        // Load consent preferences from profile
                        setAnalyticsConsent(profileData.analytics_consent || false);
                        setErrorReportingConsent(profileData.error_reporting_consent || false);
                        // Keep the analytics queue's consent flag in sync with the profile,
                        // otherwise queued analytics events are silently dropped.
                        syncQueueAnalyticsConsent(profileData.analytics_consent || false);
                    } else {
                        // Profile missing? Create or fetch failed.
                    }


                    // ZERO-TRUST: Check for Private Key (Chunked Read)
                    const part0 = await SecureStore.getItemAsync(`${PRIVATE_KEY_STORAGE_KEY}_0`);
                    const part1 = await SecureStore.getItemAsync(`${PRIVATE_KEY_STORAGE_KEY}_1`);
                    const storedPrivateKey = (part0 && part1) ? (part0 + part1) : null;
                    // Fallback for legacy non-chunked key
                    const legacyKey = !storedPrivateKey ? await SecureStore.getItemAsync(PRIVATE_KEY_STORAGE_KEY) : null;
                    const finalPrivateKey = storedPrivateKey || legacyKey;

                    if (!finalPrivateKey) {
                        // NOTE: RSA key generation is CPU-intensive and can freeze the app.
                        // Key generation is deferred to first share attempt to prevent app startup hang.
                        console.log('[Auth] No private key found. Keys will be generated on first share.');
                        // DO NOT generate keys during startup - wait for first share attempt
                        // This prevents app crashes during initialization
                    } else {
                        console.log('[Auth] Zero-Trust Identity verified.');
                    }
                }
            } catch (error) {
                console.warn('Auth initialization error:', error);
            } finally {
                setLoading(false);
                setInitialized(true);
            }
        };

        initializeAuth();

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, newSession) => {
                setSession(newSession);
                setUser(newSession?.user ?? null);

                if (newSession?.user) {
                    const { data: profileData } = await getProfile(newSession.user.id);
                    setProfile(profileData);
                    // Silently ensure encryption keys exist on fresh sign-in (covers
                    // auto-confirm signup and email-confirmation deep links). Idempotent
                    // and fast (~250ms), runs in the background — no blocking screen.
                    if (event === 'SIGNED_IN') {
                        ensureKeysExist(newSession.user.id).catch(() => {});
                    }
                } else {
                    setProfile(null);
                }
            }
        );

        return () => {
            subscription?.unsubscribe();
        };
    }, []);

    // Auth methods
    const handleSignIn = async (email, password) => {
        setLoading(true);
        try {
            const { data, error } = await signIn(email, password);
            if (error) throw error;

            if (data.user) {
                await ensureKeysExist(data.user.id);
            }

            return { success: true, data };
        } catch (error) {
            return { success: false, error: error.message };
        } finally {
            setLoading(false);
        }
    };

    const handleSignUp = async (email, password, displayName) => {
        setLoading(true);
        try {
            const { data, error } = await signUp(email, password, displayName);
            if (error) throw error;

            if (data.user) {
                // Generate keys SILENTLY in the background — no blocking screen.
                // If signup returns a session (email confirmation disabled), do it now;
                // otherwise keys are generated on first sign-in via ensureKeysExist.
                if (data.session) {
                    ensureKeysExist(data.user.id).catch((e) => console.warn('[Auth] bg key gen failed:', e.message));
                }
            }

            return { success: true, data };
        } catch (error) {
            return { success: false, error: error.message };
        } finally {
            setLoading(false);
        }
    };

    const handleSignOut = async () => {
        setLoading(true);
        try {
            await signOut();
            // Clear local keys securely regardless of server response
            await SecureStore.deleteItemAsync(`${PRIVATE_KEY_STORAGE_KEY}_0`);
            await SecureStore.deleteItemAsync(`${PRIVATE_KEY_STORAGE_KEY}_1`);
            await SecureStore.deleteItemAsync(PRIVATE_KEY_STORAGE_KEY);
        } catch (error) {
            console.warn('Sign out warning:', error.message);
        } finally {
            // Unconditionally clear local session to prevent stuck states
            setUser(null);
            setSession(null);
            setProfile(null);
            setLoading(false);
            return { success: true };
        }
    };

    /**
     * Permanently delete the user's account (App Store Guideline 5.1.1(v)).
     * Calls the delete-account Edge Function, then wipes all local secrets and
     * clears the session so the app returns to the auth flow.
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    const handleDeleteAccount = async () => {
        setLoading(true);
        try {
            const { error } = await deleteAccount();
            if (error) {
                setLoading(false);
                return { success: false, error: error.message || 'Failed to delete account' };
            }

            // Wipe local private keys (chunked + legacy) so nothing survives on-device.
            await SecureStore.deleteItemAsync(`${PRIVATE_KEY_STORAGE_KEY}_0`);
            await SecureStore.deleteItemAsync(`${PRIVATE_KEY_STORAGE_KEY}_1`);
            await SecureStore.deleteItemAsync(PRIVATE_KEY_STORAGE_KEY);

            // End the server session (best-effort — the user is already deleted).
            try { await signOut(); } catch (_e) { /* already gone */ }

            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        } finally {
            // Always clear local session state so the app leaves the authed area.
            setUser(null);
            setSession(null);
            setProfile(null);
            setLoading(false);
        }
    };

    /** Send a password-reset email to the given address. */
    const handleResetPassword = async (email) => {
        const { error } = await resetPassword(email);
        if (error) return { success: false, error: error.message };
        return { success: true };
    };

    // --- PASSWORD RECOVERY via deep link (secureshare://reset-password) ---

    // Extract auth params from either the query (?a=b) or fragment (#a=b) of a URL.
    // Supabase's implicit recovery link returns tokens in the fragment.
    const parseAuthParams = (url) => {
        const out = {};
        const hashIndex = url.indexOf('#');
        const qIndex = url.indexOf('?');
        const segments = [];
        if (qIndex !== -1) segments.push(url.substring(qIndex + 1, hashIndex === -1 ? undefined : hashIndex));
        if (hashIndex !== -1) segments.push(url.substring(hashIndex + 1));
        for (const seg of segments) {
            for (const kv of seg.split('&')) {
                const [k, v] = kv.split('=');
                if (k) out[decodeURIComponent(k)] = decodeURIComponent(v || '');
            }
        }
        return out;
    };

    const handleDeepLink = async (url) => {
        if (!url) return;

        // Invite link: secureshare://invite?token=..#k=..
        // Store it; it's redeemed once the user is authenticated (see effect below).
        if (url.indexOf('invite') !== -1) {
            const p = parseAuthParams(url);
            if (p.token && p.k) setPendingInvite({ token: p.token, secret: p.k });
            return;
        }

        if (url.indexOf('reset-password') === -1) return;
        try {
            const params = parseAuthParams(url);
            if (params.error || params.error_description) {
                setPasswordRecovery(false);
                Alert.alert(
                    'Link Expired',
                    params.error_description || 'This password reset link is invalid or has expired. Please request a new one.'
                );
                return;
            }
            if (params.access_token && params.refresh_token) {
                // Implicit flow: establish the recovery session from the tokens.
                const { error } = await supabase.auth.setSession({
                    access_token: params.access_token,
                    refresh_token: params.refresh_token,
                });
                if (error) throw error;
                setPasswordRecovery(true);
            } else if (params.code) {
                // PKCE flow fallback.
                const { error } = await supabase.auth.exchangeCodeForSession(params.code);
                if (error) throw error;
                setPasswordRecovery(true);
            }
        } catch (e) {
            console.warn('[Auth] Reset-link handling failed:', e.message);
            Alert.alert('Reset Failed', 'Could not open the password reset link. Please request a new one.');
        }
    };

    // Listen for the reset-password deep link (cold start + while running).
    useEffect(() => {
        Linking.getInitialURL().then((url) => { if (url) handleDeepLink(url); });
        const sub = Linking.addEventListener('url', ({ url }) => handleDeepLink(url));
        return () => sub.remove();
    }, []);

    /**
     * Complete the reset: set the new password on the (recovery-authenticated)
     * user and persist it in Supabase, then leave recovery mode.
     */
    const completePasswordReset = async (newPassword) => {
        const { error } = await updatePassword(newPassword);
        if (error) return { success: false, error: error.message };
        setPasswordRecovery(false);
        return { success: true };
    };

    /** Abort recovery (e.g. user cancels) — clear the recovery session. */
    const cancelPasswordRecovery = async () => {
        setPasswordRecovery(false);
        try { await signOut(); } catch (_e) { /* ignore */ }
        setUser(null);
        setSession(null);
        setProfile(null);
    };

    /**
     * Redeem an invite link: grant access via the server, unwrap the document key
     * using the secret from the link, re-wrap it with this user's RSA key, and
     * persist it. Afterwards the document appears in "Shared with Me".
     */
    const redeemInviteFlow = async (token, secret) => {
        try {
            const { data, error } = await redeemInvite(token);
            if (error || !data) throw error || new Error('Invite invalid');

            const docKeyHex = await unwrapKeyWithSecret(data.wkey, secret);

            const uid = (await supabase.auth.getUser()).data.user?.id;
            if (!uid) throw new Error('Not signed in');
            await ensureKeysExist(uid);

            const { data: prof } = await getProfile(uid);
            if (!prof?.public_key) throw new Error('Missing public key');

            const pub = await importPublicKey(prof.public_key);
            const encKey = await encryptKey(docKeyHex, pub);
            await saveDocumentKey(data.doc_id, encKey, uid);

            setPendingInvite(null);
            Alert.alert('Document Unlocked', 'The shared document is now in “Shared with Me”.');
        } catch (e) {
            console.warn('[Auth] Invite redeem failed:', e.message);
            setPendingInvite(null);
            Alert.alert('Could Not Open Link', 'This secure link is invalid or has expired.');
        }
    };

    // Redeem a pending invite as soon as the user is authenticated.
    useEffect(() => {
        if (user && pendingInvite) {
            redeemInviteFlow(pendingInvite.token, pendingInvite.secret);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, pendingInvite]);

    const refreshProfile = async () => {
        if (user) {
            const { data } = await getProfile(user.id);
            setProfile(data);

            // Update consent state from refreshed profile
            if (data) {
                setAnalyticsConsent(data.analytics_consent || false);
                setErrorReportingConsent(data.error_reporting_consent || false);
                syncQueueAnalyticsConsent(data.analytics_consent || false);
            }
        }
    };

    /**
     * Update consent preferences
     * @param {'analytics' | 'errorReporting'} type - Type of consent
     * @param {boolean} value - New consent value
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    const updateConsent = async (type, value) => {
        if (!user) return { success: false, error: 'Not authenticated' };

        try {
            const updates = {
                consent_updated_at: new Date().toISOString()
            };

            if (type === 'analytics') {
                updates.analytics_consent = value;
                setAnalyticsConsent(value);
                // Sync the analytics queue so the toggle takes effect immediately.
                await syncQueueAnalyticsConsent(value);
            } else if (type === 'errorReporting') {
                updates.error_reporting_consent = value;
                setErrorReportingConsent(value);
            }

            const { error } = await updateProfile(user.id, updates);

            if (error) throw error;

            console.log(`[Auth] ${type} consent updated to: ${value}`);
            return { success: true };
        } catch (error) {
            console.error('[Auth] Failed to update consent:', error);
            return { success: false, error: error.message };
        }
    };

    const value = {
        user,
        profile,
        session,
        loading,
        initialized,
        isAuthenticated: !!session,
        // Key generation state
        needsKeyGeneration,
        completeKeyGeneration,
        skipKeyGeneration,
        // Consent state
        analyticsConsent,
        errorReportingConsent,
        // Auth methods
        signIn: handleSignIn,
        signUp: handleSignUp,
        signOut: handleSignOut,
        deleteAccount: handleDeleteAccount,
        resetPassword: handleResetPassword,
        // Password recovery
        passwordRecovery,
        completePasswordReset,
        cancelPasswordRecovery,
        // Invite redemption
        pendingInvite,
        refreshProfile,
        updateConsent,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export default AuthContext;
