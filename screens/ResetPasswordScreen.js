/**
 * ResetPasswordScreen
 *
 * Shown when the user opens a password-reset deep link (secureshare://reset-password).
 * By this point AuthContext has already established a recovery session from the
 * link's tokens. Here the user picks a new password, which is persisted to
 * Supabase via updateUser(), after which recovery mode ends and they continue
 * into the app.
 */

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import theme from '../theme';

const ResetPasswordScreen = () => {
    const insets = useSafeAreaInsets();
    const { completePasswordReset, cancelPasswordRecovery } = useAuth();

    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    const handleSubmit = async () => {
        setError(null);
        if (password.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }
        if (password !== confirm) {
            setError('Passwords do not match');
            return;
        }
        setSubmitting(true);
        const { success, error: err } = await completePasswordReset(password);
        setSubmitting(false);
        if (!success) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            setError(err || 'Could not update your password. Try the link again.');
            return;
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Password Updated', 'Your password has been changed. You are now signed in.');
    };

    const handleCancel = () => {
        Alert.alert('Cancel Reset', 'Cancel changing your password?', [
            { text: 'Keep Editing', style: 'cancel' },
            { text: 'Cancel', style: 'destructive', onPress: () => cancelPasswordRecovery() },
        ]);
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <View style={[styles.content, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 20 }]}>
                <View style={styles.iconBg}>
                    <Ionicons name="lock-open-outline" size={40} color={theme.colors.accent.blue} />
                </View>
                <Text style={styles.title}>Set a New Password</Text>
                <Text style={styles.subtitle}>Choose a new password for your account.</Text>

                <View style={styles.inputContainer}>
                    <Ionicons name="lock-closed-outline" size={20} color={theme.colors.text.muted} style={styles.inputIcon} />
                    <TextInput
                        style={styles.input}
                        placeholder="New Password"
                        placeholderTextColor={theme.colors.text.muted}
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry={!showPassword}
                        autoCapitalize="none"
                    />
                    <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
                        <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={theme.colors.text.muted} />
                    </Pressable>
                </View>

                <View style={styles.inputContainer}>
                    <Ionicons name="lock-closed-outline" size={20} color={theme.colors.text.muted} style={styles.inputIcon} />
                    <TextInput
                        style={styles.input}
                        placeholder="Confirm New Password"
                        placeholderTextColor={theme.colors.text.muted}
                        value={confirm}
                        onChangeText={setConfirm}
                        secureTextEntry={!showPassword}
                        autoCapitalize="none"
                    />
                </View>

                {error && <Text style={styles.errorText}>{error}</Text>}

                <Pressable style={styles.submitButton} onPress={handleSubmit} disabled={submitting}>
                    <LinearGradient
                        colors={['#3d7aff', '#6366f1']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.submitGradient}
                    >
                        {submitting ? (
                            <ActivityIndicator color="white" />
                        ) : (
                            <Text style={styles.submitText}>Update Password</Text>
                        )}
                    </LinearGradient>
                </Pressable>

                <Pressable onPress={handleCancel} style={styles.cancelWrap} hitSlop={8}>
                    <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
            </View>
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg.primary },
    content: { flex: 1, paddingHorizontal: 24, alignItems: 'center' },
    iconBg: {
        width: 88,
        height: 88,
        borderRadius: 44,
        backgroundColor: 'rgba(61, 122, 255, 0.12)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
    },
    title: { fontSize: 24, fontWeight: theme.font.weight.bold, color: 'white', marginBottom: 8 },
    subtitle: { fontSize: 15, color: theme.colors.text.secondary, textAlign: 'center', marginBottom: 32 },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.bg.secondary,
        borderRadius: 12,
        marginBottom: 12,
        paddingHorizontal: 16,
        borderWidth: 1,
        borderColor: theme.colors.border.light,
        width: '100%',
    },
    inputIcon: { marginRight: 12 },
    input: { flex: 1, height: 52, color: 'white', fontSize: 16 },
    eyeIcon: { padding: 4 },
    errorText: { color: theme.colors.status.danger, fontSize: 13, marginBottom: 8, alignSelf: 'flex-start' },
    submitButton: { marginTop: 8, borderRadius: 12, overflow: 'hidden', width: '100%' },
    submitGradient: { paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
    submitText: { color: 'white', fontSize: 16, fontWeight: theme.font.weight.semibold },
    cancelWrap: { marginTop: 20 },
    cancelText: { color: theme.colors.text.secondary, fontSize: 14, fontWeight: theme.font.weight.semibold },
});

export default ResetPasswordScreen;
