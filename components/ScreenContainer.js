import React from 'react';
import { View, StyleSheet, StatusBar } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import theme from '../theme';

const ScreenContainer = ({ children, style, noPadding = false }) => {
    const insets = useSafeAreaInsets();

    return (
        <View style={[styles.container, style]}>
            <StatusBar barStyle="light-content" backgroundColor={theme.colors.bg.primary} />
            {/* Subtle Gradient Background for Depth */}
            <LinearGradient
                colors={[theme.colors.bg.primary, '#0f141c']}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
            />
            <View style={[
                styles.content,
                !noPadding && { paddingTop: Math.max(insets.top, 20) }
            ]}>
                {children}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.bg.primary,
    },
    content: {
        flex: 1,
    }
});

export default ScreenContainer;

