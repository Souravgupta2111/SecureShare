// QuickCrypto Polyfill - MUST BE FIRST
import './utils/cryptoBootstrap';

import 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import * as Notifications from 'expo-notifications';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import theme from './theme';

// Auth Context
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { SessionTimeoutProvider } from './context/SessionTimeoutProvider';

// Components
import GlassTabBar from './components/GlassTabBar';
import ErrorBoundary from './components/ErrorBoundary';

// Analytics and utilities
import { initializeAnalyticsQueue, cleanupAnalyticsQueue } from './utils/analyticsQueue';
import { initializeMemoryManager } from './utils/memoryManager';
import { initializeExpiryNotifications } from './utils/expiryNotifications';

// Screens
import AuthScreen from './screens/AuthScreen';
import HomeScreen from './screens/HomeScreen';
import ShareScreen from './screens/ShareScreen';
import DetailScreen from './screens/DetailScreen';
import ViewerScreen from './screens/ViewerScreen';
import VerifyLeakScreen from './screens/VerifyLeakScreen';
import SecurityLogScreen from './screens/SecurityLogScreen';
import SettingsScreen from './screens/SettingsScreen';
import ProfileScreen from './screens/ProfileScreen';
import SharedWithMeScreen from './screens/SharedWithMeScreen';
import UploadScreen from './screens/UploadScreen';
import AccessControlScreen from './screens/AccessControlScreen';
import CommentsScreen from './screens/CommentsScreen';
import SecurityInfoScreen from './screens/SecurityInfoScreen';
import DocumentAnalyticsScreen from './screens/DocumentAnalyticsScreen';
import OnboardingScreen, { hasCompletedOnboarding } from './screens/OnboardingScreen';
import KeyGenerationScreen from './screens/KeyGenerationScreen';

// Notification Handler
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
    }),
});

const Tab = createBottomTabNavigator();
const HomeStack = createStackNavigator();
const SharedStack = createStackNavigator();
const AuthStack = createStackNavigator();

// Auth Stack Navigator
const AuthStackNavigator = () => {
    return (
        <AuthStack.Navigator
            screenOptions={{
                headerShown: false,
                cardStyle: { backgroundColor: theme.colors.bg.primary }
            }}
        >
            <AuthStack.Screen name="Auth" component={AuthScreen} />
        </AuthStack.Navigator>
    );
};

// Stack for Home Tab (My Documents)
const HomeStackNavigator = () => {
    return (
        <HomeStack.Navigator
            screenOptions={{
                headerShown: false,
                cardStyle: { backgroundColor: theme.colors.bg.primary }
            }}
            initialRouteName="Home"
        >
            <HomeStack.Screen name="Home" component={HomeScreen} />
            <HomeStack.Screen name="Detail" component={DetailScreen} />
            <HomeStack.Screen name="ViewerScreen" component={ViewerScreen} />
            <HomeStack.Screen name="Settings" component={SettingsScreen} />

            <HomeStack.Screen name="Profile" component={ProfileScreen} />
            <HomeStack.Screen name="Upload" component={UploadScreen} />
            <HomeStack.Screen name="Share" component={ShareScreen} />
            <HomeStack.Screen name="AccessControl" component={AccessControlScreen} />
            <HomeStack.Screen name="Comments" component={CommentsScreen} />
            <HomeStack.Screen name="SecurityInfo" component={SecurityInfoScreen} />
            <HomeStack.Screen name="DocumentAnalytics" component={DocumentAnalyticsScreen} />
            <HomeStack.Screen name="KeyGeneration" component={KeyGenerationScreen} />
        </HomeStack.Navigator>
    );
};

// Stack for Shared With Me Tab
const SharedStackNavigator = () => {
    return (
        <SharedStack.Navigator
            screenOptions={{
                headerShown: false,
                cardStyle: { backgroundColor: theme.colors.bg.primary }
            }}
        >
            <SharedStack.Screen name="SharedWithMe" component={SharedWithMeScreen} />
            <SharedStack.Screen name="ViewerScreen" component={ViewerScreen} />
        </SharedStack.Navigator>
    );
};

// Navigation Theme
const MyTheme = {
    ...DefaultTheme,
    colors: {
        ...DefaultTheme.colors,
        background: theme.colors.bg.primary,
        card: theme.colors.bg.primary,
        border: 'transparent',
    },
};

// Main Tab Navigator (Authenticated)
const MainTabNavigator = () => {
    return (
        <Tab.Navigator
            tabBar={props => <GlassTabBar {...props} />}
            screenOptions={{
                headerShown: false,
                tabBarStyle: {
                    position: 'absolute',
                    backgroundColor: 'transparent',
                    borderTopWidth: 0,
                    elevation: 0,
                }
            }}
        >
            <Tab.Screen
                name="My Docs"
                component={HomeStackNavigator}
                options={{ title: 'Home' }}
            />
            <Tab.Screen
                name="Shared"
                component={SharedStackNavigator}
                options={{ title: 'Shared' }}
            />
            <Tab.Screen name="Verify" component={VerifyLeakScreen} />
            <Tab.Screen name="Security" component={SecurityLogScreen} />
        </Tab.Navigator>
    );
};

const RootNavigator = () => {
    const { isAuthenticated, loading, initialized, user, needsKeyGeneration, completeKeyGeneration, skipKeyGeneration } = useAuth();
    const [showOnboarding, setShowOnboarding] = useState(null);

    useEffect(() => {
        checkOnboarding();
    }, []);

    const checkOnboarding = async () => {
        const completed = await hasCompletedOnboarding();
        setShowOnboarding(!completed);
    };

    if (!initialized || loading || showOnboarding === null) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={theme.colors.accent.primary} />
            </View>
        );
    }

    if (showOnboarding) {
        return <OnboardingScreen onComplete={() => setShowOnboarding(false)} />;
    }

    // Show key generation screen after signup if keys don't exist
    if (isAuthenticated && needsKeyGeneration && user) {
        return (
            <KeyGenerationScreen
                userId={user.id}
                onComplete={completeKeyGeneration}
                onSkip={skipKeyGeneration}
            />
        );
    }

    return (
        <NavigationContainer theme={MyTheme}>
            {isAuthenticated ? <MainTabNavigator /> : <AuthStackNavigator />}
        </NavigationContainer>
    );
};

export default function App() {
    useEffect(() => {
        // CRITICAL: Initialize analytics queue at app startup
        initializeAnalyticsQueue();

        // Initialize memory manager for document caching
        initializeMemoryManager();

        // Initialize expiry notifications
        initializeExpiryNotifications();

        // Permission Request
        const requestPermissions = async () => {
            const { status } = await Notifications.requestPermissionsAsync();
        };
        requestPermissions();

        return () => {
            cleanupAnalyticsQueue();
        };
    }, []);

    return (
        <ErrorBoundary>
            <ThemeProvider>
                <SafeAreaProvider>
                    <StatusBar style="auto" />
                    <AuthProvider>
                        <SessionTimeoutProvider>
                            <RootNavigator />
                        </SessionTimeoutProvider>
                    </AuthProvider>
                </SafeAreaProvider>
            </ThemeProvider>
        </ErrorBoundary>
    );
}

const styles = StyleSheet.create({
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.bg.primary,
    },
});
