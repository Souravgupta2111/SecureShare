import React, { useEffect, useRef, useState, useCallback, memo } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import theme from '../theme';
import * as storage from '../utils/storage';

const { width } = Dimensions.get('window');
const TAB_COUNT = 5;
const TAB_WIDTH = width / TAB_COUNT;

// Tab configuration for the new navigation structure
const TAB_CONFIG = {
    'My Docs': { icon: 'folder-outline', activeIcon: 'folder', label: 'My Docs' },
    'Shared': { icon: 'people-outline', activeIcon: 'people', label: 'Shared' },
    'Share': { icon: 'add-circle-outline', activeIcon: 'add-circle', label: 'Share' },
    'Verify': { icon: 'shield-outline', activeIcon: 'shield', label: 'Verify' },
    'Security': { icon: 'notifications-outline', activeIcon: 'notifications', label: 'Security' },
    // Fallback for any other routes
    'Home': { icon: 'home-outline', activeIcon: 'home', label: 'Home' },
};

const BottomTabBar = ({ state, descriptors, navigation }) => {
    const insets = useSafeAreaInsets();
    const indicatorAnim = useRef(new Animated.Value(0)).current;

    const [securityBadgeCount, setSecurityBadgeCount] = useState(0);

    useEffect(() => {
        Animated.spring(indicatorAnim, {
            toValue: state.index,
            useNativeDriver: true,
            friction: 12,
            tension: 60,
        }).start();
    }, [state.index]); // eslint-disable-line react-hooks/exhaustive-deps

    // Badge Logic
    const checkBadges = async () => {
        try {
            const events = await storage.getAllSecurityEvents();
            const lastViewedStr = await AsyncStorage.getItem('secureshare_security_last_viewed');
            const lastViewed = lastViewedStr ? parseInt(lastViewedStr) : 0;

            // Count events after lastViewed
            const count = events.filter(e => e.timestamp > lastViewed).length;
            setSecurityBadgeCount(count);
        } catch (e) {
            console.error('Error checking badges:', e);
        }
    };

    useFocusEffect(
        useCallback(() => {
            checkBadges();
            const interval = setInterval(checkBadges, 5000);
            return () => clearInterval(interval);
        }, [])
    );

    const onTabPress = async (route, index) => {
        const isFocused = state.index === index;
        const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
        });

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

        if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
        }

        // If Security tab pressed, update last viewed
        if (route.name === 'Security') {
            await AsyncStorage.setItem('secureshare_security_last_viewed', Date.now().toString());
            setSecurityBadgeCount(0);
        }
    };

    // Dynamic indicator position based on tab count
    const indicatorTranslateX = indicatorAnim.interpolate({
        inputRange: state.routes.map((_, i) => i),
        outputRange: state.routes.map((_, i) => (TAB_WIDTH * i) + (TAB_WIDTH / 2) - 12),
    });

    return (
        <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 8) }]}>
            {/* Indicator */}
            <Animated.View style={[
                styles.indicator,
                { transform: [{ translateX: indicatorTranslateX }] }
            ]} />

            {state.routes.map((route, index) => {
                const isFocused = state.index === index;
                const config = TAB_CONFIG[route.name] || TAB_CONFIG['Home'];

                const iconName = isFocused ? config.activeIcon : config.icon;
                const color = isFocused ? theme.colors.accent.blue : theme.colors.text.muted;

                return (
                    <Pressable
                        key={index}
                        onPress={() => onTabPress(route, index)}
                        style={styles.tabItem}
                        accessible={true}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: isFocused }}
                        accessibilityLabel={`${config.label} tab${route.name === 'Security' && securityBadgeCount > 0 ? `, ${securityBadgeCount} new notifications` : ''}`}
                    >
                        <View style={isFocused ? styles.activeIconContainer : null}>
                            <Ionicons name={iconName} size={22} color={color} />

                            {/* Badge for Security Tab */}
                            {route.name === 'Security' && securityBadgeCount > 0 && (
                                <View style={styles.badge}>
                                    <Text style={styles.badgeText}>
                                        {securityBadgeCount > 9 ? '9+' : securityBadgeCount}
                                    </Text>
                                </View>
                            )}
                        </View>
                        <Text style={[styles.label, { color }]}>{config.label}</Text>
                    </Pressable>
                );
            })}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        backgroundColor: '#0e1117',
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.06)',
        paddingTop: 8,
    },
    indicator: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: 24,
        height: 3,
        borderRadius: 100,
        backgroundColor: theme.colors.accent.blue,
    },
    tabItem: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 4,
        gap: 4,
    },
    activeIconContainer: {
        shadowColor: theme.colors.accent.blue,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.2,
        shadowRadius: 10,
        elevation: 4,
    },
    label: {
        fontSize: 10,
        fontWeight: '500',
    },
    badge: {
        position: 'absolute',
        top: -4,
        right: -6,
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: theme.colors.status.danger,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: '#0e1117',
    },
    badgeText: {
        color: 'white',
        fontSize: 10,
        fontWeight: 'bold',
    }
});

export default memo(BottomTabBar);
