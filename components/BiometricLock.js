/**
 * BiometricLock Component
 * 
 * Full-screen biometric authentication gate that must be passed
 * before viewing secure content. Uses FaceID, TouchID, or fingerprint.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Haptics from 'expo-haptics';
import theme from '../theme';

const BiometricLock = ({ onUnlock, documentName }) => {
    const [authenticating, setAuthenticating] = useState(false);
    const [biometricType, setBiometricType] = useState(null);
    const [error, setError] = useState(null);
    const [noBiometrics, setNoBiometrics] = useState(false);

    useEffect(() => {
        checkBiometrics();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const checkBiometrics = useCallback(async () => {
        try {
            const hasHardware = await LocalAuthentication.hasHardwareAsync();
            const isEnrolled = await LocalAuthentication.isEnrolledAsync();

            if (hasHardware && isEnrolled) {
                const types = await LocalAuthentication.supportedAuthenticationTypesAsync();

                if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
                    setBiometricType('face');
                } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
                    setBiometricType('fingerprint');
                } else {
                    setBiometricType('biometric');
                }

                setTimeout(() => {
                    if (noBiometrics) {
                        handleProceedWithoutBiometrics();
                    } else {
                        authenticate();
                    }
                }, 500);
            } else {
                setNoBiometrics(true);
                setBiometricType('none');
            }
        } catch (e) {
            console.error('Biometric check failed:', e);
            setNoBiometrics(true);
            setBiometricType('none');
        }
    }, [documentName, onUnlock, noBiometrics, handleProceedWithoutBiometrics, authenticate]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleProceedWithoutBiometrics = () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        onUnlock();
    };

    const authenticate = useCallback(async () => {
        setAuthenticating(true);
        setError(null);

        try {
            const result = await LocalAuthentication.authenticateAsync({
                promptMessage: `Authenticate to view "${documentName}"`,
                cancelLabel: 'Cancel',
                fallbackLabel: 'Use Passcode',
                disableDeviceFallback: false,
            });

            if (result.success) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                onUnlock();
            } else if (result.error === 'user_cancel') {
                setError('Authentication cancelled');
            } else {
                setError('Authentication failed');
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            }
        } catch (e) {
            console.error('Authentication error:', e);
            setError('Authentication error');
        } finally {
            setAuthenticating(false);
        }
    }, [documentName, onUnlock]);

    const getIconName = () => {
        switch (biometricType) {
            case 'face': return 'scan-outline';
            case 'fingerprint': return 'finger-print-outline';
            default: return 'lock-closed-outline';
        }
    };

    const getTitle = () => {
        switch (biometricType) {
            case 'face': return 'Face ID Required';
            case 'fingerprint': return 'Fingerprint Required';
            default: return 'Authentication Required';
        }
    };

    return (
        <View style={styles.container}>
            <LinearGradient
                colors={['rgba(61, 122, 255, 0.2)', 'rgba(0,0,0,0)']}
                style={styles.gradient}
            />

            <View style={styles.content}>
                <View style={styles.iconContainer}>
                    <LinearGradient
                        colors={['#3d7aff', '#6dd5fa']}
                        style={styles.iconGradient}
                    >
                        <Ionicons name={getIconName()} size={48} color="white" />
                    </LinearGradient>
                </View>

                <Text style={styles.title}>{getTitle()}</Text>
                <Text style={styles.subtitle}>
                    {noBiometrics
                        ? 'No biometric authentication is configured on this device.'
                        : 'Authenticate to view this secure document'
                    }
                </Text>

                {noBiometrics && (
                    <View style={styles.warningContainer}>
                        <Ionicons name="warning-outline" size={16} color={theme.colors.status.warning} />
                        <Text style={styles.warningText}>
                            Document will be accessible without biometric protection
                        </Text>
                    </View>
                )}

                {error && (
                    <View style={styles.errorContainer}>
                        <Ionicons name="alert-circle" size={16} color={theme.colors.status.danger} />
                        <Text style={styles.errorText}>{error}</Text>
                    </View>
                )}

                <Pressable
                    style={({ pressed }) => [
                        styles.button,
                        noBiometrics && styles.warningButton,
                        pressed && styles.buttonPressed
                    ]}
                    onPress={noBiometrics ? handleProceedWithoutBiometrics : authenticate}
                    disabled={authenticating}
                >
                    {authenticating ? (
                        <ActivityIndicator color="white" />
                    ) : (
                        <>
                            <Ionicons
                                name={noBiometrics ? 'lock-open-outline' : getIconName()}
                                size={20}
                                color="white"
                            />
                            <Text style={styles.buttonText}>
                                {noBiometrics
                                    ? 'Proceed Anyway'
                                    : (error ? 'Try Again' : 'Authenticate')
                                }
                            </Text>
                        </>
                    )}
                </Pressable>

                <Text style={styles.docName} numberOfLines={1}>
                    {documentName}
                </Text>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.bg.primary,
        justifyContent: 'center',
        alignItems: 'center',
    },
    gradient: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '50%',
    },
    content: {
        alignItems: 'center',
        paddingHorizontal: 40,
    },
    iconContainer: {
        marginBottom: 32,
    },
    iconGradient: {
        width: 100,
        height: 100,
        borderRadius: 50,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: theme.colors.accent.blue,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
        elevation: 10,
    },
    title: {
        color: 'white',
        fontSize: 24,
        fontWeight: '700',
        marginBottom: 8,
    },
    subtitle: {
        color: theme.colors.text.secondary,
        fontSize: 15,
        textAlign: 'center',
        marginBottom: 32,
    },
    errorContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 20,
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: 'rgba(255, 59, 48, 0.1)',
        borderRadius: 8,
    },
    errorText: {
        color: theme.colors.status.danger,
        fontSize: 14,
    },
    warningContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 20,
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: 'rgba(255, 159, 10, 0.1)',
        borderRadius: 8,
    },
    warningText: {
        color: theme.colors.status.warning,
        fontSize: 13,
        flex: 1,
    },
    button: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: theme.colors.accent.blue,
        paddingVertical: 16,
        paddingHorizontal: 32,
        borderRadius: 12,
        minWidth: 180,
        justifyContent: 'center',
    },
    warningButton: {
        backgroundColor: theme.colors.status.warning,
    },
    buttonPressed: {
        opacity: 0.8,
        transform: [{ scale: 0.98 }],
    },
    buttonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '600',
    },
    docName: {
        color: theme.colors.text.muted,
        fontSize: 13,
        marginTop: 24,
        maxWidth: 280,
        textAlign: 'center',
    },
});

export default BiometricLock;
