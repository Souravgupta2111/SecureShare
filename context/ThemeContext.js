/**
 * ThemeContext
 * 
 * Provides dark/light mode toggle functionality across the app.
 * Persists user preference in AsyncStorage.
 */

import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { darkTheme, lightTheme } from '../theme';

const THEME_STORAGE_KEY = 'secureshare_theme_preference';

const ThemeContext = createContext({
    theme: darkTheme,
    isDark: true,
    toggleTheme: () => { },
    setThemeMode: () => { },
});

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider = ({ children }) => {
    const systemColorScheme = useColorScheme();
    const [themeMode, setThemeMode] = useState('system'); // 'light', 'dark', 'system'
    const [isLoaded, setIsLoaded] = useState(false);

    // Load saved preference on mount
    useEffect(() => {
        const loadThemePreference = async () => {
            try {
                const saved = await AsyncStorage.getItem(THEME_STORAGE_KEY);
                if (saved && ['light', 'dark', 'system'].includes(saved)) {
                    setThemeMode(saved);
                }
            } catch (e) {
                console.warn('[Theme] Failed to load preference:', e);
            } finally {
                setIsLoaded(true);
            }
        };
        loadThemePreference();
    }, []);

    // Calculate actual dark state
    const isDark = useMemo(() => {
        if (themeMode === 'system') {
            return systemColorScheme === 'dark';
        }
        return themeMode === 'dark';
    }, [themeMode, systemColorScheme]);

    // Get theme object
    const theme = useMemo(() => {
        return isDark ? darkTheme : lightTheme;
    }, [isDark]);

    // Toggle between light and dark
    const toggleTheme = async () => {
        const newMode = isDark ? 'light' : 'dark';
        setThemeMode(newMode);
        try {
            await AsyncStorage.setItem(THEME_STORAGE_KEY, newMode);
        } catch (e) {
            console.warn('[Theme] Failed to save preference:', e);
        }
    };

    // Set specific theme mode
    const setThemeModeHandler = async (mode) => {
        if (['light', 'dark', 'system'].includes(mode)) {
            setThemeMode(mode);
            try {
                await AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
            } catch (e) {
                console.warn('[Theme] Failed to save preference:', e);
            }
        }
    };

    const value = useMemo(() => ({
        theme,
        isDark,
        themeMode,
        toggleTheme,
        setThemeMode: setThemeModeHandler,
        isLoaded,
    }), [theme, isDark, themeMode, isLoaded]);

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
};

export default ThemeContext;
