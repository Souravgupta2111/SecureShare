/**
 * FolderCard Component
 * 
 * Folder item with icon, name, and document count badge.
 */

import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import theme from '../theme';

const FolderCard = ({ folder, documentCount = 0, onPress, onLongPress, isSelected = false }) => {
    const handlePress = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.(folder);
    };

    const handleLongPress = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onLongPress?.(folder);
    };

    return (
        <Pressable
            onPress={handlePress}
            onLongPress={handleLongPress}
            style={({ pressed }) => [
                styles.container,
                isSelected && styles.selected,
                pressed && styles.pressed,
            ]}
        >
            <View style={[styles.iconContainer, { backgroundColor: folder.color + '20' }]}>
                <Ionicons
                    name={folder.icon || 'folder'}
                    size={24}
                    color={folder.color || theme.colors.accent.blue}
                />
            </View>
            <View style={styles.content}>
                <Text style={styles.name} numberOfLines={1}>{folder.name}</Text>
                <Text style={styles.count}>
                    {documentCount} {documentCount === 1 ? 'document' : 'documents'}
                </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.text.muted} />
        </Pressable>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.bg.secondary,
        borderRadius: 12,
        padding: 14,
        marginHorizontal: 16,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    selected: {
        borderColor: theme.colors.accent.blue,
        backgroundColor: 'rgba(61, 122, 255, 0.1)',
    },
    pressed: {
        opacity: 0.8,
        transform: [{ scale: 0.98 }],
    },
    iconContainer: {
        width: 44,
        height: 44,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    content: {
        flex: 1,
    },
    name: {
        color: 'white',
        fontSize: 15,
        fontWeight: '600',
        marginBottom: 2,
    },
    count: {
        color: theme.colors.text.muted,
        fontSize: 12,
    },
});

export default FolderCard;
