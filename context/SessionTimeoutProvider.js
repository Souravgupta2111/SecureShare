/**
 * SessionTimeoutProvider
 * 
 * Auto-logs out user after inactivity period.
 * Tracks user interactions and shows warning before timeout.
 */

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { AppState, Alert } from 'react-native';
import { useAuth } from './AuthContext';
import * as Haptics from 'expo-haptics';

const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const WARNING_BEFORE_MS = 60 * 1000; // Warning 1 minute before timeout

const SessionTimeoutContext = createContext({
    resetTimeout: () => { },
    remainingTime: null,
    isWarning: false,
});

export const useSessionTimeout = () => useContext(SessionTimeoutContext);

export const SessionTimeoutProvider = ({ children, timeoutMs = DEFAULT_TIMEOUT_MS }) => {
    const { isAuthenticated, signOut } = useAuth();
    const [remainingTime, setRemainingTime] = useState(null);
    const [isWarning, setIsWarning] = useState(false);
    const lastActivityRef = useRef(Date.now());
    const timeoutIdRef = useRef(null);
    const warningShownRef = useRef(false);
    const appStateRef = useRef(AppState.currentState);

    // Reset the timeout timer
    const resetTimeout = useCallback(() => {
        lastActivityRef.current = Date.now();
        warningShownRef.current = false;
        setIsWarning(false);
        setRemainingTime(timeoutMs);
    }, [timeoutMs]);

    // Handle timeout
    const handleTimeout = useCallback(async () => {
        if (!isAuthenticated) return;

        console.log('[Session] Timeout - signing out due to inactivity');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

        Alert.alert(
            'Session Expired',
            'You have been logged out due to inactivity.',
            [{ text: 'OK' }]
        );

        await signOut();
    }, [isAuthenticated, signOut]);

    // Show warning before timeout
    const showWarning = useCallback(() => {
        if (warningShownRef.current || !isAuthenticated) return;

        warningShownRef.current = true;
        setIsWarning(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

        Alert.alert(
            'Session Expiring Soon',
            'Your session will expire in 1 minute due to inactivity. Tap to continue.',
            [
                {
                    text: 'Continue Session',
                    onPress: () => {
                        resetTimeout();
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }
                }
            ]
        );
    }, [isAuthenticated, resetTimeout]);

    // Check timeout status
    useEffect(() => {
        if (!isAuthenticated) {
            if (timeoutIdRef.current) {
                clearInterval(timeoutIdRef.current);
            }
            return;
        }

        resetTimeout();

        // Check every 10 seconds
        timeoutIdRef.current = setInterval(() => {
            const elapsed = Date.now() - lastActivityRef.current;
            const remaining = timeoutMs - elapsed;

            setRemainingTime(Math.max(0, remaining));

            if (remaining <= 0) {
                handleTimeout();
            } else if (remaining <= WARNING_BEFORE_MS && !warningShownRef.current) {
                showWarning();
            }
        }, 10000);

        return () => {
            if (timeoutIdRef.current) {
                clearInterval(timeoutIdRef.current);
            }
        };
    }, [isAuthenticated, timeoutMs, handleTimeout, showWarning, resetTimeout]);

    // Handle app state changes (pause timer when backgrounded)
    useEffect(() => {
        const subscription = AppState.addEventListener('change', (nextAppState) => {
            if (
                appStateRef.current.match(/inactive|background/) &&
                nextAppState === 'active'
            ) {
                // App came to foreground - check if timed out while away
                const elapsed = Date.now() - lastActivityRef.current;
                if (elapsed >= timeoutMs && isAuthenticated) {
                    handleTimeout();
                }
            }
            appStateRef.current = nextAppState;
        });

        return () => {
            subscription.remove();
        };
    }, [isAuthenticated, timeoutMs, handleTimeout]);

    const value = {
        resetTimeout,
        remainingTime,
        isWarning,
    };

    return (
        <SessionTimeoutContext.Provider value={value}>
            {children}
        </SessionTimeoutContext.Provider>
    );
};

export default SessionTimeoutContext;
