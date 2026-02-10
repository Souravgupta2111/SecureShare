/**
 * SwipeableDocCard Component
 * 
 * Document card with swipe actions:
 * - Swipe left: Delete, Revoke
 * - Swipe right: Star, Offline
 * - Selection Mode support
 * - Theme-aware colors (white text in dark, black in light)
 */

import React, { memo, useRef, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Animated,
    PanResponder,
    Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../context/ThemeContext';
import ThumbnailPreview from './ThumbnailPreview';


const SWIPE_THRESHOLD = 80;
const ACTION_WIDTH = 70;

const SwipeableDocCard = memo(function SwipeableDocCard({
    document,
    onPress,
    onLongPress,
    onStar,
    onOffline,
    onRevoke,
    onDelete,
    isStarred,
    isOffline,
    isSelected,
    selectionMode,
    onMorePress,
}) {
    const { theme, isDark } = useTheme();
    const translateX = useRef(new Animated.Value(0)).current;
    const isSwipingRef = useRef(false);

    // Dynamic styles based on theme
    const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);

    const resetPosition = useCallback(() => {
        Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            friction: 8,
        }).start();
    }, [translateX]);

    const panResponder = useRef(
        PanResponder.create({
            onMoveShouldSetPanResponder: (_, gestureState) => {
                return Math.abs(gestureState.dx) > 10;
            },
            onPanResponderGrant: () => {
                isSwipingRef.current = true;
            },
            onPanResponderMove: (_, gestureState) => {
                const newX = Math.max(-ACTION_WIDTH * 2, Math.min(ACTION_WIDTH * 2, gestureState.dx));
                translateX.setValue(newX);
            },
            onPanResponderRelease: (_, gestureState) => {
                isSwipingRef.current = false;

                if (gestureState.dx > SWIPE_THRESHOLD) {
                    Animated.spring(translateX, {
                        toValue: ACTION_WIDTH * 2,
                        useNativeDriver: true,
                        friction: 8,
                    }).start();
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                } else if (gestureState.dx < -SWIPE_THRESHOLD) {
                    Animated.spring(translateX, {
                        toValue: -ACTION_WIDTH * 2,
                        useNativeDriver: true,
                        friction: 8,
                    }).start();
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                } else {
                    resetPosition();
                }
            },
        })
    ).current;

    const formatDate = (timestamp) => {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        const now = new Date();
        const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    const formatSize = (size) => {
        if (!size) return null;
        if (size < 1024) return `${size} B`;
        if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
        return `${(size / 1024 / 1024).toFixed(1)} MB`;
    };

    const handleStarPress = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onStar?.(document.uuid, !isStarred);
        resetPosition();
    };

    const handleOfflinePress = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onOffline?.(document.uuid, !isOffline);
        resetPosition();
    };

    const handleRevokePress = () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        onRevoke?.(document.uuid);
        resetPosition();
    };

    const handleDeletePress = () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        onDelete?.(document.uuid);
        resetPosition();
    };

    const sizeText = formatSize(document.size);
    const dateText = formatDate(document.created_at || document.sharedAt);

    return (
        <View style={styles.container}>
            {/* Left Actions (revealed on swipe right) */}
            <View style={styles.leftActions}>
                <Pressable style={[styles.action, styles.starAction]} onPress={handleStarPress}>
                    <Ionicons name={isStarred ? 'star' : 'star-outline'} size={20} color="white" />
                    <Text style={styles.actionText}>{isStarred ? 'Unstar' : 'Star'}</Text>
                </Pressable>
                <Pressable style={[styles.action, styles.offlineAction]} onPress={handleOfflinePress}>
                    <Ionicons name={isOffline ? 'cloud-offline' : 'cloud-download-outline'} size={20} color="white" />
                    <Text style={styles.actionText}>{isOffline ? 'Remove' : 'Offline'}</Text>
                </Pressable>
            </View>

            {/* Right Actions (revealed on swipe left) */}
            <View style={styles.rightActions}>
                <Pressable style={[styles.action, styles.revokeAction]} onPress={handleRevokePress}>
                    <Ionicons name="ban-outline" size={20} color="white" />
                    <Text style={styles.actionText}>Revoke</Text>
                </Pressable>
                <Pressable style={[styles.action, styles.deleteAction]} onPress={handleDeletePress}>
                    <Ionicons name="trash-outline" size={20} color="white" />
                    <Text style={styles.actionText}>Delete</Text>
                </Pressable>
            </View>

            {/* Main Card */}
            <Animated.View
                style={[styles.card, { transform: [{ translateX: selectionMode ? 0 : translateX }] }]}
                {...(!selectionMode ? panResponder.panHandlers : {})}
            >
                <Pressable
                    onPress={() => onPress?.(document)}
                    onLongPress={onLongPress}
                    delayLongPress={300}
                    style={[styles.cardContent, isSelected && styles.selectedCard]}
                    android_ripple={{ color: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }}
                >
                    {/* Selection Checkbox */}
                    {selectionMode && (
                        <View style={styles.selectionIndicator}>
                            <Ionicons
                                name={isSelected ? "checkmark-circle" : "ellipse-outline"}
                                size={22}
                                color={isSelected ? theme.colors.accent.primary : theme.colors.text.muted}
                            />
                        </View>
                    )}

                    {/* Thumbnail */}
                    <View style={styles.iconContainer}>
                        <ThumbnailPreview
                            mimeType={document.mimeType}
                            thumbnailUri={document.thumbnailPath}
                            size={40}
                        />
                    </View>

                    {/* Document Info */}
                    <View style={styles.infoContainer}>
                        <View style={styles.titleRow}>
                            <Text style={styles.docName} numberOfLines={1}>
                                {document.name || document.filename}
                            </Text>
                            {isStarred && (
                                <Ionicons name="star" size={12} color={theme.colors.accent.warning} style={styles.starBadge} />
                            )}
                        </View>

                        <View style={styles.metaRow}>
                            {dateText && (
                                <Text style={styles.metaText}>{dateText}</Text>
                            )}
                            {sizeText && (
                                <>
                                    <Text style={styles.metaDot}>•</Text>
                                    <Text style={styles.metaText}>{sizeText}</Text>
                                </>
                            )}
                            {!sizeText && document.isCloud && (
                                <>
                                    <Text style={styles.metaDot}>•</Text>
                                    <Ionicons name="cloud-outline" size={11} color={theme.colors.text.muted} />
                                </>
                            )}
                            {isOffline && (
                                <>
                                    <Text style={styles.metaDot}>•</Text>
                                    <Ionicons name="checkmark-circle" size={11} color={theme.colors.status.success} />
                                </>
                            )}
                        </View>
                    </View>

                    {/* More Button */}
                    {!selectionMode && (
                        <Pressable onPress={onMorePress} style={styles.moreBtn} hitSlop={12}>
                            <Ionicons name="ellipsis-vertical" size={18} color={theme.colors.text.secondary} />
                        </Pressable>
                    )}
                </Pressable>
            </Animated.View>
        </View>
    );
});

const createStyles = (theme, isDark) => StyleSheet.create({
    container: {
        marginHorizontal: 12,
        marginBottom: 8,
        height: 68,
        position: 'relative',
    },
    card: {
        position: 'absolute',
        left: 0,
        right: 0,
        height: '100%',
        backgroundColor: theme.colors.bg.secondary,
        borderRadius: 14,
        zIndex: 2,
        // Subtle shadow
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: isDark ? 0.3 : 0.08,
        shadowRadius: 3,
        elevation: 2,
    },
    cardContent: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 12,
        height: '100%',
        borderRadius: 14,
        overflow: 'hidden',
    },
    selectedCard: {
        backgroundColor: isDark ? 'rgba(61, 122, 255, 0.12)' : 'rgba(61, 122, 255, 0.08)',
        borderWidth: 1.5,
        borderColor: theme.colors.accent.primary,
    },
    selectionIndicator: {
        marginRight: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    iconContainer: {
        width: 42,
        height: 42,
        borderRadius: 10,
        backgroundColor: isDark ? 'rgba(61, 122, 255, 0.12)' : 'rgba(61, 122, 255, 0.08)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    infoContainer: {
        flex: 1,
        justifyContent: 'center',
        marginRight: 8,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
    },
    docName: {
        color: theme.colors.text.primary, // White in dark, black in light
        fontSize: 15,
        fontWeight: '600',
        flex: 1,
        letterSpacing: -0.2,
    },
    starBadge: {
        marginLeft: 6,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    metaText: {
        color: theme.colors.text.secondary,
        fontSize: 12,
        fontWeight: '400',
    },
    metaDot: {
        color: theme.colors.text.muted,
        fontSize: 12,
        marginHorizontal: 5,
    },
    moreBtn: {
        padding: 6,
        marginLeft: 4,
    },
    // Swipe Actions
    leftActions: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        flexDirection: 'row',
        borderRadius: 14,
        overflow: 'hidden',
        zIndex: 1,
    },
    rightActions: {
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        flexDirection: 'row',
        borderRadius: 14,
        overflow: 'hidden',
        zIndex: 1,
    },
    action: {
        width: ACTION_WIDTH,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 3,
    },
    actionText: {
        color: 'white',
        fontSize: 10,
        fontWeight: '600',
    },
    starAction: {
        backgroundColor: '#F59E0B', // Amber
    },
    offlineAction: {
        backgroundColor: '#10B981', // Emerald
    },
    revokeAction: {
        backgroundColor: '#F97316', // Orange
    },
    deleteAction: {
        backgroundColor: '#EF4444', // Red
    },
});

SwipeableDocCard.displayName = 'SwipeableDocCard';

export default SwipeableDocCard;
