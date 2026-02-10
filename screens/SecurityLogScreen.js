import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import theme from '../theme';
import AnimatedHeader from '../components/AnimatedHeader';
import * as storage from '../utils/storage';

const FILTERS = ['All', 'Screenshots', 'Recordings', 'Copy Attempts'];

const SecurityLogScreen = ({ navigation }) => {
    const [events, setEvents] = useState([]);
    const [filter, setFilter] = useState('All');

    const loadEvents = async () => {
        const all = await storage.getAllSecurityEvents();
        all.sort((a, b) => b.timestamp - a.timestamp); // Newest first
        setEvents(all);
    };

    useFocusEffect(
        useCallback(() => {
            loadEvents();
            // Poll while focused?
            const i = setInterval(loadEvents, 3000);
            return () => clearInterval(i);
        }, [])
    );

    const filteredEvents = events.filter(e => {
        if (filter === 'All') return true;
        if (filter === 'Screenshots') return e.eventType === 'screenshot';
        if (filter === 'Recordings') return e.eventType === 'screen_recording';
        if (filter === 'Copy Attempts') return e.eventType === 'copy_attempt';
        return true;
    });

    const getEventMeta = (type) => {
        if (type === 'screenshot') return { color: theme.colors.status.danger, label: 'Screenshot Detected' };
        if (type === 'screen_recording') return { color: theme.colors.status.warning, label: 'Screen Recording Detected' };
        return { color: theme.colors.status.purple, label: 'Copy Attempt Blocked' };
    };

    const formatTime = (ts) => {
        const d = new Date(ts);
        // Logic for "Today"
        const now = new Date();
        const isToday = d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

        if (isToday) return `Today ${timeStr}`;
        return `${d.toLocaleDateString()} ${timeStr}`;
    };

    const renderItem = ({ item }) => {
        const meta = getEventMeta(item.eventType);
        return (
            <View style={styles.eventRow}>
                {/* Timeline dot */}
                <View style={[styles.timelineDot, { backgroundColor: meta.color, shadowColor: meta.color }]} />

                <View style={styles.card}>
                    <View style={styles.cardHeader}>
                        <Text style={styles.cardTitle}>{meta.label}</Text>
                        <Text style={styles.cardTime}>{formatTime(item.timestamp)}</Text>
                    </View>
                    <Text style={styles.cardDoc}>{item.documentFilename}</Text>
                    <Text style={styles.cardUser}>{item.recipientEmail}</Text>
                </View>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <AnimatedHeader title="Security Log" showBack={false} />

            {/* Filters */}
            <View style={styles.filterContainer}>
                <FlatList
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    data={FILTERS}
                    keyExtractor={i => i}
                    contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
                    renderItem={({ item }) => {
                        const isActive = filter === item;
                        return (
                            <Pressable
                                style={[styles.filterPill, isActive && styles.filterPillActive]}
                                onPress={() => setFilter(item)}
                            >
                                <Text style={[styles.filterText, isActive && { color: 'white' }]}>{item}</Text>
                            </Pressable>
                        );
                    }}
                />
            </View>

            {/* Timeline */}
            <View style={styles.listContainer}>
                {filteredEvents.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <Pressable style={styles.emptyIcon}>
                            {/* Shield checkmark */}
                            {/* Ionicons doesn't have shield-checkmark-outline specifically in all sets, checkmark-circle or shield-checkmark. Using shield-checkmark if available or combine. */}
                            {/* shield-checkmark-outline exists in recent Ionicons */}
                            {/* We simulate pulse with scale if wanted, simplified here for empty state */}
                            <Text style={{ fontSize: 50 }}>🛡️</Text>
                        </Pressable>
                        <Text style={styles.emptyTitle}>All Clear</Text>
                        <Text style={styles.emptySub}>No security events detected</Text>
                    </View>
                ) : (
                    <View style={{ flex: 1 }}>
                        {/* Vertical Line */}
                        <View style={styles.verticalLine} />

                        <FlatList
                            data={filteredEvents}
                            renderItem={renderItem}
                            keyExtractor={item => item.id}
                            contentContainerStyle={{ paddingBottom: 20, paddingTop: 10 }}
                        />
                    </View>
                )}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.bg.primary,
    },
    filterContainer: {
        height: 50,
        justifyContent: 'center',
        marginBottom: 8,
    },
    filterPill: {
        backgroundColor: theme.colors.bg.secondary,
        height: 40,
        paddingHorizontal: 16,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: theme.colors.border.light,
        alignItems: 'center',
        justifyContent: 'center',
    },
    filterPillActive: {
        backgroundColor: theme.colors.accent.blue,
        borderColor: theme.colors.accent.blue,
    },
    filterText: {
        color: theme.colors.text.secondary,
        fontSize: 14,
        fontWeight: '500',
    },
    listContainer: {
        flex: 1,
    },
    verticalLine: {
        position: 'absolute',
        left: 20, // 16px padding + margin logic? user said "x=16px from left edge"
        // User said "positioned at x=16px from the left edge"
        top: 0, bottom: 0,
        width: 2,
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    eventRow: {
        marginBottom: 16,
        position: 'relative',
    },
    timelineDot: {
        position: 'absolute',
        left: 16, // centered on line (line at 16? line width 2. line left 16. dot size 10. dot left = 16 + 1 - 5 = 12?)
        // User said line at x=16. Dot centered on it.
        // Left 16 - (10/2) + (2/2) = 12?
        left: 12,
        top: 24, // Vertically align with card?
        width: 10, height: 10,
        borderRadius: 5,
        // Glow
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 8,
        elevation: 4,
        zIndex: 2,
    },
    card: {
        marginLeft: 44, // 16 + 28 = 44
        marginRight: 16,
        backgroundColor: theme.colors.bg.secondary,
        borderRadius: 12,
        padding: 16,
    },
    cardHeader: {
        flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4,
    },
    cardTitle: {
        color: 'white', fontSize: 14, fontWeight: '600',
    },
    cardTime: {
        color: theme.colors.text.muted, fontSize: 11,
    },
    cardDoc: {
        color: theme.colors.text.secondary, fontSize: 13, marginBottom: 2,
    },
    cardUser: {
        color: theme.colors.text.muted, fontSize: 12,
    },
    emptyContainer: {
        flex: 1, alignItems: 'center', justifyContent: 'center',
    },
    emptyTitle: {
        color: 'white', fontSize: 18, fontWeight: '600', marginTop: 16,
    },
    emptySub: {
        color: theme.colors.text.muted, fontSize: 14, marginTop: 4,
    }
});

export default SecurityLogScreen;
