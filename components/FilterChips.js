/**
 * FilterChips Component
 * 
 * Simplified filter: All + Filter dropdown
 */

import React, { memo, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    Animated,
    Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import theme from '../theme';

const FILTERS = [
    { id: 'all', label: 'All', icon: 'apps-outline' },
    { id: 'starred', label: 'Starred', icon: 'star' },
    { id: 'recent', label: 'Recent', icon: 'time-outline' },
    { id: 'offline', label: 'Offline', icon: 'cloud-offline-outline' },
    { id: 'active', label: 'Active', icon: 'checkmark-circle-outline' },
    { id: 'expired', label: 'Expired', icon: 'close-circle-outline' },
    { id: 'trash', label: 'Bin', icon: 'trash-outline' },
];

const FilterChips = ({ activeFilter, onFilterChange, counts = {} }) => {
    const [modalVisible, setModalVisible] = useState(false);
    const scaleAnim = useRef(new Animated.Value(1)).current;

    const handlePressIn = () => {
        Animated.spring(scaleAnim, {
            toValue: 0.95,
            useNativeDriver: true,
            friction: 8,
        }).start();
    };

    const handlePressOut = () => {
        Animated.spring(scaleAnim, {
            toValue: 1,
            useNativeDriver: true,
            friction: 8,
        }).start();
    };

    const handleAllPress = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onFilterChange('all');
    };

    const handleFilterPress = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setModalVisible(true);
    };

    const selectFilter = (filterId) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onFilterChange(filterId);
        setModalVisible(false);
    };

    const isAllActive = activeFilter === 'all';
    const currentFilter = FILTERS.find(f => f.id === activeFilter) || FILTERS[0];

    return (
        <View style={styles.container}>
            {/* All Chip */}
            <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                <Pressable
                    onPressIn={handlePressIn}
                    onPressOut={handlePressOut}
                    onPress={handleAllPress}
                    style={[styles.chip, isAllActive && styles.chipActive]}
                >
                    <Ionicons
                        name="apps-outline"
                        size={16}
                        color={isAllActive ? 'white' : theme.colors.text.muted}
                    />
                    <Text style={[styles.chipText, isAllActive && styles.chipTextActive]}>
                        All
                    </Text>
                    {counts.all > 0 && (
                        <View style={styles.countBadge}>
                            <Text style={styles.countText}>{counts.all}</Text>
                        </View>
                    )}
                </Pressable>
            </Animated.View>

            {/* Filter Chip */}
            <Pressable
                onPress={handleFilterPress}
                style={[styles.chip, !isAllActive && styles.chipActive]}
            >
                <Ionicons
                    name={isAllActive ? 'filter-outline' : currentFilter.icon}
                    size={16}
                    color={!isAllActive ? 'white' : theme.colors.text.muted}
                />
                <Text style={[styles.chipText, !isAllActive && styles.chipTextActive]}>
                    {isAllActive ? 'Filter' : currentFilter.label}
                </Text>
                <Ionicons
                    name="chevron-down"
                    size={14}
                    color={!isAllActive ? 'white' : theme.colors.text.muted}
                />
            </Pressable>

            {/* Filter Modal */}
            <Modal
                visible={modalVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setModalVisible(false)}
            >
                <Pressable
                    style={styles.modalBackdrop}
                    onPress={() => setModalVisible(false)}
                >
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Filter by</Text>
                        {FILTERS.map((filter) => (
                            <Pressable
                                key={filter.id}
                                style={[
                                    styles.filterOption,
                                    activeFilter === filter.id && styles.filterOptionActive
                                ]}
                                onPress={() => selectFilter(filter.id)}
                            >
                                <Ionicons
                                    name={filter.icon}
                                    size={20}
                                    color={activeFilter === filter.id ? theme.colors.accent.primary : theme.colors.text.secondary}
                                />
                                <Text style={[
                                    styles.filterOptionText,
                                    activeFilter === filter.id && styles.filterOptionTextActive
                                ]}>
                                    {filter.label}
                                </Text>
                                {counts[filter.id] > 0 && (
                                    <Text style={styles.filterCount}>{counts[filter.id]}</Text>
                                )}
                                {activeFilter === filter.id && (
                                    <Ionicons
                                        name="checkmark"
                                        size={20}
                                        color={theme.colors.accent.primary}
                                        style={styles.checkmark}
                                    />
                                )}
                            </Pressable>
                        ))}
                    </View>
                </Pressable>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        gap: 10,
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        height: 40,
        paddingHorizontal: 16,
        borderRadius: 20,
        backgroundColor: theme.colors.bg.secondary,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    chipActive: {
        backgroundColor: theme.colors.accent.blue,
        borderColor: theme.colors.accent.blue,
    },
    chipText: {
        fontSize: 14,
        fontWeight: '500',
        color: theme.colors.text.secondary,
    },
    chipTextActive: {
        color: 'white',
    },
    countBadge: {
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 10,
        paddingHorizontal: 6,
        paddingVertical: 2,
        marginLeft: 2,
    },
    countText: {
        color: 'white',
        fontSize: 11,
        fontWeight: '600',
    },
    modalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    modalContent: {
        backgroundColor: theme.colors.bg.secondary,
        borderRadius: 16,
        padding: 20,
        width: '100%',
        maxWidth: 320,
        borderWidth: 1,
        borderColor: theme.colors.border.subtle,
    },
    modalTitle: {
        color: 'white',
        fontSize: 18,
        fontWeight: '700',
        marginBottom: 16,
        textAlign: 'center',
    },
    filterOption: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 14,
        paddingHorizontal: 12,
        borderRadius: 10,
        marginBottom: 4,
    },
    filterOptionActive: {
        backgroundColor: 'rgba(59, 130, 246, 0.15)',
    },
    filterOptionText: {
        flex: 1,
        color: theme.colors.text.secondary,
        fontSize: 15,
        fontWeight: '500',
    },
    filterOptionTextActive: {
        color: theme.colors.accent.primary,
    },
    filterCount: {
        color: theme.colors.text.muted,
        fontSize: 13,
    },
    checkmark: {
        marginLeft: 8,
    },
});

export { FILTERS };
export default memo(FilterChips);
