// QuickCrypto Polyfill - MUST BE FIRST
import './utils/cryptoBootstrap';

import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import theme from './theme';

// Auth Context
import { AuthProvider, useAuth } from './context/AuthContext';
import { PurchasesProvider } from './context/PurchasesContext';
import { SessionTimeoutProvider } from './context/SessionTimeoutProvider';
import { ThemeProvider } from './context/ThemeContext';

// Components
import AnimatedSplash from './components/AnimatedSplash';
import ErrorBoundary from './components/ErrorBoundary';
import GlassTabBar from './components/GlassTabBar';

// Analytics and utilities
import { cleanupAnalyticsQueue, initializeAnalyticsQueue } from './utils/analyticsQueue';
import { initializeExpiryNotifications } from './utils/expiryNotifications';
import { initializeMemoryManager } from './utils/memoryManager';

// Screens
import AccessControlScreen from './screens/AccessControlScreen';
import AuthScreen from './screens/AuthScreen';
import CommentsScreen from './screens/CommentsScreen';
import DetailScreen from './screens/DetailScreen';
import DocumentAnalyticsScreen from './screens/DocumentAnalyticsScreen';
import HomeScreen from './screens/HomeScreen';
import KeyGenerationScreen from './screens/KeyGenerationScreen';
import OnboardingScreen, { hasCompletedOnboarding } from './screens/OnboardingScreen';
import ProfileScreen from './screens/ProfileScreen';
import ResetPasswordScreen from './screens/ResetPasswordScreen';
import SecurityInfoScreen from './screens/SecurityInfoScreen';
import SecurityLogScreen from './screens/SecurityLogScreen';
import SettingsScreen from './screens/SettingsScreen';
import SharedWithMeScreen from './screens/SharedWithMeScreen';
import ShareScreen from './screens/ShareScreen';
import UploadScreen from './screens/UploadScreen';
import VerifyLeakScreen from './screens/VerifyLeakScreen';
import ViewerScreen from './screens/ViewerScreen';

// Notification Handler
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        // SDK 54: shouldShowAlert is deprecated in favor of banner/list.
        shouldShowBanner: true,
        shouldShowList: true,
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
    const { isAuthenticated, loading, initialized, user, needsKeyGeneration, completeKeyGeneration, skipKeyGeneration, passwordRecovery } = useAuth();
    const [showOnboarding, setShowOnboarding] = useState(null);

    useEffect(() => {
        checkOnboarding();
    }, []);

    const checkOnboarding = async () => {
        const completed = await hasCompletedOnboarding();
        setShowOnboarding(!completed);
    };

    if (!initialized || loading || showOnboarding === null) {
        return <AnimatedSplash />;
    }

    // Password recovery deep link takes priority over everything else.
    if (passwordRecovery) {
        return <ResetPasswordScreen />;
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

        // Configure the notification handler. Permission is NOT requested here —
        // it's requested contextually (see utils/expiryNotifications) the first
        // time we actually need to schedule a reminder, which is better UX and
        // aligns with Apple's guidance against eager cold-launch prompts.
        initializeExpiryNotifications();

        return () => {
            cleanupAnalyticsQueue();
        };
    }, []);

    return (
        <ErrorBoundary>
            <ThemeProvider>
                <SafeAreaProvider>
                    <StatusBar style="light" />
                    <AuthProvider>
                        <PurchasesProvider>
                            <SessionTimeoutProvider>
                                <RootNavigator />
                            </SessionTimeoutProvider>
                        </PurchasesProvider>
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
