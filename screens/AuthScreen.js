/**
 * AuthScreen - Login/Register Screen
 * 
 * Beautiful authentication screen with email/password login
 * and registration functionality.
 */

import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    Pressable,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    ActivityIndicator,
    Alert,
    Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import theme from '../theme';

const AuthScreen = () => {
    const insets = useSafeAreaInsets();
    const { signIn, signUp, loading } = useAuth();

    const [mode, setMode] = useState('login'); // 'login' | 'register'
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [errors, setErrors] = useState({});

    const validateForm = useCallback(() => {
        const newErrors = {};

        // Email validation
        if (!email.trim()) {
            newErrors.email = 'Email is required';
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            newErrors.email = 'Invalid email format';
        }

        // Password validation
        if (!password) {
            newErrors.password = 'Password is required';
        } else if (password.length < 6) {
            newErrors.password = 'Password must be at least 6 characters';
        }

        // Display name for registration
        if (mode === 'register' && !displayName.trim()) {
            newErrors.displayName = 'Display name is required';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    }, [email, password, displayName, mode]);

    const handleSubmit = async () => {
        if (!validateForm()) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            return;
        }

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        let result;
        if (mode === 'login') {
            result = await signIn(email.trim().toLowerCase(), password);
        } else {
            result = await signUp(email.trim().toLowerCase(), password, displayName.trim());
        }

        if (!result.success) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            Alert.alert(
                mode === 'login' ? 'Login Failed' : 'Registration Failed',
                result.error
            );
        } else if (mode === 'register') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert(
                'Check Your Email',
                'We sent you a confirmation link. Please verify your email to continue.'
            );
        }
    };

    const toggleMode = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setMode(mode === 'login' ? 'register' : 'login');
        setErrors({});
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <ScrollView
                contentContainerStyle={[
                    styles.scrollContent,
                    { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20 }
                ]}
                keyboardShouldPersistTaps="handled"
            >
                {/* Header */}
                <View style={styles.header}>
                    <View style={styles.logoContainer}>
                        <Image
                            source={require('../assets/logo.png')}
                            style={styles.logoImage}
                            resizeMode="contain"
                        />
                    </View>
                    <Text style={styles.title}>SecureShare</Text>
                    <Text style={styles.subtitle}>
                        {mode === 'login'
                            ? 'Welcome back! Sign in to continue.'
                            : 'Create an account to get started.'}
                    </Text>
                </View>

                {/* Form */}
                <View style={styles.form}>
                    {mode === 'register' && (
                        <View style={styles.inputContainer}>
                            <Ionicons name="person-outline" size={20} color={theme.colors.text.muted} style={styles.inputIcon} />
                            <TextInput
                                style={styles.input}
                                placeholder="Display Name"
                                placeholderTextColor={theme.colors.text.muted}
                                value={displayName}
                                onChangeText={setDisplayName}
                                autoCapitalize="words"
                            />
                        </View>
                    )}
                    {errors.displayName && <Text style={styles.errorText}>{errors.displayName}</Text>}

                    <View style={styles.inputContainer}>
                        <Ionicons name="mail-outline" size={20} color={theme.colors.text.muted} style={styles.inputIcon} />
                        <TextInput
                            style={styles.input}
                            placeholder="Email Address"
                            placeholderTextColor={theme.colors.text.muted}
                            value={email}
                            onChangeText={setEmail}
                            keyboardType="email-address"
                            autoCapitalize="none"
                            autoComplete="email"
                        />
                    </View>
                    {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}

                    <View style={styles.inputContainer}>
                        <Ionicons name="lock-closed-outline" size={20} color={theme.colors.text.muted} style={styles.inputIcon} />
                        <TextInput
                            style={styles.input}
                            placeholder="Password"
                            placeholderTextColor={theme.colors.text.muted}
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry={!showPassword}
                            autoComplete="password"
                        />
                        <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
                            <Ionicons
                                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                                size={20}
                                color={theme.colors.text.muted}
                            />
                        </Pressable>
                    </View>
                    {errors.password && <Text style={styles.errorText}>{errors.password}</Text>}

                    {/* Submit Button */}
                    <Pressable
                        style={({ pressed }) => [
                            styles.submitButton,
                            pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }
                        ]}
                        onPress={handleSubmit}
                        disabled={loading}
                    >
                        <LinearGradient
                            colors={['#3d7aff', '#6366f1']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.submitGradient}
                        >
                            {loading ? (
                                <ActivityIndicator color="white" />
                            ) : (
                                <Text style={styles.submitText}>
                                    {mode === 'login' ? 'Sign In' : 'Create Account'}
                                </Text>
                            )}
                        </LinearGradient>
                    </Pressable>

                    {/* Toggle Mode */}
                    <View style={styles.toggleContainer}>
                        <Text style={styles.toggleText}>
                            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
                        </Text>
                        <Pressable onPress={toggleMode}>
                            <Text style={styles.toggleLink}>
                                {mode === 'login' ? 'Sign Up' : 'Sign In'}
                            </Text>
                        </Pressable>
                    </View>
                </View>

                {/* Footer */}
                <View style={styles.footer}>
                    <Text style={styles.footerText}>
                        By continuing, you agree to our Terms of Service and Privacy Policy
                    </Text>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.bg.primary,
    },
    scrollContent: {
        flexGrow: 1,
        paddingHorizontal: 24,
    },
    header: {
        alignItems: 'center',
        marginBottom: 40,
    },
    logoContainer: {
        width: 100,
        height: 100,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
    },
    logoImage: {
        width: '100%',
        height: '100%',
    },
    title: {
        fontSize: 28,
        fontWeight: theme.font.weight.bold,
        color: 'white',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 15,
        color: theme.colors.text.secondary,
        textAlign: 'center',
    },
    form: {
        flex: 1,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.bg.secondary,
        borderRadius: 12,
        marginBottom: 8,
        paddingHorizontal: 16,
        borderWidth: 1,
        borderColor: theme.colors.border.light,
    },
    inputIcon: {
        marginRight: 12,
    },
    input: {
        flex: 1,
        height: 52,
        color: 'white',
        fontSize: 16,
    },
    eyeIcon: {
        padding: 4,
    },
    errorText: {
        color: theme.colors.status.danger,
        fontSize: 12,
        marginBottom: 8,
        marginLeft: 4,
    },
    submitButton: {
        marginTop: 16,
        borderRadius: 12,
        overflow: 'hidden',
    },
    submitGradient: {
        paddingVertical: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    submitText: {
        color: 'white',
        fontSize: 16,
        fontWeight: theme.font.weight.semibold,
    },
    toggleContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginTop: 24,
    },
    toggleText: {
        color: theme.colors.text.secondary,
        fontSize: 14,
    },
    toggleLink: {
        color: theme.colors.accent.blue,
        fontSize: 14,
        fontWeight: theme.font.weight.semibold,
    },
    footer: {
        alignItems: 'center',
        marginTop: 40,
        paddingHorizontal: 20,
    },
    footerText: {
        color: theme.colors.text.muted,
        fontSize: 12,
        textAlign: 'center',
        lineHeight: 18,
    },
});

export default AuthScreen;
