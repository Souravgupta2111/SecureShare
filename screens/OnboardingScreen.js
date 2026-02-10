/**
 * OnboardingScreen - First-time user introduction
 * 
 * 5-slide carousel explaining SecureShare's key features.
 * Includes interactive setup for Biometrics, Notifications, and Privacy Consent.
 */

import React, { useState, useRef, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Dimensions,
    Pressable,
    FlatList,
    Animated,
    Switch,
    Alert,
    Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import theme from '../theme';
import { useAuth } from '../context/AuthContext';
import { setAnalyticsConsent } from '../utils/analyticsQueue';

const { width } = Dimensions.get('window');

const ONBOARDING_KEY = 'secureshare_onboarding_complete';
const SETTINGS_KEY = 'secureshare_user_settings';

const SLIDES = [
    {
        id: '1',
        icon: 'shield-checkmark',
        title: 'Zero-Trust Security',
        description: 'Your files are encrypted on your device before upload. Only YOU hold the keys — not even we can read your documents.',
        color: '#3d7aff',
    },
    {
        id: '2',
        icon: 'time-outline',
        title: 'Time-Limited Access',
        description: 'Share documents that expire. Set access from 1 hour to 30 days. After expiry, files become inaccessible.',
        color: '#10B981',
    },
    {
        id: '3',
        icon: 'camera-outline',
        title: 'Screenshot Detection',
        description: 'Know instantly when someone screenshots your document. Invisible watermarks help trace the source of leaks.',
        color: '#F59E0B',
    },
    {
        id: '4',
        icon: 'lock-closed',
        title: 'Secure Your App',
        description: 'Enable Biometric Lock and Notifications to keep your data safe and stay alerted.',
        color: '#8B5CF6',
        isSecuritySlide: true,
    },
    {
        id: '5',
        icon: 'settings-outline',
        title: 'Privacy Settings',
        description: 'Choose what data you share with us. Analytics are disabled by default.',
        color: '#EC4899',
        isConsentSlide: true,
    },
];

const OnboardingScreen = ({ onComplete }) => {
    const insets = useSafeAreaInsets();
    const { updateConsent, isAuthenticated } = useAuth();
    const [currentIndex, setCurrentIndex] = useState(0);
    const flatListRef = useRef(null);
    const scrollX = useRef(new Animated.Value(0)).current;

    // Security State
    const [biometricsSupported, setBiometricsSupported] = useState(false);
    const [biometricsEnabled, setBiometricsEnabled] = useState(false);
    const [notifGranted, setNotifGranted] = useState(false);

    // Consent state (default OFF for privacy)
    const [analyticsConsentLocal, setAnalyticsConsentLocal] = useState(false);
    const [errorConsentLocal, setErrorConsentLocal] = useState(false);

    // Check Biometrics on mount
    useEffect(() => {
        (async () => {
            const compatible = await LocalAuthentication.hasHardwareAsync();
            setBiometricsSupported(compatible);
        })();
    }, []);

    const handleNext = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (currentIndex < SLIDES.length - 1) {
            flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
        } else {
            handleComplete();
        }
    };

    const handleSkip = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        handleComplete();
    };

    const handleComplete = async () => {
        try {
            await AsyncStorage.setItem(ONBOARDING_KEY, 'true');

            // Save basic settings
            const settings = {
                biometricLock: biometricsEnabled,
                securityAlerts: true,
                analyticsConsent: analyticsConsentLocal
            };
            await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));

            // Save consent preferences to profile if auth'd
            if (isAuthenticated) {
                await updateConsent('analytics', analyticsConsentLocal);
                await updateConsent('errorReporting', errorConsentLocal);
            }

            // Update analytics queue consent
            await setAnalyticsConsent(analyticsConsentLocal);

            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (e) {
            console.error('Failed to save onboarding state:', e);
        }
        onComplete?.();
    };

    const openPrivacyPolicy = () => {
        Linking.openURL('https://secureshare.app/privacy');
    };

    // --- Security Handlers ---

    const requestNotifications = async () => {
        const { status } = await Notifications.requestPermissionsAsync();
        if (status === 'granted') {
            setNotifGranted(true);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
            Alert.alert('Permission Required', 'Notifications are critical for security alerts. Please enable them in settings.');
        }
    };

    const toggleBiometrics = async (val) => {
        if (val) {
            const result = await LocalAuthentication.authenticateAsync({
                promptMessage: 'Authenticate to enable Secure Lock',
            });
            if (result.success) {
                setBiometricsEnabled(true);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
        } else {
            setBiometricsEnabled(false);
        }
    };

    const onViewableItemsChanged = useRef(({ viewableItems }) => {
        if (viewableItems.length > 0) {
            setCurrentIndex(viewableItems[0].index || 0);
        }
    }).current;

    const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

    const renderSlide = ({ item, index }) => (
        <View style={[styles.slide, { width }]}>
            <LinearGradient
                colors={[item.color + '30', 'transparent']}
                style={styles.iconGradient}
            >
                <View style={[styles.iconCircle, { backgroundColor: item.color + '20' }]}>
                    <Ionicons name={item.icon} size={64} color={item.color} />
                </View>
            </LinearGradient>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.description}>{item.description}</Text>

            {/* --- SECURITY SLIDE CONTENT --- */}
            {item.isSecuritySlide && (
                <View style={styles.consentContainer}>
                    {/* Notification Permission */}
                    <Pressable
                        style={[styles.consentRow, notifGranted && styles.rowActive]}
                        onPress={requestNotifications}
                        disabled={notifGranted}
                    >
                        <View style={styles.consentTextContainer}>
                            <Ionicons
                                name={notifGranted ? "notifications" : "notifications-outline"}
                                size={20}
                                color={notifGranted ? theme.colors.accent.primary : theme.colors.text.secondary}
                            />
                            <Text style={[styles.consentLabel, notifGranted && { color: theme.colors.accent.primary }]}>
                                {notifGranted ? 'Notifications Enabled' : 'Enable Security Alerts'}
                            </Text>
                        </View>
                        {notifGranted && (
                            <Ionicons name="checkmark-circle" size={20} color={theme.colors.accent.primary} />
                        )}
                    </Pressable>

                    {/* Biometric Toggle */}
                    {biometricsSupported && (
                        <View style={styles.consentRow}>
                            <View style={styles.consentTextContainer}>
                                <Ionicons
                                    name="finger-print"
                                    size={20}
                                    color={theme.colors.text.secondary}
                                />
                                <Text style={styles.consentLabel}>Enable App Lock</Text>
                            </View>
                            <Switch
                                value={biometricsEnabled}
                                onValueChange={toggleBiometrics}
                                trackColor={{ false: theme.colors.bg.tertiary, true: theme.colors.accent.primary }}
                                thumbColor="white"
                                style={{ transform: [{ scale: 0.8 }] }}
                            />
                        </View>
                    )}
                </View>
            )}

            {/* --- CONSENT SLIDE CONTENT --- */}
            {item.isConsentSlide && (
                <View style={styles.consentContainer}>
                    {/* Analytics Toggle */}
                    <Pressable
                        style={styles.consentRow}
                        onPress={() => setAnalyticsConsentLocal(!analyticsConsentLocal)}
                    >
                        <View style={styles.consentTextContainer}>
                            <Ionicons
                                name="analytics-outline"
                                size={20}
                                color={theme.colors.text.secondary}
                            />
                            <Text style={styles.consentLabel}>Share anonymous analytics</Text>
                        </View>
                        <View style={[
                            styles.toggle,
                            analyticsConsentLocal && styles.toggleActive
                        ]}>
                            <View style={[
                                styles.toggleKnob,
                                analyticsConsentLocal && styles.toggleKnobActive
                            ]} />
                        </View>
                    </Pressable>

                    {/* Error Reporting Toggle */}
                    <Pressable
                        style={styles.consentRow}
                        onPress={() => setErrorConsentLocal(!errorConsentLocal)}
                    >
                        <View style={styles.consentTextContainer}>
                            <Ionicons
                                name="bug-outline"
                                size={20}
                                color={theme.colors.text.secondary}
                            />
                            <Text style={styles.consentLabel}>Send error reports</Text>
                        </View>
                        <View style={[
                            styles.toggle,
                            errorConsentLocal && styles.toggleActive
                        ]}>
                            <View style={[
                                styles.toggleKnob,
                                errorConsentLocal && styles.toggleKnobActive
                            ]} />
                        </View>
                    </Pressable>

                    {/* Privacy Policy Link */}
                    <Pressable
                        style={styles.privacyLink}
                        onPress={openPrivacyPolicy}
                    >
                        <Text style={styles.privacyLinkText}>Read our Privacy Policy</Text>
                        <Ionicons name="open-outline" size={14} color={theme.colors.accent.blue} />
                    </Pressable>
                </View>
            )}
        </View>
    );

    const renderDots = () => (
        <View style={styles.dotsContainer}>
            {SLIDES.map((_, index) => {
                const inputRange = [(index - 1) * width, index * width, (index + 1) * width];
                const dotWidth = scrollX.interpolate({
                    inputRange,
                    outputRange: [8, 24, 8],
                    extrapolate: 'clamp',
                });
                const opacity = scrollX.interpolate({
                    inputRange,
                    outputRange: [0.3, 1, 0.3],
                    extrapolate: 'clamp',
                });
                return (
                    <Animated.View
                        key={index}
                        style={[styles.dot, { width: dotWidth, opacity }]}
                    />
                );
            })}
        </View>
    );

    const isLastSlide = currentIndex === SLIDES.length - 1;

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            {/* Skip Button */}
            <Pressable onPress={handleSkip} style={styles.skipButton}>
                <Text style={styles.skipText}>Skip</Text>
            </Pressable>

            {/* Slides */}
            <FlatList
                ref={flatListRef}
                data={SLIDES}
                renderItem={renderSlide}
                keyExtractor={(item) => item.id}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onViewableItemsChanged={onViewableItemsChanged}
                viewabilityConfig={viewabilityConfig}
                onScroll={Animated.event(
                    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                    { useNativeDriver: false }
                )}
            />

            {/* Bottom Section */}
            <View style={[styles.bottomSection, { paddingBottom: insets.bottom + 20 }]}>
                {renderDots()}

                <Pressable
                    onPress={handleNext}
                    style={({ pressed }) => [
                        styles.button,
                        pressed && styles.buttonPressed,
                    ]}
                >
                    <LinearGradient
                        colors={['#3d7aff', '#6366f1']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.buttonGradient}
                    >
                        <Text style={styles.buttonText}>
                            {isLastSlide ? 'Get Started' : 'Next'}
                        </Text>
                        <Ionicons
                            name={isLastSlide ? 'checkmark' : 'arrow-forward'}
                            size={20}
                            color="white"
                        />
                    </LinearGradient>
                </Pressable>
            </View>
        </View>
    );
};

// Check if onboarding has been completed
export const hasCompletedOnboarding = async () => {
    try {
        const value = await AsyncStorage.getItem(ONBOARDING_KEY);
        return value === 'true';
    } catch {
        return false;
    }
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.bg.primary,
    },
    skipButton: {
        position: 'absolute',
        top: 60,
        right: 20,
        zIndex: 10,
        padding: 8,
    },
    skipText: {
        color: theme.colors.text.muted,
        fontSize: 15,
    },
    slide: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 40,
    },
    iconGradient: {
        width: 160,
        height: 160,
        borderRadius: 80,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 40,
    },
    iconCircle: {
        width: 120,
        height: 120,
        borderRadius: 60,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: 'white',
        textAlign: 'center',
        marginBottom: 16,
    },
    description: {
        fontSize: 16,
        color: theme.colors.text.secondary,
        textAlign: 'center',
        lineHeight: 24,
    },
    bottomSection: {
        paddingHorizontal: 24,
    },
    dotsContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginBottom: 32,
    },
    dot: {
        height: 8,
        borderRadius: 4,
        backgroundColor: theme.colors.accent.blue,
        marginHorizontal: 4,
    },
    button: {
        borderRadius: 16,
        overflow: 'hidden',
    },
    buttonPressed: {
        opacity: 0.9,
        transform: [{ scale: 0.98 }],
    },
    buttonGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 18,
    },
    buttonText: {
        color: 'white',
        fontSize: 17,
        fontWeight: '600',
    },
    // Consent/Security slide styles
    consentContainer: {
        marginTop: 32,
        width: '100%',
        paddingHorizontal: 8,
    },
    consentRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: theme.colors.bg.secondary,
        paddingVertical: 16,
        paddingHorizontal: 16,
        borderRadius: 12,
        marginBottom: 12,
    },
    rowActive: {
        backgroundColor: 'rgba(59, 130, 246, 0.15)',
        borderColor: theme.colors.accent.primary,
        borderWidth: 1,
    },
    consentTextContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    consentLabel: {
        color: 'white',
        fontSize: 15,
        fontWeight: '500',
    },
    toggle: {
        width: 48,
        height: 28,
        borderRadius: 14,
        backgroundColor: theme.colors.bg.tertiary,
        justifyContent: 'center',
        paddingHorizontal: 2,
    },
    toggleActive: {
        backgroundColor: theme.colors.accent.blue,
    },
    toggleKnob: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: 'white',
    },
    toggleKnobActive: {
        alignSelf: 'flex-end',
    },
    privacyLink: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        marginTop: 8,
        paddingVertical: 12,
    },
    privacyLinkText: {
        color: theme.colors.accent.blue,
        fontSize: 14,
    },
});

export default OnboardingScreen;
