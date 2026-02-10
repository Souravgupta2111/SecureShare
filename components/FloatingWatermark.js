/**
 * FloatingWatermark Component
 * 
 * Dynamic visible watermark that moves across the screen
 * to deter camera capture and ensure attribution.
 */

import React, { useEffect, useRef, memo } from 'react';
import { View, Text, StyleSheet, Dimensions, Animated } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Watermark dimensions
const WATERMARK_WIDTH = 280;
const WATERMARK_HEIGHT = 40;
const PADDING = 20;

// Animation config
const MIN_INTERVAL = 3000; // 3 seconds
const MAX_INTERVAL = 7000; // 7 seconds

const FloatingWatermark = memo(function FloatingWatermark({ recipientEmail, timestamp }) {
    const positionX = useRef(new Animated.Value(0)).current;
    const positionY = useRef(new Animated.Value(0)).current;
    const rotation = useRef(new Animated.Value(0)).current;
    const opacity = useRef(new Animated.Value(0.15)).current;

    // Format timestamp for display
    const formatTime = () => {
        const date = new Date(timestamp || Date.now());
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    // Get random position
    const getRandomPosition = () => {
        const maxX = SCREEN_WIDTH - WATERMARK_WIDTH - PADDING;
        const maxY = SCREEN_HEIGHT - WATERMARK_HEIGHT - PADDING - 100; // Account for header/footer

        return {
            x: PADDING + Math.random() * maxX,
            y: PADDING + 80 + Math.random() * maxY, // Start below header
        };
    };

    // Get random rotation (-5 to 5 degrees)
    const getRandomRotation = () => {
        return (Math.random() - 0.5) * 10;
    };

    // Animate to new position
    const animateToNewPosition = () => {
        const newPos = getRandomPosition();
        const newRotation = getRandomRotation();

        Animated.parallel([
            Animated.timing(positionX, {
                toValue: newPos.x,
                duration: 1000,
                useNativeDriver: true,
            }),
            Animated.timing(positionY, {
                toValue: newPos.y,
                duration: 1000,
                useNativeDriver: true,
            }),
            Animated.timing(rotation, {
                toValue: newRotation,
                duration: 1000,
                useNativeDriver: true,
            }),
            // Subtle opacity pulse
            Animated.sequence([
                Animated.timing(opacity, {
                    toValue: 0.12,
                    duration: 500,
                    useNativeDriver: true,
                }),
                Animated.timing(opacity, {
                    toValue: 0.18,
                    duration: 500,
                    useNativeDriver: true,
                }),
            ]),
        ]).start();
    };

    useEffect(() => {
        const initialPos = getRandomPosition();
        positionX.setValue(initialPos.x);
        positionY.setValue(initialPos.y);

        const scheduleNextMove = () => {
            const delay = MIN_INTERVAL + Math.random() * (MAX_INTERVAL - MIN_INTERVAL);
            return setTimeout(() => {
                animateToNewPosition();
                scheduleNextMove();
            }, delay);
        };

        const timeoutId = scheduleNextMove();

        return () => {
            clearTimeout(timeoutId);
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const rotateInterpolate = rotation.interpolate({
        inputRange: [-10, 10],
        outputRange: ['-10deg', '10deg'],
    });

    return (
        <Animated.View
            style={[
                styles.container,
                {
                    transform: [
                        { translateX: positionX },
                        { translateY: positionY },
                        { rotate: rotateInterpolate },
                    ],
                    opacity: opacity,
                },
            ]}
            pointerEvents="none"
        >
            <Text style={styles.watermarkText} numberOfLines={1}>
                {recipientEmail || 'recipient@email.com'} • {formatTime()} • SecureShare
            </Text>
        </Animated.View>
    );
});

// Static repeating background watermark (additional layer)
export const WatermarkBackground = memo(function WatermarkBackground({ recipientEmail }) {
    const items = [];
    const cols = 3;
    const rows = 8;

    for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
            items.push(
                <View
                    key={`${i}-${j}`}
                    style={[
                        styles.bgWatermark,
                        {
                            left: `${(j / cols) * 100}%`,
                            top: `${(i / rows) * 100}%`,
                            transform: [{ rotate: '-30deg' }],
                        },
                    ]}
                >
                    <Text style={styles.bgWatermarkText}>
                        {recipientEmail || 'Protected'}
                    </Text>
                </View>
            );
        }
    }

    return (
        <View style={styles.bgContainer} pointerEvents="none">
            {items}
        </View>
    );
});

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        zIndex: 9999,
        padding: 8,
        backgroundColor: 'rgba(0,0,0,0.3)',
        borderRadius: 4,
    },
    watermarkText: {
        color: 'rgba(255,255,255,0.9)',
        fontSize: 11,
        fontWeight: '500',
        letterSpacing: 0.5,
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 2,
    },
    bgContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: 'hidden',
        opacity: 0.03,
    },
    bgWatermark: {
        position: 'absolute',
    },
    bgWatermarkText: {
        color: 'white',
        fontSize: 14,
        fontWeight: '600',
    },
});

export default FloatingWatermark;
