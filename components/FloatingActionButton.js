/**
 * FloatingActionButton (FAB) Component
 * 
 * Animated floating action button with:
 * - Press scale animation
 * - Expandable menu (Scan & Upload only)
 * - Haptic feedback
 */

import React, { memo, useRef, useState, useCallback, useEffect } from 'react';
import {
    View,
    StyleSheet,
    Pressable,
    Animated,
    Text,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import theme from '../theme';

const FAB_SIZE = 56;
const MINI_FAB_SIZE = 48;

const FABMenuItem = memo(({ icon, label, color, onPress, index, isVisible }) => {
    const translateY = useRef(new Animated.Value(50)).current;
    const opacity = useRef(new Animated.Value(0)).current;
    const scale = useRef(new Animated.Value(0.5)).current;

    useEffect(() => {
        if (isVisible) {
            Animated.parallel([
                Animated.spring(translateY, {
                    toValue: 0,
                    delay: index * 50,
                    useNativeDriver: true,
                    friction: 6,
                }),
                Animated.timing(opacity, {
                    toValue: 1,
                    duration: 200,
                    delay: index * 50,
                    useNativeDriver: true,
                }),
                Animated.spring(scale, {
                    toValue: 1,
                    delay: index * 50,
                    useNativeDriver: true,
                    friction: 5,
                }),
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(translateY, {
                    toValue: 50,
                    duration: 150,
                    useNativeDriver: true,
                }),
                Animated.timing(opacity, {
                    toValue: 0,
                    duration: 150,
                    useNativeDriver: true,
                }),
            ]).start();
        }
    }, [isVisible, index, translateY, opacity, scale]);

    return (
        <Animated.View
            style={[
                styles.menuItem,
                {
                    opacity,
                    transform: [{ translateY }, { scale }],
                },
            ]}
        >
            <Text style={styles.menuLabel}>{label}</Text>
            <Pressable
                onPress={onPress}
                style={({ pressed }) => [
                    styles.miniFab,
                    { backgroundColor: color },
                    pressed && styles.pressed,
                ]}
            >
                <Ionicons name={icon} size={22} color="white" />
            </Pressable>
        </Animated.View>
    );
});

FABMenuItem.displayName = 'FABMenuItem';

const FloatingActionButton = memo(({
    onUpload,
    onScan,
    navigation
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const mainScale = useRef(new Animated.Value(1)).current;
    const rotateAnim = useRef(new Animated.Value(0)).current;
    const backdropOpacity = useRef(new Animated.Value(0)).current;

    const menuItems = [
        {
            icon: 'scan-outline',
            label: 'Scan',
            color: '#2563EB', // Blue
            onPress: () => handleMenuPress(onScan)
        },
        {
            icon: 'cloud-upload-outline',
            label: 'Upload',
            color: '#10B981', // Green
            onPress: () => handleMenuPress(onUpload)
        },
    ];

    const handleMenuPress = useCallback((handler) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

        // Close menu with animation
        Animated.parallel([
            Animated.spring(rotateAnim, {
                toValue: 0,
                useNativeDriver: true,
                friction: 6,
            }),
            Animated.timing(backdropOpacity, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
            }),
        ]).start();

        setIsOpen(false);
        handler?.();
    }, [rotateAnim, backdropOpacity]);

    const toggleMenu = useCallback(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        const newIsOpen = !isOpen;
        setIsOpen(newIsOpen);

        Animated.parallel([
            Animated.spring(rotateAnim, {
                toValue: newIsOpen ? 1 : 0,
                useNativeDriver: true,
                friction: 6,
            }),
            Animated.timing(backdropOpacity, {
                toValue: newIsOpen ? 1 : 0,
                duration: 200,
                useNativeDriver: true,
            }),
        ]).start();
    }, [isOpen, rotateAnim, backdropOpacity]);

    const handlePressIn = () => {
        Animated.spring(mainScale, {
            toValue: 0.9,
            useNativeDriver: true,
            friction: 8,
        }).start();
    };

    const handlePressOut = () => {
        Animated.spring(mainScale, {
            toValue: 1,
            useNativeDriver: true,
            friction: 8,
        }).start();
    };

    const rotate = rotateAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '45deg'],
    });

    return (
        <>
            {/* Backdrop */}
            {isOpen && (
                <Animated.View
                    style={[
                        styles.backdrop,
                        { opacity: backdropOpacity },
                    ]}
                >
                    <Pressable style={StyleSheet.absoluteFill} onPress={toggleMenu} />
                </Animated.View>
            )}

            {/* FAB Container - positioned above tab bar */}
            <View style={styles.container}>
                {/* Menu items */}
                <View style={styles.menu}>
                    {menuItems.map((item, index) => (
                        <FABMenuItem
                            key={item.icon}
                            {...item}
                            index={index}
                            isVisible={isOpen}
                        />
                    ))}
                </View>

                {/* Main FAB */}
                <Pressable
                    onPressIn={handlePressIn}
                    onPressOut={handlePressOut}
                    onPress={toggleMenu}
                    accessibilityRole="button"
                    accessibilityLabel={isOpen ? 'Close menu' : 'Add document'}
                >
                    <Animated.View style={{ transform: [{ scale: mainScale }] }}>
                        <LinearGradient
                            colors={['#3d7aff', '#6366F1']}
                            style={styles.fab}
                        >
                            <Animated.View style={{ transform: [{ rotate }] }}>
                                <Ionicons name="add" size={28} color="white" />
                            </Animated.View>
                        </LinearGradient>
                    </Animated.View>
                </Pressable>
            </View>
        </>
    );
});

const styles = StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.5)',
        zIndex: 998,
    },
    container: {
        position: 'absolute',
        right: 20,
        bottom: 100, // Above the tab bar (60px tab + 20px bottom + 20px padding)
        alignItems: 'flex-end',
        zIndex: 999,
    },
    fab: {
        width: FAB_SIZE,
        height: FAB_SIZE,
        borderRadius: FAB_SIZE / 2,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: theme.colors.accent.blue,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
        elevation: 8,
    },
    pressed: {
        opacity: 0.8,
        transform: [{ scale: 0.95 }],
    },
    menu: {
        marginBottom: 12,
        alignItems: 'flex-end',
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    menuLabel: {
        color: 'white',
        fontSize: 14,
        fontWeight: '600',
        marginRight: 12,
        paddingHorizontal: 14,
        paddingVertical: 8,
        backgroundColor: 'rgba(0,0,0,0.7)',
        borderRadius: 8,
    },
    miniFab: {
        width: MINI_FAB_SIZE,
        height: MINI_FAB_SIZE,
        borderRadius: MINI_FAB_SIZE / 2,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 4,
    },
});

FloatingActionButton.displayName = 'FloatingActionButton';

export default FloatingActionButton;
