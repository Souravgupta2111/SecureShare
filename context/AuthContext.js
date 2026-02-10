/**
 * Authentication Context Provider
 * 
 * Manages authentication state across the app.
 * Provides user info, loading state, and auth methods.
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase, getProfile, signIn, signUp, signOut, updateProfile } from '../lib/supabase';
import * as SecureStore from 'expo-secure-store';
import { generateKeyPair, exportPublicKey, exportPrivateKey, importPrivateKey } from '../utils/crypto';

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

    // Helper: Ensure Zero-Trust Keys Exist
    const ensureKeysExist = async (userId) => {
        try {
            const storedPriv = await SecureStore.getItemAsync(PRIVATE_KEY_STORAGE_KEY);
            const { data: userProfile } = await getProfile(userId);

            // Idempotency: If keys exist, do nothing
            // Check chunked storage first
            const part0 = await SecureStore.getItemAsync(`${PRIVATE_KEY_STORAGE_KEY}_0`);
            const part1 = await SecureStore.getItemAsync(`${PRIVATE_KEY_STORAGE_KEY}_1`);
            const hasChunked = part0 && part1;

            if (hasChunked && userProfile?.public_key) {
                console.log('[Auth] Zero-Trust Identity verified.');
                return;
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

            // Publish Public Key to Profile
            await updateProfile(userId, { public_key: pubPem });

            // Update local profile state
            setProfile(prev => ({ ...prev, public_key: pubPem }));

            console.log('[Auth] Identity established and keys synced.');

        } catch (e) {
            console.error('[Auth] Key generation failed:', e);
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
                console.error('Auth initialization error:', error);
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
                // Check if keys exist, if not set flag to show KeyGenerationScreen
                const hasKeys = await checkKeysExist(data.user.id);
                if (!hasKeys) {
                    console.log('[Auth] New user - will show key generation screen');
                    setNeedsKeyGeneration(true);
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
            const { error } = await signOut();
            if (error) throw error;
            setUser(null);
            setSession(null);
            setProfile(null);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        } finally {
            setLoading(false);
        }
    };

    const refreshProfile = async () => {
        if (user) {
            const { data } = await getProfile(user.id);
            setProfile(data);

            // Update consent state from refreshed profile
            if (data) {
                setAnalyticsConsent(data.analytics_consent || false);
                setErrorReportingConsent(data.error_reporting_consent || false);
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
