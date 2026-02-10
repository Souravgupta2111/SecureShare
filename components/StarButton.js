/**
 * StarButton Component
 * 
 * Animated star toggle button with burst effect
 * Used for marking documents as favorites
 */

import React, { memo, useRef } from 'react';
import { Pressable, StyleSheet, Animated, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

const STAR_COLORS = {
    active: '#FFD700', // Gold
    inactive: 'rgba(255,255,255,0.3)',
};

const StarButton = memo(({ isStarred, onToggle, size = 22 }) => {
    const scaleAnim = useRef(new Animated.Value(1)).current;
    const rotateAnim = useRef(new Animated.Value(0)).current;
    const burstAnim = useRef(new Animated.Value(0)).current;

    const handlePress = () => {
        // Haptic feedback
        Haptics.impactAsync(
            isStarred
                ? Haptics.ImpactFeedbackStyle.Light
                : Haptics.ImpactFeedbackStyle.Medium
        );

        // Animation sequence
        if (!isStarred) {
            // Starring animation - burst effect
            Animated.parallel([
                Animated.sequence([
                    Animated.timing(scaleAnim, {
                        toValue: 1.4,
                        duration: 150,
                        useNativeDriver: true,
                    }),
                    Animated.spring(scaleAnim, {
                        toValue: 1,
                        friction: 3,
                        useNativeDriver: true,
                    }),
                ]),
                Animated.sequence([
                    Animated.timing(rotateAnim, {
                        toValue: 1,
                        duration: 150,
                        useNativeDriver: true,
                    }),
                    Animated.timing(rotateAnim, {
                        toValue: 0,
                        duration: 150,
                        useNativeDriver: true,
                    }),
                ]),
                Animated.sequence([
                    Animated.timing(burstAnim, {
                        toValue: 1,
                        duration: 200,
                        useNativeDriver: true,
                    }),
                    Animated.timing(burstAnim, {
                        toValue: 0,
                        duration: 200,
                        useNativeDriver: true,
                    }),
                ]),
            ]).start();
        } else {
            // Unstarring animation - simple shrink
            Animated.sequence([
                Animated.timing(scaleAnim, {
                    toValue: 0.7,
                    duration: 100,
                    useNativeDriver: true,
                }),
                Animated.spring(scaleAnim, {
                    toValue: 1,
                    friction: 5,
                    useNativeDriver: true,
                }),
            ]).start();
        }

        onToggle(!isStarred);
    };

    const rotate = rotateAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '72deg'], // One point of star
    });

    const burstScale = burstAnim.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [0.5, 1.5, 2],
    });

    const burstOpacity = burstAnim.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [0.8, 0.4, 0],
    });

    return (
        <Pressable
            onPress={handlePress}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={isStarred ? 'Remove from starred' : 'Add to starred'}
            accessibilityState={{ checked: isStarred }}
            style={styles.container}
        >
            {/* Burst effect */}
            <Animated.View
                style={[
                    styles.burst,
                    {
                        transform: [{ scale: burstScale }],
                        opacity: burstOpacity,
                    },
                ]}
                pointerEvents="none"
            >
                <View style={[styles.burstRing, { width: size * 2, height: size * 2 }]} />
            </Animated.View>

            {/* Star icon */}
            <Animated.View
                style={{
                    transform: [{ scale: scaleAnim }, { rotate }],
                }}
            >
                <Ionicons
                    name={isStarred ? 'star' : 'star-outline'}
                    size={size}
                    color={isStarred ? STAR_COLORS.active : STAR_COLORS.inactive}
                />
            </Animated.View>
        </Pressable>
    );
});

const styles = StyleSheet.create({
    container: {
        padding: 4,
        justifyContent: 'center',
        alignItems: 'center',
    },
    burst: {
        position: 'absolute',
        justifyContent: 'center',
        alignItems: 'center',
    },
    burstRing: {
        borderRadius: 100,
        borderWidth: 2,
        borderColor: STAR_COLORS.active,
    },
});

StarButton.displayName = 'StarButton';

export default StarButton;
