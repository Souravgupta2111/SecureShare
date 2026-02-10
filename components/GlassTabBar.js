import React from 'react';
import { View, Pressable, StyleSheet, Text, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import theme from '../theme';

const GlassTabBar = ({ state, descriptors, navigation }) => {
    return (
        <View style={styles.container}>
            {/* Floating Glass Pill */}
            <View style={styles.glassContainer}>
                {Platform.OS === 'ios' ? (
                    <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
                ) : (
                    <View style={styles.androidFallback} />
                )}

                <View style={styles.tabRow}>
                    {state.routes.map((route, index) => {
                        const isFocused = state.index === index;

                        const onPress = () => {
                            const event = navigation.emit({
                                type: 'tabPress',
                                target: route.key,
                                canPreventDefault: true,
                            });

                            if (!isFocused && !event.defaultPrevented) {
                                navigation.navigate(route.name);
                            }
                        };

                        const getIconName = () => {
                            switch (route.name) {
                                case 'My Docs': return isFocused ? 'home' : 'home-outline';
                                case 'Shared': return isFocused ? 'people' : 'people-outline';
                                case 'Verify': return isFocused ? 'shield-checkmark' : 'shield-checkmark-outline';
                                case 'Security': return isFocused ? 'lock-closed' : 'lock-closed-outline';
                                default: return 'circle';
                            }
                        };

                        const getLabel = () => {
                            switch (route.name) {
                                case 'My Docs': return 'Home';
                                case 'Shared': return 'Shared';
                                case 'Verify': return 'Verify';
                                case 'Security': return 'Security';
                                default: return route.name;
                            }
                        };

                        return (
                            <Pressable
                                key={route.key}
                                onPress={onPress}
                                style={styles.tabItem}
                            >
                                <View style={styles.iconContainer}>
                                    <Ionicons
                                        name={getIconName()}
                                        size={22}
                                        color={isFocused ? theme.colors.accent.primary : theme.colors.text.secondary}
                                    />
                                    <Text style={[
                                        styles.tabLabel,
                                        { color: isFocused ? theme.colors.accent.primary : theme.colors.text.secondary }
                                    ]}>
                                        {getLabel()}
                                    </Text>
                                </View>
                            </Pressable>
                        );
                    })}
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        bottom: 20,
        left: 0,
        right: 0,
        alignItems: 'center',
        paddingHorizontal: 16,
    },
    glassContainer: {
        flexDirection: 'row',
        width: '100%',
        height: 60,
        borderRadius: 30,
        overflow: 'hidden',
        backgroundColor: Platform.OS === 'android' ? 'rgba(22, 27, 34, 0.95)' : 'transparent',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
        elevation: 8,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    androidFallback: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#161B22',
        opacity: 0.98,
    },
    tabRow: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
        paddingHorizontal: 8,
    },
    tabItem: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
    },
    iconContainer: {
        alignItems: 'center',
        gap: 2,
    },
    tabLabel: {
        fontSize: 10,
        fontWeight: '500',
    },
});

export default GlassTabBar;
