/**
 * SearchBar Component
 * 
 * Animated search input with clear button for filtering documents.
 */

import React, { useState, useRef } from 'react';
import {
    TextInput,
    StyleSheet,
    Pressable,
    Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import theme from '../theme';

const SearchBar = ({ value, onChangeText, placeholder = 'Search documents...' }) => {
    const [isFocused, setIsFocused] = useState(false);
    const inputRef = useRef(null);
    const focusAnim = useRef(new Animated.Value(0)).current;

    const handleFocus = () => {
        setIsFocused(true);
        Animated.spring(focusAnim, {
            toValue: 1,
            useNativeDriver: false,
            tension: 50,
            friction: 7,
        }).start();
    };

    const handleBlur = () => {
        setIsFocused(false);
        Animated.spring(focusAnim, {
            toValue: 0,
            useNativeDriver: false,
            tension: 50,
            friction: 7,
        }).start();
    };

    const handleClear = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onChangeText('');
        inputRef.current?.focus();
    };

    const borderColor = focusAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [theme.colors.border.light, theme.colors.accent.blue],
    });

    return (
        <Animated.View style={[styles.container, { borderColor }]}>
            <Ionicons
                name="search"
                size={18}
                color={isFocused ? theme.colors.accent.blue : theme.colors.text.muted}
                style={styles.icon}
            />
            <TextInput
                ref={inputRef}
                style={styles.input}
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                placeholderTextColor={theme.colors.text.muted}
                onFocus={handleFocus}
                onBlur={handleBlur}
                returnKeyType="search"
                autoCorrect={false}
                autoCapitalize="none"
            />
            {value.length > 0 && (
                <Pressable onPress={handleClear} style={styles.clearButton}>
                    <Ionicons name="close-circle" size={18} color={theme.colors.text.muted} />
                </Pressable>
            )}
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.bg.secondary,
        borderRadius: 12,
        borderWidth: 1,
        paddingHorizontal: 12,
        marginHorizontal: 16,
        marginBottom: 12,
    },
    icon: {
        marginRight: 8,
    },
    input: {
        flex: 1,
        height: 44,
        color: 'white',
        fontSize: 15,
    },
    clearButton: {
        padding: 4,
    },
});

export default SearchBar;
