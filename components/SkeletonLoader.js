import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import theme from '../theme';

const AnimatedGradient = Animated.createAnimatedComponent(LinearGradient);

const ShimmerBlock = ({ width, height, style }) => {
    const translateX = useRef(new Animated.Value(-1)).current; // -100% to 100%

    useEffect(() => {
        Animated.loop(
            Animated.timing(translateX, {
                toValue: 1,
                duration: 1200,
                easing: Easing.linear,
                useNativeDriver: true,
            })
        ).start();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // We translate from -width to width? Or percentage.
    // Using interpolation
    const translateInterp = translateX.interpolate({
        inputRange: [-1, 1],
        outputRange: [-width, width] // Move across the block width
    });

    return (
        <View style={[styles.shimmerContainer, { width, height }, style]}>
            <AnimatedGradient
                colors={['transparent', 'rgba(255,255,255,0.1)', 'transparent']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={[
                    StyleSheet.absoluteFill,
                    { transform: [{ translateX: translateInterp }] }
                ]}
            />
        </View>
    );
};

const SkeletonLoader = () => {
    return (
        <View style={styles.container}>
            {/* Stats Bar Skeleton */}
            <View style={styles.statsBar}>
                {/* 3 blocks */}
                <ShimmerBlock width={80} height={40} />
                <ShimmerBlock width={80} height={40} />
                <ShimmerBlock width={80} height={40} />
            </View>

            {/* Doc Cards */}
            <View style={styles.cardsContainer}>
                {[1, 2, 3].map((i) => (
                    <View key={i} style={styles.cardSkeleton}>
                        <View style={styles.cardRow}>
                            <ShimmerBlock width={40} height={40} style={{ borderRadius: 10 }} />
                            <ShimmerBlock width={80} height={20} style={{ borderRadius: 100 }} />
                        </View>
                        <ShimmerBlock width={200} height={20} style={{ marginTop: 15, borderRadius: 4 }} />
                        <ShimmerBlock width={150} height={15} style={{ marginTop: 8, borderRadius: 4 }} />
                        <View style={styles.cardRow}>
                            <ShimmerBlock width={60} height={20} style={{ marginTop: 15, borderRadius: 6 }} />
                            <ShimmerBlock width={60} height={20} style={{ marginTop: 15, borderRadius: 6 }} />
                        </View>
                    </View>
                ))}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: 16,
        paddingTop: 10,
    },
    statsBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        backgroundColor: theme.colors.bg.secondary,
        borderRadius: 16,
        padding: 16,
        marginBottom: 20,
    },
    shimmerContainer: {
        backgroundColor: theme.colors.bg.tertiary,
        borderRadius: 8,
        overflow: 'hidden',
    },
    cardsContainer: {
        gap: 16,
    },
    cardSkeleton: {
        backgroundColor: theme.colors.bg.secondary,
        borderRadius: 16,
        padding: 16,
        height: 160,
    },
    cardRow: {
        flexDirection: 'row',
        justifyContent: 'space-between'
    }
});

export default SkeletonLoader;
