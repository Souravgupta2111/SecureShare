/**
 * SecurityInfoScreen - Explains security features to users
 * 
 * This screen helps users understand how their documents are protected.
 */

import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    Pressable,
    Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import theme from '../theme';

const SecurityInfoScreen = ({ navigation }) => {
    const insets = useSafeAreaInsets();

    const handleBack = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        navigation.goBack();
    };

    const sections = [
        {
            icon: 'lock-closed',
            color: theme.colors.accent.blue,
            title: 'End-to-End Encryption',
            description: 'Your documents are encrypted using AES-256-GCM directly on your device before being uploaded. The encryption keys never leave your device.',
            details: [
                'Military-grade AES-256 encryption',
                'Keys stored in device secure enclave',
                'Zero-knowledge architecture — we can\'t read your files',
            ],
        },
        {
            icon: 'key',
            color: theme.colors.accent.purple,
            title: 'Key Management',
            description: 'Each document has a unique encryption key protected by RSA-OAEP asymmetric encryption.',
            details: [
                'Unique per-document keys',
                'RSA-OAEP key wrapping',
                'Private keys never transmitted',
            ],
        },
        {
            icon: 'shield-checkmark',
            color: theme.colors.status.success,
            title: 'Screenshot Protection',
            description: Platform.OS === 'android'
                ? 'On Android, screenshots and screen recording are blocked while viewing documents.'
                : 'On iOS, screenshots are detected and logged. The document owner is notified of any attempts.',
            details: Platform.OS === 'android'
                ? [
                    'FLAG_SECURE enabled on Android',
                    'Screen capture blocked system-wide',
                    'Recording apps cannot capture content',
                ]
                : [
                    'Screenshot detection enabled',
                    'Owner notified of attempts',
                    'Watermarks help trace leaks',
                ],
            warning: Platform.OS === 'ios'
                ? 'Due to iOS limitations, we cannot prevent screenshots — only detect them.'
                : null,
        },
        {
            icon: 'water',
            color: theme.colors.accent.gold,
            title: 'Invisible Watermarking',
            description: 'Every shared document contains an invisible watermark with the recipient\'s identity information.',
            details: [
                'HMAC-signed for tamper detection',
                'Traces leaks to source',
                'Survives most image processing',
            ],
        },
        {
            icon: 'time',
            color: theme.colors.status.warning,
            title: 'Time-Limited Access',
            description: 'Set expiration times for shared documents. Once expired, recipients can no longer access the content.',
            details: [
                'Flexible expiry: 1 hour to 30 days',
                'Auto-revocation on expiry',
                'Instant manual revoke available',
            ],
        },
        {
            icon: 'analytics',
            color: theme.colors.accent.cyan,
            title: 'View Analytics',
            description: 'Track every view of your shared documents. Know who, when, and for how long.',
            details: [
                'Real-time view notifications',
                'Session duration tracking',
                'Device and platform info',
            ],
        },
    ];

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            {/* Header */}
            <View style={styles.header}>
                <Pressable
                    onPress={handleBack}
                    hitSlop={10}
                    style={styles.backButton}
                >
                    <Ionicons name="arrow-back" size={24} color="white" />
                </Pressable>
                <Text style={styles.headerTitle}>Security Features</Text>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={[
                    styles.scrollContent,
                    { paddingBottom: insets.bottom + 20 }
                ]}
                showsVerticalScrollIndicator={false}
            >
                {/* Hero Section */}
                <View style={styles.heroSection}>
                    <View style={styles.heroIcon}>
                        <Ionicons name="shield" size={48} color={theme.colors.accent.blue} />
                    </View>
                    <Text style={styles.heroTitle}>Zero-Trust Security</Text>
                    <Text style={styles.heroSubtitle}>
                        Your documents are protected by multiple layers of security. Here's how we keep your data safe.
                    </Text>
                </View>

                {/* Security Sections */}
                {sections.map((section, index) => (
                    <View key={index} style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <View style={[styles.sectionIcon, { backgroundColor: section.color + '20' }]}>
                                <Ionicons name={section.icon} size={24} color={section.color} />
                            </View>
                            <Text style={styles.sectionTitle}>{section.title}</Text>
                        </View>

                        <Text style={styles.sectionDescription}>
                            {section.description}
                        </Text>

                        <View style={styles.detailsList}>
                            {section.details.map((detail, i) => (
                                <View key={i} style={styles.detailItem}>
                                    <Ionicons
                                        name="checkmark-circle"
                                        size={16}
                                        color={theme.colors.status.success}
                                    />
                                    <Text style={styles.detailText}>{detail}</Text>
                                </View>
                            ))}
                        </View>

                        {section.warning && (
                            <View style={styles.warningBox}>
                                <Ionicons
                                    name="warning"
                                    size={16}
                                    color={theme.colors.status.warning}
                                />
                                <Text style={styles.warningText}>{section.warning}</Text>
                            </View>
                        )}
                    </View>
                ))}

                {/* Footer Note */}
                <View style={styles.footer}>
                    <Ionicons name="information-circle" size={20} color={theme.colors.text.muted} />
                    <Text style={styles.footerText}>
                        Security is our top priority. We continuously improve our protections to keep your documents safe.
                    </Text>
                </View>
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.bg.primary,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: theme.colors.bg.secondary,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border.default,
    },
    backButton: {
        padding: 4,
    },
    headerTitle: {
        color: 'white',
        fontSize: 17,
        fontWeight: '600',
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 16,
    },
    heroSection: {
        alignItems: 'center',
        paddingVertical: 24,
        marginBottom: 8,
    },
    heroIcon: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: theme.colors.accent.blue + '15',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    heroTitle: {
        color: 'white',
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    heroSubtitle: {
        color: theme.colors.text.secondary,
        fontSize: 15,
        textAlign: 'center',
        lineHeight: 22,
        paddingHorizontal: 16,
    },
    section: {
        backgroundColor: theme.colors.bg.secondary,
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    sectionIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    sectionTitle: {
        color: 'white',
        fontSize: 17,
        fontWeight: '600',
        flex: 1,
    },
    sectionDescription: {
        color: theme.colors.text.secondary,
        fontSize: 14,
        lineHeight: 21,
        marginBottom: 12,
    },
    detailsList: {
        marginTop: 4,
    },
    detailItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
    },
    detailText: {
        color: theme.colors.text.primary,
        fontSize: 14,
        flex: 1,
    },
    warningBox: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        backgroundColor: theme.colors.status.warning + '15',
        padding: 12,
        borderRadius: 8,
        marginTop: 8,
    },
    warningText: {
        color: theme.colors.status.warning,
        fontSize: 13,
        flex: 1,
        lineHeight: 18,
    },
    footer: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        paddingVertical: 20,
        paddingHorizontal: 8,
    },
    footerText: {
        color: theme.colors.text.muted,
        fontSize: 13,
        flex: 1,
        lineHeight: 18,
    },
});

export default SecurityInfoScreen;
