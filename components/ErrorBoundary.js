/**
 * SecureShare Error Boundary Component
 * Catches React errors and displays a fallback UI
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import theme from '../theme';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('ErrorBoundary caught:', error, errorInfo);
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
        if (this.props.onReset) {
            this.props.onReset();
        }
    };

    handleGoHome = () => {
        this.handleReset();
        if (this.props.navigation) {
            this.props.navigation.navigate('Home');
        }
    };

    render() {
        if (this.state.hasError) {
            return (
                <View style={styles.container}>
                    <View style={styles.iconContainer}>
                        <Ionicons name="warning-outline" size={60} color={theme.colors.status.danger} />
                    </View>
                    <Text style={styles.title}>Something went wrong</Text>
                    <Text style={styles.message}>
                        {this.state.error?.message || 'The app encountered an unexpected error. Please try again.'}
                    </Text>
                    <Pressable style={styles.button} onPress={this.handleReset}>
                        <Ionicons name="refresh" size={18} color="white" />
                        <Text style={styles.buttonText}>Try Again</Text>
                    </Pressable>
                    {this.props.showHome !== false && (
                        <Pressable style={[styles.button, styles.secondaryButton]} onPress={this.handleGoHome}>
                            <Ionicons name="home" size={18} color="#94A3B8" />
                            <Text style={styles.secondaryButtonText}>Go to Home</Text>
                        </Pressable>
                    )}
                    {__DEV__ && this.state.error && (
                        <Text style={styles.errorDetail}>
                            {this.state.error.toString()}
                        </Text>
                    )}
                </View>
            );
        }

        return this.props.children;
    }
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.bg.primary,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
    },
    iconContainer: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: theme.colors.status.dangerGlow,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
    },
    title: {
        fontSize: 22,
        fontWeight: '700',
        color: 'white',
        marginBottom: 12,
    },
    message: {
        fontSize: 15,
        color: theme.colors.text.secondary,
        textAlign: 'center',
        marginBottom: 32,
        lineHeight: 22,
    },
    button: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: theme.colors.accent.blue,
        paddingVertical: 14,
        paddingHorizontal: 24,
        borderRadius: 12,
        marginBottom: 12,
    },
    secondaryButton: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: theme.colors.border.light,
    },
    secondaryButtonText: {
        color: theme.colors.text.secondary,
    },
    buttonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '600',
    },
    errorDetail: {
        marginTop: 24,
        fontSize: 11,
        color: theme.colors.text.muted,
        fontFamily: 'monospace',
        maxWidth: '100%',
    },
});

export default ErrorBoundary;
