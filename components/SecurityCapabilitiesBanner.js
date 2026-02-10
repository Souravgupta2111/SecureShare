/**
 * SecurityCapabilitiesBanner
 *
 * Displays security capability warnings for Expo Go vs Dev Client builds.
 * Shows different messages based on available security features.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable, Linking, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';

const SECURITY_CHECK_KEY = 'secureshare_security_check_done';

export const checkSecurityCapabilities = async () => {
    const capabilities = {
        isExpoGo: __DEV__ && !global.nativeExtensionsRevoked,
        flagSecureAvailable: false,
        lsbSteganographyAvailable: false,
        isFullProtection: false,
    };

    try {
        // Check if we've already determined capabilities
        const stored = await SecureStore.getItemAsync(SECURITY_CHECK_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            return { ...capabilities, ...parsed };
        }

        // Try to check for native modules (only works in dev client)
        try {
            const SecureWatermark = require('../../modules/secure-watermark').default;
            if (SecureWatermark && typeof SecureWatermark.embedLSB === 'function') {
                capabilities.lsbSteganographyAvailable = true;
            }
        } catch (_e) {
            capabilities.isExpoGo = true;
        }

        try {
            const SecurityBridge = require('../../native/SecurityBridge');
            if (SecurityBridge && typeof SecurityBridge.enableSecureMode === 'function') {
                capabilities.flagSecureAvailable = true;
            }
        } catch (_e) {
        }

        capabilities.isFullProtection = capabilities.lsbSteganographyAvailable && capabilities.flagSecureAvailable;

        // Cache the result
        await SecureStore.setItemAsync(SECURITY_CHECK_KEY, JSON.stringify(capabilities));

        return capabilities;
    } catch (error) {
        console.warn('[SecurityBanner] Capability check failed:', error);
        return capabilities;
    }
};

export const SecurityCapabilitiesBanner = ({ onLearnMore }) => {
    const [capabilities, setCapabilities] = React.useState(null);

    React.useEffect(() => {
        checkSecurityCapabilities().then(setCapabilities);
    }, []);

    if (!capabilities) {
        return null;
    }

    // Full protection - no banner needed
    if (capabilities.isFullProtection) {
        return null;
    }

    const isAndroid = Platform.OS === 'android';
    const isIOS = Platform.OS === 'ios';

    const getMessage = () => {
        if (isAndroid && !capabilities.flagSecureAvailable) {
            return {
                icon: 'shield-outline',
                iconColor: '#F59E0B',
                title: 'Screenshot Protection Limited',
                message: 'Screenshot blocking requires a development client build. Running in Expo Go mode.',
                buttonText: 'Learn More',
                link: 'https://docs.expo.dev/development/create-dev-builds/',
            };
        }
        if (isIOS && !capabilities.lsbSteganographyAvailable) {
            return {
                icon: 'image-outline',
                iconColor: '#F59E0B',
                title: 'Invisible Watermarks Limited',
                message: 'Advanced watermark features require a development client build.',
                buttonText: 'Learn More',
                link: 'https://docs.expo.dev/development/create-dev-builds/',
            };
        }
        return {
            icon: 'warning-outline',
            iconColor: '#F59E0B',
            title: 'Security Features Limited',
            message: 'Some security features are reduced in Expo Go. Build a development client for full protection.',
            buttonText: 'Get Full Protection',
            link: 'https://docs.expo.dev/development/create-dev-builds/',
        };
    };

    const { icon, iconColor, title, message, buttonText, link } = getMessage();

    return (
        <View style={styles.banner}>
            <View style={styles.iconContainer}>
                <Ionicons name={icon} size={24} color={iconColor} />
            </View>
            <View style={styles.content}>
                <Text style={styles.title}>{title}</Text>
                <Text style={styles.message}>{message}</Text>
            </View>
            <Pressable
                style={styles.button}
                onPress={() => onLearnMore?.() || Linking.openURL(link)}
            >
                <Text style={styles.buttonText}>{buttonText}</Text>
            </Pressable>
        </View>
    );
};

export default SecurityCapabilitiesBanner;

const styles = StyleSheet.create({
    banner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        borderColor: 'rgba(245, 158, 11, 0.3)',
        borderWidth: 1,
        borderRadius: 12,
        padding: 12,
        marginHorizontal: 16,
        marginVertical: 8,
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(245, 158, 11, 0.2)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    content: {
        flex: 1,
    },
    title: {
        fontSize: 14,
        fontWeight: '600',
        color: '#F59E0B',
        marginBottom: 2,
    },
    message: {
        fontSize: 12,
        color: '#9CA3AF',
        lineHeight: 16,
    },
    button: {
        backgroundColor: '#F59E0B',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
    },
    buttonText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#000',
    },
});
