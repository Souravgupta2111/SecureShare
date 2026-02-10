/**
 * DocCard - Enhanced Document Card Component
 * 
 * Google Drive-inspired document card with:
 * - File type icons (PDF, DOC, XLS, etc.)
 * - Thumbnail previews for images
 * - Bulk selection support
 * - Smooth animations
 * - Status indicators
 */

import React, { useRef, useCallback, memo, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Image } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import PropTypes from 'prop-types';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../context/ThemeContext';

// Exported constants for FlatList optimization
export const DOC_CARD_HEIGHT = 72;
export const DOC_CARD_MARGIN_VERTICAL = 2;
export const DOC_CARD_ITEM_HEIGHT = DOC_CARD_HEIGHT + DOC_CARD_MARGIN_VERTICAL;

// File type icon mapping
const FILE_ICONS = {
    pdf: { icon: 'file-pdf-box', color: '#EA4335' },
    doc: { icon: 'file-word-box', color: '#4285F4' },
    docx: { icon: 'file-word-box', color: '#4285F4' },
    xls: { icon: 'file-excel-box', color: '#34A853' },
    xlsx: { icon: 'file-excel-box', color: '#34A853' },
    ppt: { icon: 'file-powerpoint-box', color: '#FBBC04' },
    pptx: { icon: 'file-powerpoint-box', color: '#FBBC04' },
    txt: { icon: 'file-document-outline', color: '#5F6368' },
    zip: { icon: 'folder-zip', color: '#5F6368' },
    image: { icon: 'file-image', color: '#4285F4' },
    default: { icon: 'file-document', color: '#5F6368' },
};

const DocCard = ({
    document,
    onPress,
    onLongPress,
    isSelected = false,
    selectionMode = false,
}) => {
    const { theme } = useTheme();
    const scaleAnim = useRef(new Animated.Value(1)).current;

    // Get file extension and icon
    const fileInfo = useMemo(() => {
        const ext = document.filename?.split('.').pop()?.toLowerCase() || '';
        if (document.fileType === 'image' || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
            return FILE_ICONS.image;
        }
        return FILE_ICONS[ext] || FILE_ICONS.default;
    }, [document.filename, document.fileType]);

    // Compute status
    const computedStatus = useMemo(() => {
        let status = document.status;
        if (status === 'active' && document.expiresAt) {
            const timeRemaining = document.expiresAt - Date.now();
            if (timeRemaining < 86400000) { // Less than 24 hours
                status = 'expiring_soon';
            }
        }
        return status;
    }, [document.status, document.expiresAt]);

    // Status colors
    const statusConfig = useMemo(() => {
        switch (computedStatus) {
            case 'active':
                return { color: theme.colors.status.success, label: 'Active' };
            case 'expiring_soon':
                return { color: theme.colors.status.warning, label: 'Expiring' };
            case 'expired':
                return { color: theme.colors.status.expired, label: 'Expired' };
            case 'revoked':
                return { color: theme.colors.status.danger, label: 'Revoked' };
            default:
                return { color: theme.colors.text.muted, label: '' };
        }
    }, [computedStatus, theme]);

    // Time ago helper
    const timeAgo = useMemo(() => {
        const timestamp = document.sharedAt || document.createdAt;
        if (!timestamp) return '';

        const diff = Date.now() - timestamp;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days < 7) return `${days}d ago`;
        return new Date(timestamp).toLocaleDateString();
    }, [document.sharedAt, document.createdAt]);

    // Recipient count
    const recipientCount = document.recipients?.length || 0;

    // Animations
    const handlePressIn = useCallback(() => {
        Animated.spring(scaleAnim, {
            toValue: 0.98,
            friction: 8,
            tension: 100,
            useNativeDriver: true,
        }).start();
    }, [scaleAnim]);

    const handlePressOut = useCallback(() => {
        Animated.spring(scaleAnim, {
            toValue: 1,
            friction: 8,
            tension: 100,
            useNativeDriver: true,
        }).start();
    }, [scaleAnim]);

    const handlePress = useCallback(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.(document);
    }, [onPress, document]);

    const handleLongPress = useCallback(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onLongPress?.(document);
    }, [onLongPress, document]);

    const styles = useMemo(() => createStyles(theme, isSelected), [theme, isSelected]);

    return (
        <Pressable
            onPress={handlePress}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            onLongPress={handleLongPress}
            delayLongPress={300}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel={`${document.filename}, ${recipientCount} recipients, ${computedStatus}`}
        >
            <Animated.View style={[
                styles.container,
                { transform: [{ scale: scaleAnim }] }
            ]}>
                {/* Selection Checkbox */}
                {selectionMode && (
                    <View style={styles.checkboxContainer}>
                        <View style={[
                            styles.checkbox,
                            isSelected && styles.checkboxSelected
                        ]}>
                            {isSelected && (
                                <Ionicons name="checkmark" size={16} color="white" />
                            )}
                        </View>
                    </View>
                )}

                {/* File Icon or Thumbnail */}
                <View style={styles.iconContainer}>
                    {document.thumbnailUri ? (
                        <Image
                            source={{ uri: document.thumbnailUri }}
                            style={styles.thumbnail}
                            resizeMode="cover"
                        />
                    ) : (
                        <MaterialCommunityIcons
                            name={fileInfo.icon}
                            size={32}
                            color={fileInfo.color}
                        />
                    )}
                </View>

                {/* Content */}
                <View style={styles.content}>
                    <Text style={styles.filename} numberOfLines={1}>
                        {document.filename}
                    </Text>
                    <View style={styles.metaRow}>
                        {recipientCount > 0 && (
                            <Text style={styles.meta}>
                                {recipientCount} recipient{recipientCount !== 1 ? 's' : ''}
                            </Text>
                        )}
                        {timeAgo && (
                            <>
                                <Text style={styles.metaDot}>•</Text>
                                <Text style={styles.meta}>{timeAgo}</Text>
                            </>
                        )}
                    </View>
                </View>

                {/* Status Indicator */}
                <View style={styles.statusContainer}>
                    {computedStatus === 'expiring_soon' && (
                        <Ionicons
                            name="time-outline"
                            size={16}
                            color={statusConfig.color}
                        />
                    )}
                    {computedStatus === 'expired' && (
                        <Ionicons
                            name="close-circle-outline"
                            size={16}
                            color={statusConfig.color}
                        />
                    )}
                    {computedStatus === 'revoked' && (
                        <Ionicons
                            name="ban-outline"
                            size={16}
                            color={statusConfig.color}
                        />
                    )}
                    <Ionicons
                        name="chevron-forward"
                        size={18}
                        color={theme.colors.text.muted}
                    />
                </View>
            </Animated.View>
        </Pressable>
    );
};

const createStyles = (theme, isSelected) => StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: isSelected ? theme.colors.accent.surface : theme.colors.bg.secondary,
        marginHorizontal: 12,
        marginVertical: 1,
        paddingHorizontal: 12,
        paddingVertical: 12,
        borderRadius: theme.radius.md,
        borderWidth: isSelected ? 1 : 0,
        borderColor: isSelected ? theme.colors.accent.primary : 'transparent',
        minHeight: DOC_CARD_HEIGHT,
    },
    checkboxContainer: {
        marginRight: 12,
    },
    checkbox: {
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 2,
        borderColor: theme.colors.border.default,
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkboxSelected: {
        backgroundColor: theme.colors.accent.primary,
        borderColor: theme.colors.accent.primary,
    },
    iconContainer: {
        width: 44,
        height: 44,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.bg.tertiary,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
        overflow: 'hidden',
    },
    thumbnail: {
        width: 44,
        height: 44,
        borderRadius: theme.radius.sm,
    },
    content: {
        flex: 1,
        justifyContent: 'center',
    },
    filename: {
        fontSize: 15,
        fontWeight: '500',
        color: theme.colors.text.primary,
        marginBottom: 2,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    meta: {
        fontSize: 13,
        color: theme.colors.text.secondary,
    },
    metaDot: {
        fontSize: 13,
        color: theme.colors.text.muted,
        marginHorizontal: 4,
    },
    statusContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginLeft: 8,
    },
});

DocCard.propTypes = {
    document: PropTypes.shape({
        uuid: PropTypes.string,
        id: PropTypes.string,
        filename: PropTypes.string.isRequired,
        fileType: PropTypes.string,
        status: PropTypes.string,
        expiresAt: PropTypes.number,
        sharedAt: PropTypes.number,
        createdAt: PropTypes.number,
        thumbnailUri: PropTypes.string,
        recipients: PropTypes.array,
    }).isRequired,
    onPress: PropTypes.func.isRequired,
    onLongPress: PropTypes.func,
    isSelected: PropTypes.bool,
    selectionMode: PropTypes.bool,
};

export default memo(DocCard, (prevProps, nextProps) => {
    return prevProps.document?.uuid === nextProps.document?.uuid &&
        prevProps.document?.id === nextProps.document?.id &&
        prevProps.document?.status === nextProps.document?.status &&
        prevProps.isSelected === nextProps.isSelected &&
        prevProps.selectionMode === nextProps.selectionMode;
});
