/**
 * QRCodeModal Component
 * 
 * Generates and displays QR code for quick document sharing.
 * Uses react-native-qrcode-svg for QR generation.
 */

import React, { useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    Pressable,
    Share,
    Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import theme from '../theme';

// Note: Requires: npm install react-native-qrcode-svg react-native-svg
// For now, we'll create a placeholder that shows the link
// In production, uncomment the QRCode import:
// import QRCode from 'react-native-qrcode-svg';

const QRCodeModal = ({
    visible,
    onClose,
    documentId,
    documentName,
    recipientEmail,
}) => {
    // Generate deep link for the document
    const shareLink = useMemo(() => {
        // In production, this would be your app's deep link
        return `secureshare://view/${documentId}?recipient=${encodeURIComponent(recipientEmail || '')}`;
    }, [documentId, recipientEmail]);

    const handleCopyLink = async () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        await Clipboard.setStringAsync(shareLink);
        Alert.alert('Copied!', 'Link copied to clipboard');
    };

    const handleShare = async () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        try {
            await Share.share({
                message: `View secure document "${documentName}" on SecureShare:\n${shareLink}`,
                title: 'Share Document Link',
            });
        } catch (error) {
            console.error('Share error:', error);
        }
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <Pressable style={styles.overlay} onPress={onClose}>
                <Pressable style={styles.content} onPress={(e) => e.stopPropagation()}>
                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={styles.title}>Share via QR Code</Text>
                        <Pressable onPress={onClose} style={styles.closeButton}>
                            <Ionicons name="close" size={24} color={theme.colors.text.muted} />
                        </Pressable>
                    </View>

                    {/* Document Name */}
                    <Text style={styles.docName} numberOfLines={2}>{documentName}</Text>

                    {/* QR Code Container */}
                    <View style={styles.qrContainer}>
                        <LinearGradient
                            colors={['rgba(61, 122, 255, 0.1)', 'rgba(99, 102, 241, 0.1)']}
                            style={styles.qrGradient}
                        >
                            {/* In production, replace with:
                            <QRCode
                                value={shareLink}
                                size={180}
                                color="#000"
                                backgroundColor="#fff"
                            />
                            */}
                            <View style={styles.qrPlaceholder}>
                                <Ionicons name="qr-code" size={120} color={theme.colors.accent.blue} />
                                <Text style={styles.qrNote}>QR Code</Text>
                            </View>
                        </LinearGradient>
                    </View>

                    {/* Instructions */}
                    <Text style={styles.instructions}>
                        Scan this QR code to view the secure document
                    </Text>

                    {/* Action Buttons */}
                    <View style={styles.actions}>
                        <Pressable
                            style={styles.actionButton}
                            onPress={handleCopyLink}
                        >
                            <Ionicons name="copy-outline" size={20} color={theme.colors.accent.blue} />
                            <Text style={styles.actionText}>Copy Link</Text>
                        </Pressable>

                        <Pressable
                            style={[styles.actionButton, styles.shareButton]}
                            onPress={handleShare}
                        >
                            <Ionicons name="share-outline" size={20} color="white" />
                            <Text style={[styles.actionText, { color: 'white' }]}>Share</Text>
                        </Pressable>
                    </View>

                    {/* Link Preview */}
                    <View style={styles.linkContainer}>
                        <Text style={styles.linkLabel}>SECURE LINK</Text>
                        <Text style={styles.link} numberOfLines={2}>{shareLink}</Text>
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.8)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    content: {
        width: '100%',
        maxWidth: 360,
        backgroundColor: theme.colors.bg.elevated,
        borderRadius: 20,
        padding: 24,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    title: {
        color: 'white',
        fontSize: 18,
        fontWeight: 'bold',
    },
    closeButton: {
        padding: 4,
    },
    docName: {
        color: theme.colors.text.secondary,
        fontSize: 14,
        marginBottom: 20,
    },
    qrContainer: {
        alignItems: 'center',
        marginBottom: 20,
    },
    qrGradient: {
        padding: 20,
        borderRadius: 16,
    },
    qrPlaceholder: {
        width: 180,
        height: 180,
        backgroundColor: 'white',
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    qrNote: {
        color: theme.colors.text.muted,
        fontSize: 12,
        marginTop: 8,
    },
    instructions: {
        color: theme.colors.text.muted,
        fontSize: 13,
        textAlign: 'center',
        marginBottom: 20,
    },
    actions: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 20,
    },
    actionButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 12,
        borderRadius: 10,
        backgroundColor: theme.colors.bg.secondary,
        borderWidth: 1,
        borderColor: theme.colors.border.light,
    },
    shareButton: {
        backgroundColor: theme.colors.accent.blue,
        borderColor: theme.colors.accent.blue,
    },
    actionText: {
        color: theme.colors.accent.blue,
        fontSize: 14,
        fontWeight: '600',
    },
    linkContainer: {
        backgroundColor: theme.colors.bg.secondary,
        borderRadius: 10,
        padding: 12,
    },
    linkLabel: {
        color: theme.colors.text.muted,
        fontSize: 10,
        letterSpacing: 1,
        marginBottom: 6,
    },
    link: {
        color: theme.colors.text.secondary,
        fontSize: 12,
        fontFamily: 'monospace',
    },
});

export default QRCodeModal;
