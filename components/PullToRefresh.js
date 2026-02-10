/**
 * PullToRefresh Component
 * 
 * Custom animated pull-to-refresh with SecureShare branding
 */

import React, { memo, useRef, useState, useCallback } from 'react';
import {
    View,
    StyleSheet,
    Animated,
    PanResponder,
    ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import theme from '../theme';

const PULL_THRESHOLD = 80;
const MAX_PULL = 120;

const PullToRefresh = memo(({
    onRefresh,
    refreshing,
    children,
    enabled = true
}) => {
    const translateY = useRef(new Animated.Value(0)).current;
    const rotate = useRef(new Animated.Value(0)).current;
    const [isPulling, setIsPulling] = useState(false);

    const handleRefresh = useCallback(async () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        await onRefresh?.();
    }, [onRefresh]);

    const panResponder = useRef(
        PanResponder.create({
            onMoveShouldSetPanResponder: (_, gestureState) => {
                return enabled && gestureState.dy > 10;
            },
            onPanResponderMove: (_, gestureState) => {
                if (gestureState.dy > 0 && gestureState.dy <= MAX_PULL) {
                    translateY.setValue(gestureState.dy);

                    // Rotate based on pull distance
                    const rotateValue = (gestureState.dy / MAX_PULL) * 360;
                    rotate.setValue(rotateValue);

                    // Haptic at threshold
                    if (gestureState.dy >= PULL_THRESHOLD && !isPulling) {
                        setIsPulling(true);
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }
                }
            },
            onPanResponderRelease: (_, gestureState) => {
                if (gestureState.dy >= PULL_THRESHOLD) {
                    // Trigger refresh
                    Animated.spring(translateY, {
                        toValue: 60,
                        useNativeDriver: true,
                        friction: 8,
                    }).start();
                    handleRefresh();
                } else {
                    // Cancel
                    Animated.spring(translateY, {
                        toValue: 0,
                        useNativeDriver: true,
                        friction: 8,
                    }).start();
                }
                setIsPulling(false);
            },
        })
    ).current;

    // Reset when refreshing stops
    React.useEffect(() => {
        if (!refreshing) {
            Animated.spring(translateY, {
                toValue: 0,
                useNativeDriver: true,
                friction: 6,
            }).start();
        }
    }, [refreshing, translateY]);

    const rotateInterpolate = rotate.interpolate({
        inputRange: [0, 360],
        outputRange: ['0deg', '360deg'],
    });

    const scale = translateY.interpolate({
        inputRange: [0, PULL_THRESHOLD],
        outputRange: [0.5, 1],
        extrapolate: 'clamp',
    });

    const opacity = translateY.interpolate({
        inputRange: [0, PULL_THRESHOLD / 2, PULL_THRESHOLD],
        outputRange: [0, 0.5, 1],
        extrapolate: 'clamp',
    });

    return (
        <View style={styles.container} {...panResponder.panHandlers}>
            {/* Refresh indicator */}
            <Animated.View
                style={[
                    styles.refreshContainer,
                    {
                        opacity,
                        transform: [
                            { scale },
                            { translateY: Animated.subtract(translateY, 40) },
                        ],
                    },
                ]}
            >
                {refreshing ? (
                    <ActivityIndicator color={theme.colors.accent.blue} size="small" />
                ) : (
                    <Animated.View style={{ transform: [{ rotate: rotateInterpolate }] }}>
                        <Ionicons
                            name="shield-checkmark"
                            size={24}
                            color={isPulling ? theme.colors.accent.blue : theme.colors.text.muted}
                        />
                    </Animated.View>
                )}
            </Animated.View>

            {/* Content */}
            <Animated.View
                style={[
                    styles.content,
                    { transform: [{ translateY }] },
                ]}
            >
                {children}
            </Animated.View>
        </View>
    );
});

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    refreshContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        alignItems: 'center',
        justifyContent: 'center',
        height: 60,
        zIndex: 1,
    },
    content: {
        flex: 1,
    },
});

PullToRefresh.displayName = 'PullToRefresh';

export default PullToRefresh;
