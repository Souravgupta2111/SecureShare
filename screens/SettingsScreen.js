import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, TouchableOpacity, Alert, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import AnimatedHeader from '../components/AnimatedHeader';
import * as storage from '../utils/storage';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { setAnalyticsConsent } from '../utils/analyticsQueue';
import { checkSecurityCapabilities } from '../components/SecurityCapabilitiesBanner';
import * as Haptics from 'expo-haptics';

const PRIVATE_KEY_STORAGE_KEY = 'secureshare_private_key';

const SettingsScreen = ({ navigation }) => {
    const { analyticsConsent, errorReportingConsent, updateConsent, user, profile } = useAuth();
    const { theme, isDark, themeMode, setThemeMode, toggleTheme } = useTheme();
    const [securityAlerts, setSecurityAlerts] = useState(true);
    const [openAlerts, setOpenAlerts] = useState(true);
    const [localAnalyticsConsent, setLocalAnalyticsConsent] = useState(false);
    const [localErrorConsent, setLocalErrorConsent] = useState(false);
    const [securityLevel, setSecurityLevel] = useState({ level: 'Unknown', full: false });
    const [keysSetup, setKeysSetup] = useState(null); // null = loading, true/false = status

    // Dynamic styles based on theme
    const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);

    // Check if encryption keys exist
    const checkKeyStatus = async () => {
        try {
            const part0 = await SecureStore.getItemAsync(`${PRIVATE_KEY_STORAGE_KEY}_0`);
            const part1 = await SecureStore.getItemAsync(`${PRIVATE_KEY_STORAGE_KEY}_1`);
            const hasLocalKeys = !!(part0 && part1);
            const hasPublicKey = !!(profile?.public_key);
            setKeysSetup(hasLocalKeys && hasPublicKey);
        } catch {
            setKeysSetup(false);
        }
    };

    useEffect(() => {
        loadSettings();
        checkSecurityCapabilities().then(setSecurityLevel);
        setLocalAnalyticsConsent(analyticsConsent);
        setLocalErrorConsent(errorReportingConsent);
        checkKeyStatus();
    }, [analyticsConsent, errorReportingConsent, profile]);

    const loadSettings = async () => {
        const json = await AsyncStorage.getItem('secureshare_settings');
        if (json) {
            const parsed = JSON.parse(json);
            setSecurityAlerts(parsed.securityAlerts !== false); // Default true
            setOpenAlerts(parsed.openAlerts !== false);
        }
    };

    const updateSetting = async (key, val) => {
        if (key === 'security') setSecurityAlerts(val);
        if (key === 'open') setOpenAlerts(val); // Note: Usage of 'openAlerts' logic would be in heartbeat/storage where alerts originate.

        // Save
        const newState = {
            securityAlerts: key === 'security' ? val : securityAlerts,
            openAlerts: key === 'open' ? val : openAlerts
        };
        await AsyncStorage.setItem('secureshare_settings', JSON.stringify(newState));
    };

    const handleClearData = () => {
        Alert.alert(
            "Clear All Data",
            "This will permanently delete all shared documents, security logs, and settings. This cannot be undone.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Clear",
                    style: "destructive",
                    onPress: async () => {
                        await storage.clearAllData();
                        // Reset navigation stack to Home? Or just nav to Home
                        navigation.reset({
                            index: 0,
                            routes: [{ name: 'Home' }],
                        });
                    }
                }
            ]
        );
    };

    const handleAnalyticsToggle = async (value) => {
        setLocalAnalyticsConsent(value);
        await updateConsent('analytics', value);
        await setAnalyticsConsent(value);
    };

    const handleErrorReportingToggle = async (value) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setLocalErrorConsent(value);
        await updateConsent('errorReporting', value);
    };

    // Theme mode handlers
    const handleThemeModeChange = async (mode) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        await setThemeMode(mode);
    };

    return (
        <View style={styles.container}>
            <AnimatedHeader title="Settings" showBack onBack={() => navigation.goBack()} />

            <ScrollView contentContainerStyle={styles.scrollContent}>

                {/* About Card */}
                <View style={styles.card}>
                    <View style={styles.iconBox}>
                        <Image
                            source={require('../assets/logo.png')}
                            style={{ width: 48, height: 48 }}
                            resizeMode="contain"
                        />
                    </View>
                    <Text style={styles.appName}>SecureShare</Text>
                    <Text style={styles.version}>Version 1.0.0</Text>
                    <Text style={styles.description}>
                        Secure document sharing with invisible forensic watermarking and screen protection.
                    </Text>
                </View>

                {/* Security Level Card */}
                <View style={styles.card}>
                    <View style={styles.row}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.rowTitle}>Security Level</Text>
                            <Text style={styles.rowSubtitle}>
                                {securityLevel.full ? 'Full Protection' : 'Limited (Expo Go)'}
                            </Text>
                        </View>
                        <View style={[
                            styles.badge,
                            securityLevel.full ? styles.badgeSuccess : styles.badgeWarning
                        ]}>
                            <Text style={styles.badgeText}>
                                {securityLevel.full ? 'FULL' : 'LIMITED'}
                            </Text>
                        </View>
                    </View>
                    <TouchableOpacity
                        style={styles.learnMoreLink}
                        onPress={() => navigation.navigate('SecurityInfo')}
                    >
                        <Text style={styles.linkText}>What's the difference?</Text>
                        <Ionicons name="chevron-forward" size={16} color={theme.colors.accent.blue} />
                    </TouchableOpacity>
                </View>

                {/* Encryption Keys Card */}
                <View style={styles.card}>
                    <View style={styles.row}>
                        <View style={styles.rowContent}>
                            <Ionicons name="key-outline" size={20} color={theme.colors.accent.blue} />
                            <View style={styles.rowTextContainer}>
                                <Text style={styles.rowTitle}>Encryption Keys</Text>
                                <Text style={styles.rowSubtitle}>
                                    {keysSetup === null ? 'Checking...' :
                                        keysSetup ? 'Keys are configured' : 'Keys not set up'}
                                </Text>
                            </View>
                        </View>
                        <View style={[
                            styles.badge,
                            keysSetup ? styles.badgeSuccess : styles.badgeDanger
                        ]}>
                            <Text style={[styles.badgeText, !keysSetup && { color: theme.colors.status.danger }]}>
                                {keysSetup === null ? '...' : keysSetup ? 'OK' : 'MISSING'}
                            </Text>
                        </View>
                    </View>
                    <TouchableOpacity
                        style={styles.keySetupButton}
                        onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            navigation.navigate('KeyGeneration');
                        }}
                    >
                        <Ionicons
                            name={keysSetup ? "refresh" : "add-circle"}
                            size={18}
                            color="white"
                        />
                        <Text style={styles.keySetupButtonText}>
                            {keysSetup ? 'Regenerate Keys' : 'Setup Encryption Keys'}
                        </Text>
                    </TouchableOpacity>
                    {!keysSetup && (
                        <Text style={styles.keyWarningText}>
                            ⚠️ Without keys, you cannot share or receive encrypted documents
                        </Text>
                    )}
                </View>

                {/* Appearance */}
                <Text style={styles.sectionTitle}>APPEARANCE</Text>
                <View style={styles.card}>
                    <View style={styles.row}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.rowTitle}>Theme</Text>
                            <Text style={styles.rowSubtitle}>Choose your preferred appearance</Text>
                        </View>
                    </View>
                    <View style={styles.themeOptions}>
                        <TouchableOpacity
                            style={[styles.themeOption, themeMode === 'light' && styles.themeOptionActive]}
                            onPress={() => handleThemeModeChange('light')}
                        >
                            <Ionicons name="sunny" size={20} color={themeMode === 'light' ? theme.colors.accent.primary : theme.colors.text.secondary} />
                            <Text style={[styles.themeOptionText, themeMode === 'light' && styles.themeOptionTextActive]}>Light</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.themeOption, themeMode === 'dark' && styles.themeOptionActive]}
                            onPress={() => handleThemeModeChange('dark')}
                        >
                            <Ionicons name="moon" size={20} color={themeMode === 'dark' ? theme.colors.accent.primary : theme.colors.text.secondary} />
                            <Text style={[styles.themeOptionText, themeMode === 'dark' && styles.themeOptionTextActive]}>Dark</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.themeOption, themeMode === 'system' && styles.themeOptionActive]}
                            onPress={() => handleThemeModeChange('system')}
                        >
                            <Ionicons name="phone-portrait" size={20} color={themeMode === 'system' ? theme.colors.accent.primary : theme.colors.text.secondary} />
                            <Text style={[styles.themeOptionText, themeMode === 'system' && styles.themeOptionTextActive]}>System</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Notifications */}
                <Text style={styles.sectionTitle}>NOTIFICATIONS</Text>
                <View style={styles.card}>
                    <View style={styles.row}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.rowTitle}>Security Alerts</Text>
                            <Text style={styles.rowSubtitle}>Screenshot and recording detection</Text>
                        </View>
                        <Switch
                            value={securityAlerts}
                            onValueChange={(val) => updateSetting('security', val)}
                            trackColor={{ false: '#3e3e3e', true: theme.colors.accent.blue }}
                            thumbColor={'white'}
                        />
                    </View>
                    <View style={styles.divider} />
                    <View style={styles.row}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.rowTitle}>Open Alerts</Text>
                            <Text style={styles.rowSubtitle}>When someone opens your document</Text>
                        </View>
                        <Switch
                            value={openAlerts}
                            onValueChange={(val) => updateSetting('open', val)}
                            trackColor={{ false: '#3e3e3e', true: theme.colors.accent.blue }}
                            thumbColor={'white'}
                        />
                    </View>
                </View>

                {/* Privacy */}
                <Text style={styles.sectionTitle}>PRIVACY</Text>
                <View style={styles.card}>
                    <View style={styles.row}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.rowTitle}>Anonymous Analytics</Text>
                            <Text style={styles.rowSubtitle}>Help improve the app</Text>
                        </View>
                        <Switch
                            value={localAnalyticsConsent}
                            onValueChange={handleAnalyticsToggle}
                            trackColor={{ false: '#3e3e3e', true: theme.colors.accent.blue }}
                            thumbColor={'white'}
                        />
                    </View>
                    <View style={styles.divider} />
                    <View style={styles.row}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.rowTitle}>Error Reporting</Text>
                            <Text style={styles.rowSubtitle}>Automatically report crashes</Text>
                        </View>
                        <Switch
                            value={localErrorConsent}
                            onValueChange={handleErrorReportingToggle}
                            trackColor={{ false: '#3e3e3e', true: theme.colors.accent.blue }}
                            thumbColor={'white'}
                        />
                    </View>
                    <View style={styles.divider} />
                    <TouchableOpacity
                        style={styles.row}
                        onPress={() => navigation.navigate('SecurityInfo')}
                    >
                        <View style={styles.rowContent}>
                            <Ionicons name="information-circle-outline" size={20} color={theme.colors.accent.blue} />
                            <View style={styles.rowTextContainer}>
                                <Text style={styles.rowTitle}>Privacy Policy</Text>
                                <Text style={styles.rowSubtitle}>How we protect your data</Text>
                            </View>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={theme.colors.text.muted} />
                    </TouchableOpacity>
                </View>

                {/* Data */}
                <Text style={styles.sectionTitle}>DATA</Text>
                <TouchableOpacity
                    style={styles.card}
                    onPress={handleClearData}
                    activeOpacity={0.7}
                >
                    <View style={styles.row}>
                        <Text style={styles.dangerText}>Clear All Data</Text>
                        <Ionicons name="chevron-forward" size={20} color={theme.colors.status.danger} />
                    </View>
                </TouchableOpacity>

                {/* Security */}
                <Text style={styles.sectionTitle}>SECURITY</Text>
                <TouchableOpacity
                    style={styles.card}
                    onPress={() => navigation.navigate('SecurityInfo')}
                    activeOpacity={0.7}
                >
                    <View style={styles.row}>
                        <View style={styles.rowContent}>
                            <Ionicons name="shield-checkmark-outline" size={20} color={theme.colors.accent.blue} />
                            <View style={styles.rowTextContainer}>
                                <Text style={styles.rowTitle}>Security Features</Text>
                                <Text style={styles.rowSubtitle}>Learn how your documents are protected</Text>
                            </View>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={theme.colors.text.muted} />
                    </View>
                </TouchableOpacity>

                <View style={styles.footer}>
                    <Text style={styles.footerText}>Built with React Native & Expo</Text>
                    <Text style={styles.copyText}>© 2026 SecureShare</Text>
                </View>

            </ScrollView>
        </View>
    );
};

const createStyles = (theme, isDark) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.bg.primary,
    },
    scrollContent: {
        padding: 16,
        paddingBottom: 40,
    },
    card: {
        backgroundColor: theme.colors.bg.secondary,
        borderRadius: 16,
        padding: 20,
        marginBottom: 24,
    },
    iconBox: {
        width: 48, height: 48,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
    },
    appName: {
        fontSize: 20,
        fontWeight: theme.font.weight.semibold,
        color: theme.colors.text.primary,
        marginBottom: 4,
    },
    version: {
        fontSize: 13,
        color: theme.colors.text.muted,
        marginBottom: 12,
    },
    description: {
        fontSize: 14,
        color: theme.colors.text.secondary,
        lineHeight: 20,
    },
    sectionTitle: {
        fontSize: 11,
        color: theme.colors.text.muted,
        marginBottom: 8,
        marginLeft: 4,
        letterSpacing: 1,
        fontWeight: '600',
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 8,
    },
    rowTitle: {
        fontSize: 15,
        color: theme.colors.text.primary,
        marginBottom: 4,
    },
    rowSubtitle: {
        fontSize: 13,
        color: theme.colors.text.muted,
    },
    divider: {
        height: 1,
        backgroundColor: theme.colors.border.subtle,
        marginVertical: 12,
    },
    dangerText: {
        color: theme.colors.status.danger,
        fontSize: 15,
        fontWeight: '500',
    },
    rowContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    rowTextContainer: {
        flex: 1,
    },
    badge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
        marginLeft: 8,
    },
    badgeSuccess: {
        backgroundColor: theme.colors.status.successBg,
        borderWidth: 1,
        borderColor: theme.colors.status.success,
    },
    badgeWarning: {
        backgroundColor: theme.colors.status.warningBg,
        borderWidth: 1,
        borderColor: theme.colors.status.warning,
    },
    badgeText: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.5,
        color: theme.colors.status.success,
    },
    learnMoreLink: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 8,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border.subtle,
    },
    linkText: {
        color: theme.colors.accent.primary,
        fontSize: 13,
        marginRight: 4,
    },
    themeOptions: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 12,
    },
    themeOption: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderRadius: 10,
        backgroundColor: theme.colors.bg.tertiary,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    themeOptionActive: {
        backgroundColor: theme.colors.accent.surface,
        borderColor: theme.colors.accent.primary,
    },
    themeOptionText: {
        fontSize: 13,
        fontWeight: '500',
        color: theme.colors.text.secondary,
    },
    themeOptionTextActive: {
        color: theme.colors.accent.primary,
    },
    footer: {
        alignItems: 'center',
        marginTop: 20,
    },
    footerText: {
        fontSize: 12,
        color: theme.colors.text.muted,
        marginBottom: 4,
    },
    copyText: {
        fontSize: 11,
        color: theme.colors.text.muted,
    },
    badgeDanger: {
        backgroundColor: theme.colors.status.dangerBg || 'rgba(255,59,48,0.15)',
        borderWidth: 1,
        borderColor: theme.colors.status.danger,
    },
    keySetupButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: theme.colors.accent.blue,
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 10,
        marginTop: 16,
    },
    keySetupButtonText: {
        color: 'white',
        fontWeight: '600',
        fontSize: 14,
    },
    keyWarningText: {
        color: theme.colors.status.warning,
        fontSize: 12,
        textAlign: 'center',
        marginTop: 12,
        paddingHorizontal: 8,
    },
});

export default SettingsScreen;
