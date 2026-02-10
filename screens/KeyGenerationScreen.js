/**
 * KeyGenerationScreen
 * 
 * Dedicated screen for RSA key pair generation during signup or from Settings.
 * Shows progress and handles retries gracefully without blocking the main UI.
 * 
 * Can be used:
 * - As modal during onboarding (with userId, onComplete, onSkip props)
 * - As navigation screen from Settings (using useAuth and useNavigation)
 */

import React, { useEffect, useState, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ActivityIndicator,
    Animated,
    Pressable,
    Platform,
    InteractionManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as SecureStore from 'expo-secure-store';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import theme from '../theme';
import { generateKeyPair, exportPublicKey, exportPrivateKey } from '../utils/crypto';
import { updateProfile } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const PRIVATE_KEY_STORAGE_KEY = 'secureshare_private_key';

const KeyGenerationScreen = ({ userId: propUserId, onComplete, onSkip }) => {
    // Support both modal (prop-based) and navigation (context-based) usage
    const { user, completeKeyGeneration } = useAuth();
    const navigation = useNavigation();
    const userId = propUserId || user?.id;

    const [status, setStatus] = useState('initializing'); // initializing, generating, exporting, saving, complete, error
    const [errorMessage, setErrorMessage] = useState(null);
    const [retryCount, setRetryCount] = useState(0);
    const progressAnim = useRef(new Animated.Value(0)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;

    // Pulse animation for the shield icon
    useEffect(() => {
        const pulse = Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, {
                    toValue: 1.1,
                    duration: 1000,
                    useNativeDriver: true,
                }),
                Animated.timing(pulseAnim, {
                    toValue: 1,
                    duration: 1000,
                    useNativeDriver: true,
                }),
            ])
        );
        pulse.start();
        return () => pulse.stop();
    }, []);

    // Progress animation
    const animateProgress = (toValue, duration = 500) => {
        Animated.timing(progressAnim, {
            toValue,
            duration,
            useNativeDriver: false,
        }).start();
    };

    // Main key generation flow
    const generateKeys = async () => {
        try {
            setStatus('initializing');
            setErrorMessage(null);
            animateProgress(0.1);

            // Wait for any pending interactions to complete
            await new Promise(resolve => InteractionManager.runAfterInteractions(resolve));

            // Small delay to ensure UI is rendered
            await new Promise(resolve => setTimeout(resolve, 100));

            // Step 1: Generate RSA Key Pair
            setStatus('generating');
            animateProgress(0.3);
            console.log('[KeyGen] Starting RSA-2048 key generation...');

            const keys = await generateKeyPair();
            console.log('[KeyGen] Keys generated successfully');
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

            // Step 2: Export keys
            setStatus('exporting');
            animateProgress(0.6);

            const pubPem = await exportPublicKey(keys.publicKey);
            const privPem = await exportPrivateKey(keys.privateKey);
            console.log('[KeyGen] Keys exported');

            // Step 3: Store private key securely (chunked for SecureStore limits)
            setStatus('saving');
            animateProgress(0.8);

            const mid = Math.floor(privPem.length / 2);
            const chunk0 = privPem.slice(0, mid);
            const chunk1 = privPem.slice(mid);

            await SecureStore.setItemAsync(`${PRIVATE_KEY_STORAGE_KEY}_0`, chunk0);
            await SecureStore.setItemAsync(`${PRIVATE_KEY_STORAGE_KEY}_1`, chunk1);
            console.log('[KeyGen] Private key stored securely');

            // Step 4: Publish public key to profile
            const { error: updateError } = await updateProfile(userId, { public_key: pubPem });
            if (updateError) {
                throw new Error(`Failed to save public key: ${updateError.message}`);
            }
            console.log('[KeyGen] Public key published to profile');

            // Complete!
            animateProgress(1);
            setStatus('complete');
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

            // Wait a moment to show completion, then proceed
            setTimeout(() => {
                if (onComplete) {
                    onComplete();
                } else {
                    // Called from Settings - update auth context and navigate back
                    completeKeyGeneration?.();
                    navigation.goBack();
                }
            }, 1500);

        } catch (error) {
            console.error('[KeyGen] Error:', error);
            setStatus('error');
            setErrorMessage(error.message || 'Key generation failed');
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
    };

    // Start generation on mount
    useEffect(() => {
        generateKeys();
    }, [retryCount]);

    const handleRetry = () => {
        setRetryCount(prev => prev + 1);
    };

    const handleSkip = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        if (onSkip) {
            onSkip();
        } else {
            // Called from Settings - just navigate back
            navigation.goBack();
        }
    };

    const getStatusText = () => {
        switch (status) {
            case 'initializing':
                return 'Preparing secure environment...';
            case 'generating':
                return 'Generating encryption keys...\nThis may take a few seconds';
            case 'exporting':
                return 'Securing your keys...';
            case 'saving':
                return 'Finalizing setup...';
            case 'complete':
                return 'Security setup complete!';
            case 'error':
                return 'Something went wrong';
            default:
                return 'Please wait...';
        }
    };

    const progressWidth = progressAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0%', '100%'],
    });

    return (
        <View style={styles.container}>
            <LinearGradient
                colors={[theme.colors.bg.primary, '#0a1628']}
                style={StyleSheet.absoluteFill}
            />

            {/* Animated Shield Icon */}
            <Animated.View
                style={[
                    styles.iconContainer,
                    { transform: [{ scale: pulseAnim }] },
                ]}
            >
                <View style={styles.iconBg}>
                    <Ionicons
                        name={status === 'complete' ? 'shield-checkmark' : 'shield-half'}
                        size={60}
                        color={status === 'complete' ? theme.colors.status.success : theme.colors.accent.blue}
                    />
                </View>
            </Animated.View>

            {/* Title */}
            <Text style={styles.title}>
                {status === 'complete' ? 'All Set!' : 'Setting Up Security'}
            </Text>

            {/* Status Text */}
            <Text style={styles.statusText}>{getStatusText()}</Text>

            {/* Progress Bar */}
            {status !== 'error' && status !== 'complete' && (
                <View style={styles.progressContainer}>
                    <View style={styles.progressBg}>
                        <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
                    </View>
                </View>
            )}

            {/* Loading Indicator */}
            {status !== 'error' && status !== 'complete' && (
                <ActivityIndicator
                    size="small"
                    color={theme.colors.accent.blue}
                    style={styles.loader}
                />
            )}

            {/* Success Checkmark */}
            {status === 'complete' && (
                <View style={styles.successIcon}>
                    <Ionicons name="checkmark-circle" size={48} color={theme.colors.status.success} />
                </View>
            )}

            {/* Error State */}
            {status === 'error' && (
                <View style={styles.errorContainer}>
                    <Text style={styles.errorText}>{errorMessage}</Text>
                    <View style={styles.buttonRow}>
                        <Pressable style={styles.retryButton} onPress={handleRetry}>
                            <Ionicons name="refresh" size={18} color="white" />
                            <Text style={styles.retryText}>Try Again</Text>
                        </Pressable>
                        <Pressable style={styles.skipButton} onPress={handleSkip}>
                            <Text style={styles.skipText}>Skip for Now</Text>
                        </Pressable>
                    </View>
                    <Text style={styles.skipNote}>
                        You can generate keys later from Settings
                    </Text>
                </View>
            )}

            {/* Security Note */}
            <View style={styles.noteContainer}>
                <Ionicons name="information-circle-outline" size={16} color={theme.colors.text.muted} />
                <Text style={styles.noteText}>
                    Your encryption keys are generated locally and never leave your device.
                </Text>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    iconContainer: {
        marginBottom: 32,
    },
    iconBg: {
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: 'rgba(61, 122, 255, 0.1)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: 'rgba(61, 122, 255, 0.3)',
    },
    title: {
        fontSize: 24,
        fontWeight: '700',
        color: 'white',
        marginBottom: 12,
        textAlign: 'center',
    },
    statusText: {
        fontSize: 15,
        color: theme.colors.text.secondary,
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 32,
    },
    progressContainer: {
        width: '80%',
        marginBottom: 24,
    },
    progressBg: {
        height: 6,
        borderRadius: 3,
        backgroundColor: 'rgba(255,255,255,0.1)',
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        borderRadius: 3,
        backgroundColor: theme.colors.accent.blue,
    },
    loader: {
        marginTop: 16,
    },
    successIcon: {
        marginTop: 16,
    },
    errorContainer: {
        alignItems: 'center',
        marginTop: 16,
    },
    errorText: {
        color: theme.colors.status.error,
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 20,
        paddingHorizontal: 20,
    },
    buttonRow: {
        flexDirection: 'row',
        gap: 12,
    },
    retryButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: theme.colors.accent.blue,
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 12,
    },
    retryText: {
        color: 'white',
        fontWeight: '600',
        fontSize: 15,
    },
    skipButton: {
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.colors.border.light,
    },
    skipText: {
        color: theme.colors.text.secondary,
        fontWeight: '500',
        fontSize: 15,
    },
    skipNote: {
        color: theme.colors.text.muted,
        fontSize: 12,
        marginTop: 16,
    },
    noteContainer: {
        position: 'absolute',
        bottom: 48,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 24,
    },
    noteText: {
        color: theme.colors.text.muted,
        fontSize: 12,
        flex: 1,
    },
});

export default KeyGenerationScreen;
