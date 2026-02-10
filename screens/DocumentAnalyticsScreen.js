/**
 * DocumentAnalyticsScreen - View Analytics & Security Events
 * 
 * Shows detailed analytics for a document including:
 * - Per-recipient viewing stats
 * - Security events timeline
 * - Access management (revoke)
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    RefreshControl,
    Pressable,
    Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import AnimatedHeader from '../components/AnimatedHeader';
import { getDocumentAnalytics, getSecurityEvents, revokeAccessToken } from '../lib/supabase';
import theme from '../theme';

const DocumentAnalyticsScreen = ({ route, navigation }) => {
    const { documentId, documentName, recipients } = route.params;
    const insets = useSafeAreaInsets();

    const [analytics, setAnalytics] = useState([]);
    const [securityEvents, setSecurityEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState('analytics'); // 'analytics' | 'security'

    const fetchData = useCallback(async () => {
        try {
            const [analyticsRes, securityRes] = await Promise.all([
                getDocumentAnalytics(documentId),
                getSecurityEvents(documentId),
            ]);

            if (analyticsRes.data) setAnalytics(analyticsRes.data);
            if (securityRes.data) setSecurityEvents(securityRes.data);
        } catch (error) {
            console.error('Error fetching analytics:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [documentId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleRefresh = () => {
        setRefreshing(true);
        fetchData();
    };

    const handleRevokeAccess = (tokenId, email) => {
        Alert.alert(
            'Revoke Access',
            `Are you sure you want to revoke access for ${email}?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Revoke',
                    style: 'destructive',
                    onPress: async () => {
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                        try {
                            await revokeAccessToken(tokenId);
                            fetchData();
                            Alert.alert('Success', `Access revoked for ${email}`);
                        } catch (e) {
                            Alert.alert('Error', 'Failed to revoke access');
                        }
                    },
                },
            ]
        );
    };

    const formatDuration = (seconds) => {
        if (!seconds) return '0s';
        if (seconds < 60) return `${seconds}s`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
        return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
    };

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const getEventIcon = (eventType) => {
        switch (eventType) {
            case 'screenshot': return 'camera-outline';
            case 'recording': return 'videocam-outline';
            case 'copy': return 'copy-outline';
            case 'denied': return 'ban-outline';
            case 'app_backgrounded': return 'phone-portrait-outline';
            default: return 'alert-outline';
        }
    };

    const getEventColor = (eventType) => {
        switch (eventType) {
            case 'screenshot':
            case 'recording':
                return theme.colors.status.danger;
            case 'denied':
                return theme.colors.status.warning;
            default:
                return theme.colors.text.muted;
        }
    };

    // Group analytics by recipient
    const recipientStats = recipients?.reduce((acc, r) => {
        const recipientEvents = analytics.filter(e => e.recipient_email === r.email);
        const viewStarts = recipientEvents.filter(e => e.event_type === 'view_start').length;
        const totalDuration = recipientEvents
            .filter(e => e.event_type === 'view_end')
            .reduce((sum, e) => sum + (e.session_duration || 0), 0);

        acc[r.email] = {
            email: r.email,
            openCount: viewStarts,
            totalViewTime: totalDuration,
            lastOpened: recipientEvents[0]?.created_at,
        };
        return acc;
    }, {}) || {};

    return (
        <View style={styles.container}>
            <AnimatedHeader
                title="Analytics"
                showBack
                onBack={() => navigation.goBack()}
            />

            {/* Tabs */}
            <View style={styles.tabs}>
                <Pressable
                    style={[styles.tab, activeTab === 'analytics' && styles.tabActive]}
                    onPress={() => setActiveTab('analytics')}
                >
                    <Text style={[styles.tabText, activeTab === 'analytics' && styles.tabTextActive]}>
                        View Stats
                    </Text>
                </Pressable>
                <Pressable
                    style={[styles.tab, activeTab === 'security' && styles.tabActive]}
                    onPress={() => setActiveTab('security')}
                >
                    <Text style={[styles.tabText, activeTab === 'security' && styles.tabTextActive]}>
                        Security ({securityEvents.length})
                    </Text>
                </Pressable>
            </View>

            <ScrollView
                contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={handleRefresh}
                        tintColor={theme.colors.accent.blue}
                    />
                }
            >
                {activeTab === 'analytics' ? (
                    <>
                        {/* Summary Card */}
                        <View style={styles.summaryCard}>
                            <Text style={styles.documentName}>{documentName}</Text>
                            <View style={styles.summaryStats}>
                                <View style={styles.statItem}>
                                    <Text style={styles.statValue}>{Object.keys(recipientStats).length}</Text>
                                    <Text style={styles.statLabel}>Recipients</Text>
                                </View>
                                <View style={styles.statDivider} />
                                <View style={styles.statItem}>
                                    <Text style={styles.statValue}>
                                        {Object.values(recipientStats).reduce((sum, r) => sum + r.openCount, 0)}
                                    </Text>
                                    <Text style={styles.statLabel}>Total Opens</Text>
                                </View>
                                <View style={styles.statDivider} />
                                <View style={styles.statItem}>
                                    <Text style={styles.statValue}>{securityEvents.length}</Text>
                                    <Text style={styles.statLabel}>Incidents</Text>
                                </View>
                            </View>
                        </View>

                        {/* Per-Recipient Stats */}
                        <Text style={styles.sectionTitle}>RECIPIENTS</Text>
                        {Object.values(recipientStats).map((stats, index) => (
                            <View key={index} style={styles.recipientCard}>
                                <View style={styles.recipientHeader}>
                                    <View style={styles.recipientIcon}>
                                        <Ionicons name="person" size={16} color={theme.colors.accent.blue} />
                                    </View>
                                    <Text style={styles.recipientEmail}>{stats.email}</Text>
                                </View>
                                <View style={styles.recipientStats}>
                                    <View style={styles.recipientStat}>
                                        <Ionicons name="eye-outline" size={14} color={theme.colors.text.muted} />
                                        <Text style={styles.recipientStatText}>{stats.openCount} opens</Text>
                                    </View>
                                    <View style={styles.recipientStat}>
                                        <Ionicons name="time-outline" size={14} color={theme.colors.text.muted} />
                                        <Text style={styles.recipientStatText}>{formatDuration(stats.totalViewTime)}</Text>
                                    </View>
                                </View>
                                {stats.lastOpened && (
                                    <Text style={styles.recipientLastOpened}>
                                        Last opened: {formatDate(stats.lastOpened)}
                                    </Text>
                                )}
                            </View>
                        ))}
                    </>
                ) : (
                    <>
                        {/* Security Events Timeline */}
                        {securityEvents.length === 0 ? (
                            <View style={styles.emptyState}>
                                <Ionicons name="shield-checkmark" size={48} color={theme.colors.status.success} />
                                <Text style={styles.emptyTitle}>No Security Incidents</Text>
                                <Text style={styles.emptySubtitle}>No screenshot or recording attempts detected</Text>
                            </View>
                        ) : (
                            securityEvents.map((event, index) => (
                                <View key={index} style={styles.eventCard}>
                                    <View style={[styles.eventIcon, { backgroundColor: getEventColor(event.event_type) + '20' }]}>
                                        <Ionicons
                                            name={getEventIcon(event.event_type)}
                                            size={18}
                                            color={getEventColor(event.event_type)}
                                        />
                                    </View>
                                    <View style={styles.eventContent}>
                                        <Text style={styles.eventType}>
                                            {event.event_type.replace('_', ' ').toUpperCase()}
                                        </Text>
                                        <Text style={styles.eventRecipient}>{event.recipient_email}</Text>
                                        <Text style={styles.eventTime}>{formatDate(event.created_at)}</Text>
                                    </View>
                                    {event.blocked && (
                                        <View style={styles.blockedBadge}>
                                            <Text style={styles.blockedText}>Blocked</Text>
                                        </View>
                                    )}
                                </View>
                            ))
                        )}
                    </>
                )}
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.bg.primary,
    },
    tabs: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingVertical: 8,
        gap: 8,
    },
    tab: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 8,
        backgroundColor: theme.colors.bg.secondary,
        alignItems: 'center',
    },
    tabActive: {
        backgroundColor: theme.colors.accent.blue,
    },
    tabText: {
        color: theme.colors.text.secondary,
        fontWeight: '500',
    },
    tabTextActive: {
        color: 'white',
    },
    content: {
        padding: 16,
    },
    summaryCard: {
        backgroundColor: theme.colors.bg.secondary,
        borderRadius: 16,
        padding: 20,
        marginBottom: 24,
    },
    documentName: {
        color: 'white',
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 16,
        textAlign: 'center',
    },
    summaryStats: {
        flexDirection: 'row',
        justifyContent: 'space-around',
    },
    statItem: {
        alignItems: 'center',
    },
    statValue: {
        color: theme.colors.accent.blue,
        fontSize: 24,
        fontWeight: 'bold',
    },
    statLabel: {
        color: theme.colors.text.muted,
        fontSize: 12,
        marginTop: 4,
    },
    statDivider: {
        width: 1,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    sectionTitle: {
        color: theme.colors.text.muted,
        fontSize: 11,
        letterSpacing: 1,
        fontWeight: '600',
        marginBottom: 12,
    },
    recipientCard: {
        backgroundColor: theme.colors.bg.secondary,
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
    },
    recipientHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    recipientIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(61, 122, 255, 0.15)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
    },
    recipientEmail: {
        color: 'white',
        fontSize: 14,
        fontWeight: '500',
        flex: 1,
    },
    recipientStats: {
        flexDirection: 'row',
        gap: 20,
        marginBottom: 8,
    },
    recipientStat: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    recipientStatText: {
        color: theme.colors.text.secondary,
        fontSize: 13,
    },
    recipientLastOpened: {
        color: theme.colors.text.muted,
        fontSize: 12,
    },
    emptyState: {
        alignItems: 'center',
        paddingTop: 60,
    },
    emptyTitle: {
        color: 'white',
        fontSize: 18,
        fontWeight: '600',
        marginTop: 16,
    },
    emptySubtitle: {
        color: theme.colors.text.muted,
        fontSize: 14,
        marginTop: 8,
    },
    eventCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.bg.secondary,
        borderRadius: 12,
        padding: 14,
        marginBottom: 10,
    },
    eventIcon: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    eventContent: {
        flex: 1,
    },
    eventType: {
        color: 'white',
        fontSize: 13,
        fontWeight: '600',
    },
    eventRecipient: {
        color: theme.colors.text.secondary,
        fontSize: 12,
        marginTop: 2,
    },
    eventTime: {
        color: theme.colors.text.muted,
        fontSize: 11,
        marginTop: 2,
    },
    blockedBadge: {
        backgroundColor: theme.colors.status.success + '20',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
    },
    blockedText: {
        color: theme.colors.status.success,
        fontSize: 10,
        fontWeight: '600',
    },
});

export default DocumentAnalyticsScreen;
