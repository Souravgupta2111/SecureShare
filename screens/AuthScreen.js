/**
 * AuthScreen - Login/Register Screen
 * 
 * Beautiful authentication screen with email/password login
 * and registration functionality.
 */

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    KeyboardAvoidingView,
    Linking,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import theme from '../theme';

const PRIVACY_URL = 'https://souravgupta2111.github.io/SecureShare/privacy-policy.html';
const TERMS_URL = 'https://souravgupta2111.github.io/SecureShare/terms.html';

const AuthScreen = () => {
    const insets = useSafeAreaInsets();
    const { signIn, signUp, resetPassword, loading } = useAuth();

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

    const handleForgotPassword = async () => {
        if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            Alert.alert('Enter your email', 'Type your account email in the field above, then tap Forgot Password.');
            return;
        }
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const { success, error } = await resetPassword(email.trim().toLowerCase());
        Alert.alert(
            success ? 'Check Your Email' : 'Error',
            success
                ? 'If an account exists for this email, a password reset link has been sent. Open it on this device to set a new password.'
                : (error || 'Could not send the reset email. Please try again.')
        );
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
                <View style={styles.centerBlock}>
                {/* Header */}
                <View style={styles.header}>
                    <View style={styles.logoContainer}>
                        <Image
                            source={require('../assets/images/icon.png')}
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

                    {/* Forgot Password (login only) */}
                    {mode === 'login' && (
                        <Pressable onPress={handleForgotPassword} style={styles.forgotWrap} hitSlop={8}>
                            <Text style={styles.forgotText}>Forgot Password?</Text>
                        </Pressable>
                    )}

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

                </View>

                {/* Footer */}
                <View style={styles.footer}>
                    <Text style={styles.footerText}>
                        By continuing, you agree to our{' '}
                        <Text style={styles.footerLink} onPress={() => Linking.openURL(TERMS_URL)}>
                            Terms of Service
                        </Text>
                        {' '}and{' '}
                        <Text style={styles.footerLink} onPress={() => Linking.openURL(PRIVACY_URL)}>
                            Privacy Policy
                        </Text>.
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
    centerBlock: {
        flex: 1,
        width: '100%',
        justifyContent: 'center',
    },
    header: {
        alignItems: 'center',
        marginBottom: 40,
    },
    logoContainer: {
        width: 92,
        height: 92,
        borderRadius: 22,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    logoImage: {
        width: '100%',
        height: '100%',
    },
    title: {
        fontSize: 30,
        fontWeight: theme.font.weight.bold,
        color: 'white',
        letterSpacing: 0.3,
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 15,
        color: theme.colors.text.secondary,
        textAlign: 'center',
    },
    form: {
        width: '100%',
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
    forgotWrap: {
        alignSelf: 'flex-end',
        marginTop: 4,
        marginBottom: 4,
    },
    forgotText: {
        color: theme.colors.accent.blue,
        fontSize: 13,
        fontWeight: theme.font.weight.semibold,
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
        paddingTop: 16,
        paddingHorizontal: 20,
    },
    footerText: {
        color: theme.colors.text.muted,
        fontSize: 12,
        textAlign: 'center',
        lineHeight: 18,
    },
    footerLink: {
        color: theme.colors.accent.blue,
        fontSize: 12,
        fontWeight: theme.font.weight.semibold,
    },
});

export default AuthScreen;
