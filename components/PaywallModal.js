/**
 * PaywallModal — SecureSend Pro upgrade sheet.
 * Renders the offering's packages dynamically (localized prices come from the
 * store). Includes the App Store-required Restore button, price/period, and
 * links to Terms/Privacy + auto-renew disclosure.
 */

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Linking,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import theme from '../theme';

const PRIVACY_URL = 'https://souravgupta2111.github.io/SecureShare/privacy-policy.html';
const TERMS_URL = 'https://souravgupta2111.github.io/SecureShare/terms.html';

const BENEFITS = [
    { icon: 'infinite', text: 'Unlimited documents (Free is limited to 5)' },
    { icon: 'bar-chart', text: 'Full view analytics — see who opened what, when' },
    { icon: 'search', text: 'Verify Leak — forensic scan to trace leaked copies' },
    { icon: 'shield-checkmark', text: 'All encryption, watermarking & DRM (always included)' },
];

const periodLabel = (pkg) => {
    const t = (pkg.packageType || '').toUpperCase();
    if (t === 'ANNUAL') return '/year';
    if (t === 'MONTHLY') return '/month';
    if (t === 'WEEKLY') return '/week';
    return '';
};

const PaywallModal = ({ visible, onClose, packages = [], available, onPurchase, onRestore }) => {
    const [busy, setBusy] = useState(false);

    const buy = async (pkg) => {
        setBusy(true);
        const res = await onPurchase(pkg);
        setBusy(false);
        if (!res.success && !res.cancelled) {
            Alert.alert('Purchase Failed', res.error || 'Please try again.');
        }
    };

    const restore = async () => {
        setBusy(true);
        const res = await onRestore();
        setBusy(false);
        Alert.alert(res.success ? 'Restored' : 'Nothing to Restore',
            res.success ? 'Your SecureSend Pro subscription is active.' : 'No active subscription found for this account.');
    };

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={styles.backdrop}>
                <View style={styles.sheet}>
                    <Pressable style={styles.close} onPress={onClose} hitSlop={10}>
                        <Ionicons name="close" size={24} color={theme.colors.text.secondary} />
                    </Pressable>

                    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                        <View style={styles.badge}>
                            <Ionicons name="lock-open" size={26} color="white" />
                        </View>
                        <Text style={styles.title}>SecureSend Pro</Text>
                        <Text style={styles.subtitle}>Unlock the full power of secure sharing.</Text>

                        <View style={styles.benefits}>
                            {BENEFITS.map((b) => (
                                <View key={b.text} style={styles.benefitRow}>
                                    <Ionicons name={b.icon} size={18} color={theme.colors.accent.blue} />
                                    <Text style={styles.benefitText}>{b.text}</Text>
                                </View>
                            ))}
                        </View>

                        {available && packages.length > 0 ? (
                            packages.map((pkg) => (
                                <Pressable key={pkg.identifier} style={styles.planButton} onPress={() => buy(pkg)} disabled={busy}>
                                    <LinearGradient
                                        colors={['#3d7aff', '#6366f1']}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 0 }}
                                        style={styles.planGradient}
                                    >
                                        {busy ? (
                                            <ActivityIndicator color="white" />
                                        ) : (
                                            <Text style={styles.planText}>
                                                {pkg.product?.priceString} {periodLabel(pkg)}
                                            </Text>
                                        )}
                                    </LinearGradient>
                                </Pressable>
                            ))
                        ) : (
                            <View style={styles.unavailable}>
                                <Text style={styles.unavailableText}>
                                    Subscriptions aren’t available in this build yet. Add your RevenueCat key
                                    and rebuild to enable purchases.
                                </Text>
                            </View>
                        )}

                        <Pressable onPress={restore} disabled={busy} style={styles.restoreBtn}>
                            <Text style={styles.restoreText}>Restore Purchases</Text>
                        </Pressable>

                        <Text style={styles.disclosure}>
                            Subscriptions renew automatically until cancelled. Manage or cancel anytime in your
                            App Store account settings. By subscribing you agree to our{' '}
                            <Text style={styles.link} onPress={() => Linking.openURL(TERMS_URL)}>Terms</Text> and{' '}
                            <Text style={styles.link} onPress={() => Linking.openURL(PRIVACY_URL)}>Privacy Policy</Text>.
                        </Text>
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    sheet: {
        backgroundColor: theme.colors.bg.primary,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: '88%',
        paddingTop: 16,
    },
    close: { position: 'absolute', top: 14, right: 16, zIndex: 2, padding: 4 },
    content: { paddingHorizontal: 24, paddingBottom: 40, alignItems: 'center' },
    badge: {
        width: 64, height: 64, borderRadius: 20, marginTop: 12, marginBottom: 16,
        backgroundColor: theme.colors.accent.blue, alignItems: 'center', justifyContent: 'center',
    },
    title: { fontSize: 26, fontWeight: '800', color: 'white', marginBottom: 6 },
    subtitle: { fontSize: 15, color: theme.colors.text.secondary, textAlign: 'center', marginBottom: 24 },
    benefits: { alignSelf: 'stretch', gap: 14, marginBottom: 28 },
    benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    benefitText: { flex: 1, color: 'white', fontSize: 14, lineHeight: 20 },
    planButton: { alignSelf: 'stretch', borderRadius: 14, overflow: 'hidden', marginBottom: 12 },
    planGradient: { paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
    planText: { color: 'white', fontSize: 16, fontWeight: '700' },
    unavailable: { alignSelf: 'stretch', padding: 16, borderRadius: 12, backgroundColor: theme.colors.bg.secondary, marginBottom: 12 },
    unavailableText: { color: theme.colors.text.secondary, fontSize: 13, textAlign: 'center', lineHeight: 19 },
    restoreBtn: { paddingVertical: 12, marginBottom: 12 },
    restoreText: { color: theme.colors.accent.blue, fontSize: 15, fontWeight: '600' },
    disclosure: { color: theme.colors.text.muted, fontSize: 11, textAlign: 'center', lineHeight: 16 },
    link: { color: theme.colors.accent.blue },
});

export default PaywallModal;
