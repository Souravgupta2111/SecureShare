/**
 * ProfileScreen - User Profile & Settings
 * 
 * Google Drive-like profile screen with account info,
 * storage usage, and comprehensive settings.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    Pressable,
    Switch,
    Alert,
    ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import AnimatedHeader from '../components/AnimatedHeader';
import theme from '../theme';

import InputModal from '../components/InputModal';

const SETTINGS_KEY = 'secureshare_user_settings';

const ProfileScreen = ({ navigation }) => {
    const insets = useSafeAreaInsets();
    const { user, profile, signOut, updateProfile } = useAuth(); // Assuming updateProfile exists in context

    const [settings, setSettings] = useState({
        biometricLock: false,
        visibleWatermark: true,
        forensicWatermark: true,
        securityAlerts: true,
        openAlerts: true,
        expiryReminders: true,
        defaultExpiry: '24h',
    });
    const [storageUsed, setStorageUsed] = useState(0);
    const [signingOut, setSigningOut] = useState(false);
    const [editModalVisible, setEditModalVisible] = useState(false);

    useEffect(() => {
        loadSettings();
        calculateStorage();
    }, []);

    const handleUpdateProfile = async (newName) => {
        if (!user) return;
        try {
            await updateProfile(user.id, { display_name: newName });
            setEditModalVisible(false);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (e) {
            console.error(e);
            Alert.alert("Error", "Failed to update profile");
        }
    };

    const loadSettings = async () => {
        try {
            const saved = await AsyncStorage.getItem(SETTINGS_KEY);
            if (saved) {
                setSettings({ ...settings, ...JSON.parse(saved) });
            }
        } catch (e) {
            console.error('Failed to load settings:', e);
        }
    };

    const saveSettings = async (newSettings) => {
        try {
            await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
        } catch (e) {
            console.error('Failed to save settings:', e);
        }
    };

    const updateSetting = useCallback((key, value) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const newSettings = { ...settings, [key]: value };
        setSettings(newSettings);
        saveSettings(newSettings);
    }, [settings]);

    const calculateStorage = async () => {
        // In production, this would query Supabase storage
        // For now, calculate from local storage
        try {
            const docs = await AsyncStorage.getItem('secureshare_docs');
            if (docs) {
                const parsed = JSON.parse(docs);
                const totalSize = parsed.reduce((acc, doc) => acc + (doc.file_size || 0), 0);
                setStorageUsed(totalSize);
            }
        } catch (e) {
            console.error('Failed to calculate storage:', e);
        }
    };

    const handleSignOut = () => {
        Alert.alert(
            'Sign Out',
            'Are you sure you want to sign out?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Sign Out',
                    style: 'destructive',
                    onPress: async () => {
                        setSigningOut(true);
                        await signOut();
                        setSigningOut(false);
                    },
                },
            ]
        );
    };

    const formatStorageSize = (bytes) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const storagePercentage = Math.min((storageUsed / (1024 * 1024 * 1024)) * 100, 100);

    const getInitials = () => {
        if (profile?.display_name) {
            return profile.display_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        }
        if (user?.email) {
            return user.email[0].toUpperCase();
        }
        return '?';
    };

    return (
        <View style={styles.container}>
            <AnimatedHeader
                title="Profile"
                showBack
                onBack={() => navigation.goBack()}
            />

            <ScrollView
                contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 20 }]}
                showsVerticalScrollIndicator={false}
            >
                {/* Profile Card */}
                <View style={styles.profileCard}>
                    <LinearGradient
                        colors={['#3d7aff', '#6dd5fa']}
                        style={styles.avatar}
                    >
                        <Text style={styles.avatarText}>{getInitials()}</Text>
                    </LinearGradient>
                    <Text style={styles.displayName}>{profile?.display_name || 'SecureShare User'}</Text>
                    <Text style={styles.email}>{user?.email}</Text>
                    <Pressable style={styles.editButton} onPress={() => setEditModalVisible(true)}>
                        <Ionicons name="pencil-outline" size={14} color={theme.colors.accent.blue} />
                        <Text style={styles.editButtonText}>Edit Profile</Text>
                    </Pressable>
                </View>

                {/* Storage Card */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>STORAGE</Text>
                    <View style={styles.storageInfo}>
                        <Text style={styles.storageText}>
                            {formatStorageSize(storageUsed)} of 1 GB used
                        </Text>
                    </View>
                    <View style={styles.progressBar}>
                        <View style={[styles.progressFill, { width: `${storagePercentage}%` }]} />
                    </View>
                </View>

                {/* Security Settings */}
                <Text style={styles.sectionTitle}>SECURITY</Text>
                <View style={styles.card}>
                    <SettingRow
                        icon="finger-print-outline"
                        title="Biometric Lock"
                        subtitle="Require FaceID/Fingerprint to open app"
                        value={settings.biometricLock}
                        onValueChange={(val) => updateSetting('biometricLock', val)}
                    />
                    <View style={styles.divider} />
                    <SettingRow
                        icon="eye-outline"
                        title="Visible Watermark"
                        subtitle="Show floating watermark in viewer"
                        value={settings.visibleWatermark}
                        onValueChange={(val) => updateSetting('visibleWatermark', val)}
                    />
                    <View style={styles.divider} />
                    <SettingRow
                        icon="qr-code-outline"
                        title="Forensic Watermark"
                        subtitle="Embed invisible tracking watermark"
                        value={settings.forensicWatermark}
                        onValueChange={(val) => updateSetting('forensicWatermark', val)}
                    />
                </View>

                {/* Notification Settings */}
                <Text style={styles.sectionTitle}>NOTIFICATIONS</Text>
                <View style={styles.card}>
                    <SettingRow
                        icon="shield-outline"
                        title="Security Alerts"
                        subtitle="Screenshot and recording detection"
                        value={settings.securityAlerts}
                        onValueChange={(val) => updateSetting('securityAlerts', val)}
                    />
                    <View style={styles.divider} />
                    <SettingRow
                        icon="eye-outline"
                        title="Open Alerts"
                        subtitle="When someone views your document"
                        value={settings.openAlerts}
                        onValueChange={(val) => updateSetting('openAlerts', val)}
                    />
                    <View style={styles.divider} />
                    <SettingRow
                        icon="time-outline"
                        title="Expiry Reminders"
                        subtitle="Before documents expire"
                        value={settings.expiryReminders}
                        onValueChange={(val) => updateSetting('expiryReminders', val)}
                    />
                </View>

                {/* About */}
                <Text style={styles.sectionTitle}>ABOUT</Text>
                <View style={styles.card}>
                    <View style={styles.aboutRow}>
                        <Text style={styles.aboutLabel}>Version</Text>
                        <Text style={styles.aboutValue}>2.0.0</Text>
                    </View>
                    <View style={styles.divider} />
                    <Pressable style={styles.linkRow}>
                        <Text style={styles.linkText}>Privacy Policy</Text>
                        <Ionicons name="chevron-forward" size={18} color={theme.colors.text.muted} />
                    </Pressable>
                    <View style={styles.divider} />
                    <Pressable style={styles.linkRow}>
                        <Text style={styles.linkText}>Terms of Service</Text>
                        <Ionicons name="chevron-forward" size={18} color={theme.colors.text.muted} />
                    </Pressable>
                </View>

                {/* Sign Out */}
                <Pressable
                    style={styles.signOutButton}
                    onPress={handleSignOut}
                    disabled={signingOut}
                >
                    {signingOut ? (
                        <ActivityIndicator color={theme.colors.status.danger} />
                    ) : (
                        <>
                            <Ionicons name="log-out-outline" size={20} color={theme.colors.status.danger} />
                            <Text style={styles.signOutText}>Sign Out</Text>
                        </>
                    )}
                </Pressable>
            </ScrollView>

            <InputModal
                visible={editModalVisible}
                title="Edit Profile Name"
                initialValue={profile?.display_name}
                placeholder="Enter your name"
                onClose={() => setEditModalVisible(false)}
                onSubmit={handleUpdateProfile}
            />
        </View>
    );
};

// Setting Row Component
const SettingRow = ({ icon, title, subtitle, value, onValueChange }) => (
    <View style={styles.settingRow}>
        <View style={styles.settingIcon}>
            <Ionicons name={icon} size={20} color={theme.colors.accent.blue} />
        </View>
        <View style={styles.settingContent}>
            <Text style={styles.settingTitle}>{title}</Text>
            {subtitle && <Text style={styles.settingSubtitle}>{subtitle}</Text>}
        </View>
        <Switch
            value={value}
            onValueChange={onValueChange}
            trackColor={{ false: '#3e3e3e', true: theme.colors.accent.blue }}
            thumbColor="white"
        />
    </View>
);

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.bg.primary,
    },
    scrollContent: {
        padding: 16,
    },
    profileCard: {
        backgroundColor: theme.colors.bg.secondary,
        borderRadius: 16,
        padding: 24,
        alignItems: 'center',
        marginBottom: 24,
    },
    avatar: {
        width: 80,
        height: 80,
        borderRadius: 40,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    avatarText: {
        color: 'white',
        fontSize: 28,
        fontWeight: theme.font.weight.bold,
    },
    displayName: {
        color: 'white',
        fontSize: 20,
        fontWeight: theme.font.weight.semibold,
        marginBottom: 4,
    },
    email: {
        color: theme.colors.text.secondary,
        fontSize: 14,
        marginBottom: 16,
    },
    editButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: theme.colors.accent.blue,
    },
    editButtonText: {
        color: theme.colors.accent.blue,
        fontSize: 13,
        fontWeight: '500',
    },
    card: {
        backgroundColor: theme.colors.bg.secondary,
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
    },
    cardTitle: {
        color: theme.colors.text.muted,
        fontSize: 11,
        letterSpacing: 1,
        fontWeight: '600',
        marginBottom: 12,
    },
    storageInfo: {
        marginBottom: 8,
    },
    storageText: {
        color: 'white',
        fontSize: 14,
    },
    progressBar: {
        height: 6,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 3,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: theme.colors.accent.blue,
        borderRadius: 3,
    },
    sectionTitle: {
        color: theme.colors.text.muted,
        fontSize: 11,
        letterSpacing: 1,
        fontWeight: '600',
        marginBottom: 8,
        marginLeft: 4,
    },
    settingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
    },
    settingIcon: {
        width: 36,
        height: 36,
        borderRadius: 8,
        backgroundColor: 'rgba(61, 122, 255, 0.15)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    settingContent: {
        flex: 1,
    },
    settingTitle: {
        color: 'white',
        fontSize: 15,
        marginBottom: 2,
    },
    settingSubtitle: {
        color: theme.colors.text.muted,
        fontSize: 12,
    },
    divider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.06)',
        marginVertical: 12,
    },
    aboutRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 8,
    },
    aboutLabel: {
        color: 'white',
        fontSize: 15,
    },
    aboutValue: {
        color: theme.colors.text.muted,
        fontSize: 15,
    },
    linkRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
    },
    linkText: {
        color: 'white',
        fontSize: 15,
    },
    signOutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 16,
        marginTop: 8,
    },
    signOutText: {
        color: theme.colors.status.danger,
        fontSize: 16,
        fontWeight: '500',
    },
});

export default ProfileScreen;
