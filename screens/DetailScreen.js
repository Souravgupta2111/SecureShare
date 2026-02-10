import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, Image, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import theme from '../theme';
import AnimatedHeader from '../components/AnimatedHeader';
import StatusBadge from '../components/StatusBadge';
import * as storage from '../utils/storage';
import { getCleanImageBase64 } from '../utils/watermark';

const DetailScreen = ({ route, navigation }) => {
    const { document: initialDoc } = route.params;
    const [doc, setDoc] = useState(initialDoc);
    const [docData, setDocData] = useState(null);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const isFocused = useIsFocused();

    const loadDoc = async () => {
        const updated = await storage.getDocumentByUUID(doc.uuid);
        if (updated) setDoc(updated);

        // Load file data for preview
        const fullDoc = await storage.getDocumentWithData(doc.uuid);
        setDocData(fullDoc);
        setIsLoadingData(false);
    };

    useEffect(() => {
        if (isFocused) {
            loadDoc();
        }
    }, [isFocused]);

    const handleRevoke = () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        Alert.alert(
            "Revoke Access",
            "Revoke access to this document? This cannot be undone.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Revoke",
                    style: "destructive",
                    onPress: async () => {
                        const updated = await storage.revokeDocument(doc.uuid);
                        setDoc(updated);
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    }
                }
            ]
        );
    };

    const handleVerify = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        // Navigate to Verify tab -> VerifyLeakScreen
        navigation.navigate('Verify', {
            screen: 'VerifyLeakScreen',
            params: { preloadedDocument: doc }
        });
    };

    // Stats (defensive defaults for cloud docs that may not have recipients yet)
    const recipients = (doc && Array.isArray(doc.recipients)) ? doc.recipients : [];
    const totalOpens = recipients.length > 0 ? recipients.reduce((a, r) => a + (r.openCount || 0), 0) : 0;
    const totalSeconds = recipients.length > 0 ? recipients.reduce((a, r) => a + (r.totalViewTime || 0), 0) : 0;
    const timeStr = totalSeconds >= 60 ? `${Math.floor(totalSeconds / 60)}m ${totalSeconds % 60}s` : `${totalSeconds}s`;

    // Determine if active
    let displayStatus = doc.status;
    if (displayStatus === 'active' && doc.expiresAt < Date.now()) {
        displayStatus = 'expired';
    }

    const formatDate = (ts) => {
        const d = new Date(ts);
        return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const getThumbnail = () => {
        if (doc.fileType === 'image' && docData) {
            const displayData = docData.watermarkedData || docData.originalData;
            if (!displayData) return null;
            const cleanBase64 = getCleanImageBase64(displayData);
            return { uri: `data:${doc.mimeType};base64,${cleanBase64}` };
        }
        return null;
    };

    return (
        <View style={styles.container}>
            <AnimatedHeader
                title={doc.filename}
                showBack={true}
                onBack={() => navigation.goBack()}
            />

            <ScrollView contentContainerStyle={styles.content}>

                {/* Section 1: Preview Card */}
                <Pressable
                    style={styles.previewCard}
                    onPress={() => navigation.navigate('ViewerScreen', { document: doc })} // Wait, screen name in Stack is 'ViewerScreen'? 
                // In App.js we will define 'ViewerScreen' inside the Home Stack.
                >
                    {doc.fileType === 'image' ? (
                        <Image source={getThumbnail()} style={styles.previewImage} resizeMode="cover" />
                    ) : (
                        <View style={styles.docPlaceholder}>
                            <Ionicons name="document-text" size={40} color="white" />
                        </View>
                    )}
                    <View style={styles.previewOverlay}>
                        <Text style={styles.previewText}>{doc.filename}</Text>
                    </View>
                    <Text style={styles.tapLabel}>Tap to open secure viewer</Text>
                </Pressable>

                {/* Section 2: Info Grid */}
                <View style={styles.grid}>
                    <View style={styles.gridItem}>
                        <View style={styles.gridIcon}><Ionicons name="calendar-outline" size={16} color="white" /></View>
                        <Text style={styles.gridValue}>{formatDate(doc.sharedAt).split(' ')[0]}</Text>
                        <Text style={styles.gridLabel}>Shared On</Text>
                    </View>
                    <View style={styles.gridItem}>
                        <View style={styles.gridIcon}><Ionicons name="time-outline" size={16} color="white" /></View>
                        <Text style={[styles.gridValue, displayStatus !== 'active' && { color: theme.colors.status.danger }]}>
                            {displayStatus === 'active' ? formatDate(doc.expiresAt).split(' ')[0] : (displayStatus === 'revoked' ? 'Revoked' : 'Expired')}
                        </Text>
                        <Text style={styles.gridLabel}>Expires</Text>
                    </View>
                    <View style={styles.gridItem}>
                        <View style={styles.gridIcon}><Ionicons name="eye-outline" size={16} color="white" /></View>
                        <Text style={styles.gridValue}>{totalOpens}</Text>
                        <Text style={styles.gridLabel}>Opens</Text>
                    </View>
                    <View style={styles.gridItem}>
                        <View style={styles.gridIcon}><Ionicons name="hourglass-outline" size={16} color="white" /></View>
                        <Text style={styles.gridValue}>{timeStr}</Text>
                        <Text style={styles.gridLabel}>View Time</Text>
                    </View>
                </View>

                {/* Section 3: Recipients */}
                <Text style={styles.sectionTitle}>SHARED WITH</Text>
                <View style={styles.sectionContainer}>
                    {recipients.map((r, i) => (
                        <View key={i} style={styles.recipientRow}>
                            <View style={[styles.dot, r.openedAt ? { backgroundColor: theme.colors.status.active } : { backgroundColor: '#6b7280' }]} />
                            <View style={{ flex: 1 }}>
                                <Text style={styles.recipientEmail}>{r.email}</Text>
                            </View>
                            <Text style={styles.recipientMeta}>
                                {r.openedAt ? `Opened · ${formatDate(r.openedAt)}` : 'Not opened yet'}
                            </Text>
                        </View>
                    ))}
                </View>

                {/* Section 4: Security Activity */}
                <Text style={styles.sectionTitle}>SECURITY ACTIVITY</Text>
                <View style={styles.sectionContainer}>
                    {(!doc.securityEvents || doc.securityEvents.length === 0) ? (
                        <Text style={styles.noEvents}>No security events</Text>
                    ) : (
                        <View style={styles.timeline}>
                            {doc.securityEvents.slice(0, 3).map((e, i) => ( // Show top 3
                                <View key={i} style={styles.eventRow}>
                                    <View style={[styles.eventDot,
                                    e.eventType === 'screenshot' ? { backgroundColor: theme.colors.status.danger } :
                                        e.eventType === 'screen_recording' ? { backgroundColor: theme.colors.status.warning } :
                                            { backgroundColor: theme.colors.status.purple }
                                    ]} />
                                    <View style={styles.eventLine} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.eventText}>
                                            {e.eventType === 'screenshot' ? 'Screenshot Detected' :
                                                e.eventType === 'screen_recording' ? 'Recording Detected' : 'Copy Blocked'}
                                        </Text>
                                        <Text style={styles.eventTime}>{formatDate(e.timestamp)}</Text>
                                    </View>
                                </View>
                            ))}
                        </View>
                    )}
                    <Pressable onPress={() => navigation.navigate('Security')}>
                        <Text style={styles.viewLogLink}>View Full Log →</Text>
                    </Pressable>
                </View>

                import QRCodeModal from '../components/QRCodeModal';

                // ... (inside component)
                const [qrVisible, setQrVisible] = useState(false);

                // ... (in render)
                {/* Actions */}
                <View style={styles.actionsRow}>
                    <Pressable style={styles.revokeBtn} onPress={handleRevoke}>
                        <Text style={styles.revokeText}>Revoke Access</Text>
                    </Pressable>
                    <Pressable style={styles.verifyBtn} onPress={handleVerify}>
                        <Text style={styles.verifyText}>Verify Watermark</Text>
                    </Pressable>
                </View>

                {/* Secondary Actions */}
                <View style={styles.secondaryActions}>
                    <Pressable
                        style={styles.actionButton}
                        onPress={() => navigation.navigate('Comments', { documentId: doc.uuid, documentName: doc.filename })}
                    >
                        <Ionicons name="chatbubbles-outline" size={20} color="white" />
                        <Text style={styles.actionText}>Comments ({doc.commentCount || 0})</Text>
                    </Pressable>

                    <Pressable
                        style={styles.actionButton}
                        onPress={() => setQrVisible(true)}
                    >
                        <Ionicons name="qr-code-outline" size={20} color="white" />
                        <Text style={styles.actionText}>QR Code</Text>
                    </Pressable>
                </View>

                <View style={{ height: 40 }} />
            </ScrollView>

            <QRCodeModal
                visible={qrVisible}
                onClose={() => setQrVisible(false)}
                documentId={doc.uuid}
                documentName={doc.filename}
            // Recipient email handling could be added if we were selecting a recipient to share with
            // For now, general deep link or we assume owner share logic
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.bg.primary,
    },
    content: {
        padding: 16,
    },
    previewCard: {
        backgroundColor: theme.colors.bg.secondary,
        borderRadius: 16,
        padding: 16,
        alignItems: 'center',
        marginBottom: 24,
    },
    previewImage: {
        width: '100%',
        height: 180,
        borderRadius: 12,
    },
    docPlaceholder: {
        width: 60, height: 60,
        borderRadius: 12,
        backgroundColor: theme.colors.accent.blue,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
    },
    previewOverlay: {
        marginTop: 12,
    },
    previewText: {
        fontSize: 15,
        color: 'white',
        fontWeight: '600',
    },
    tapLabel: {
        fontSize: 12,
        color: theme.colors.text.muted,
        marginTop: 8,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        marginBottom: 24,
    },
    gridItem: {
        width: '48%',
        backgroundColor: theme.colors.bg.tertiary,
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: theme.colors.border.subtle,
    },
    gridIcon: {
        width: 32, height: 32,
        borderRadius: 16,
        backgroundColor: theme.colors.bg.secondary,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
    },
    gridValue: {
        fontSize: 20,
        fontWeight: '600',
        color: 'white',
        marginBottom: 2,
    },
    gridLabel: {
        fontSize: 12,
        color: theme.colors.text.muted,
    },
    sectionTitle: {
        fontSize: 11,
        color: theme.colors.text.muted,
        letterSpacing: 1,
        marginBottom: 12,
    },
    sectionContainer: {
        marginBottom: 24,
    },
    recipientRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        gap: 12,
    },
    dot: {
        width: 8, height: 8, borderRadius: 4,
    },
    recipientEmail: {
        color: 'white',
        fontSize: 14,
    },
    recipientMeta: {
        color: theme.colors.text.muted,
        fontSize: 12,
    },
    noEvents: {
        color: theme.colors.text.muted,
        fontSize: 13,
        fontStyle: 'italic',
        marginBottom: 8,
    },
    viewLogLink: {
        color: theme.colors.accent.blue,
        fontSize: 13,
        marginTop: 8,
    },
    timeline: {
        paddingLeft: 4,
    },
    eventRow: {
        flexDirection: 'row',
        marginBottom: 16,
        position: 'relative',
    },
    eventDot: {
        width: 8, height: 8, borderRadius: 4,
        marginTop: 6,
        marginRight: 12,
        zIndex: 1,
    },
    eventLine: {
        position: 'absolute',
        left: 3, top: 14, bottom: -14,
        width: 2,
        backgroundColor: theme.colors.border.light,
        zIndex: 0,
    },
    eventText: {
        color: 'white', fontSize: 14, fontWeight: '500',
    },
    eventTime: {
        color: theme.colors.text.muted,
        fontSize: 12,
    },
    actionsRow: {
        flexDirection: 'row',
        gap: 16,
    },
    revokeBtn: {
        flex: 1,
        borderWidth: 1.5,
        borderColor: theme.colors.status.danger,
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
    },
    revokeText: {
        color: theme.colors.status.danger,
        fontWeight: '600',
    },
    verifyBtn: {
        flex: 1,
        borderWidth: 1.5,
        borderColor: theme.colors.accent.blue,
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
    },
    verifyText: {
        color: theme.colors.accent.blue,
        fontWeight: '600',
    },
    secondaryActions: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 16,
    },
    actionButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: theme.colors.bg.secondary,
        paddingVertical: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.colors.border.light,
    },
    actionText: {
        color: 'white',
        fontWeight: '600',
        fontSize: 14,
    }
});

export default DetailScreen;
