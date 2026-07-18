/**
 * AnimatedSplash
 *
 * Shown while the app initializes (after the native launch screen). Presents the
 * rounded app icon with a smooth spring-in, a soft pulsing glow, and expanding
 * rings — replaces the plain spinner / pixelated favicon splash.
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, Image, StyleSheet, Animated, Easing } from 'react-native';

const AnimatedSplash = () => {
    const scale = useRef(new Animated.Value(0.82)).current;
    const opacity = useRef(new Animated.Value(0)).current;
    const titleOpacity = useRef(new Animated.Value(0)).current;
    const pulse = useRef(new Animated.Value(0)).current;
    const ring1 = useRef(new Animated.Value(0)).current;
    const ring2 = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.spring(scale, { toValue: 1, friction: 6, tension: 55, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 1, duration: 450, useNativeDriver: true }),
        ]).start();

        Animated.timing(titleOpacity, { toValue: 1, duration: 650, delay: 250, useNativeDriver: true }).start();

        Animated.loop(
            Animated.sequence([
                Animated.timing(pulse, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
                Animated.timing(pulse, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            ])
        ).start();

        const ringLoop = (val, delay) =>
            Animated.loop(
                Animated.sequence([
                    Animated.delay(delay),
                    Animated.timing(val, { toValue: 1, duration: 2200, easing: Easing.out(Easing.ease), useNativeDriver: true }),
                    Animated.timing(val, { toValue: 0, duration: 0, useNativeDriver: true }),
                ])
            );
        ringLoop(ring1, 0).start();
        ringLoop(ring2, 1100).start();
    }, [scale, opacity, titleOpacity, pulse, ring1, ring2]);

    const ringStyle = (val) => ({
        opacity: val.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.4, 0] }),
        transform: [{ scale: val.interpolate({ inputRange: [0, 1], outputRange: [1, 2.5] }) }],
    });

    const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });

    return (
        <View style={styles.container}>
            <View style={styles.stage}>
                <Animated.View style={[styles.ring, ringStyle(ring1)]} />
                <Animated.View style={[styles.ring, ringStyle(ring2)]} />
                <Animated.View
                    style={[
                        styles.iconWrap,
                        { opacity, transform: [{ scale: Animated.multiply(scale, pulseScale) }] },
                    ]}
                >
                    <Image source={require('../assets/images/icon.png')} style={styles.icon} resizeMode="cover" />
                </Animated.View>
            </View>
            <Animated.Text style={[styles.title, { opacity: titleOpacity }]}>SecureShare</Animated.Text>
        </View>
    );
};

const ICON = 116;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0e1117',
        alignItems: 'center',
        justifyContent: 'center',
    },
    stage: {
        width: ICON,
        height: ICON,
        alignItems: 'center',
        justifyContent: 'center',
    },
    ring: {
        position: 'absolute',
        width: ICON,
        height: ICON,
        borderRadius: ICON / 2,
        borderWidth: 2,
        borderColor: '#3d7aff',
    },
    iconWrap: {
        width: ICON,
        height: ICON,
        borderRadius: 28,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        backgroundColor: '#0e1117',
    },
    icon: {
        width: '100%',
        height: '100%',
    },
    title: {
        color: 'white',
        fontSize: 26,
        fontWeight: '700',
        letterSpacing: 0.5,
        marginTop: 28,
    },
});

export default AnimatedSplash;
