/**
 * ViewerScreen - Secure Document Viewer
 * 
 * Zero-trust viewer with:
 * - Floating visible watermark (anti-camera)
 * - FLAG_SECURE on Android (via native module when available)
 * - Screenshot detection on iOS
 * - View analytics and heartbeat
 * - Security event logging
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import * as SecureStore from 'expo-secure-store';
import {
    View,
    Text,
    StyleSheet,
    Image,
    Pressable,
    StatusBar,
    ActivityIndicator,
    Platform,
    Alert,
    AppState
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { BlurView } from 'expo-blur';
import { ErrorBoundary } from '../components/ErrorBoundary';
import theme from '../theme';
import * as heartbeat from '../utils/heartbeat';
import * as security from '../utils/security';
import * as storage from '../utils/storage';
import { getCleanImageBase64, extractImageWatermarkAsync, extractDocumentWatermark, verifyWatermarkSignature } from '../utils/watermark';
import FloatingWatermark, { WatermarkBackground } from '../components/FloatingWatermark';
import { useAuth } from '../context/AuthContext';
import { logAnalyticsEvent, logSecurityEvent, downloadSecureBlob, getDocumentKey, validateAccessGrant } from '../lib/supabase';
import { queueAnalyticsEvent, queueSecurityEvent } from '../utils/analyticsQueue';
import { decryptData, decryptKey, importPrivateKey } from '../utils/crypto';
import { enableSecureMode, disableSecureMode, startScreenshotDetection, stopScreenshotDetection } from '../native/SecurityBridge';
import { generateDeviceHash } from '../utils/deviceSecurity';
import Pdf from 'react-native-pdf';

// Security: Clear clipboard to prevent data exfiltration
const clearClipboard = async () => {
    try {
        await Clipboard.setStringAsync('');
    } catch (e) {
        // Ignore clipboard errors
    }
};

// Helper to convert Blob to Base64
const blobToBase64 = (blob) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => {
            const result = reader.result;
            // result is "data:application/octet-stream;base64,....."
            if (typeof result === 'string') {
                // Split at comma to get the base64 payload
                const base64 = result.split(',')[1];
                resolve(base64);
            } else {
                reject(new Error("Unexpected FileReader result type"));
            }
        };
        // Use readAsDataURL to preserve binary integrity.
        // readAsText would try to parse bytes as UTF-8, mangling non-printable chars.
        reader.readAsDataURL(blob);
    });
};

const ViewerScreen = ({ route, navigation }) => {
    const { document: docMetadata, documentId, accessTokenId, recipientEmail: routeEmail } = route.params;
    const insets = useSafeAreaInsets();
    const { user } = useAuth();

    const [viewSeconds, setViewSeconds] = useState(0);
    const [documentData, setDocumentData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isBlurred, setIsBlurred] = useState(false); // For iOS screenshot blur
    const [sessionId] = useState(() => `session_${Date.now()}`);
    const [watermarkTampered, setWatermarkTampered] = useState(false); // HMAC verification state
    const appState = useRef(AppState.currentState);

    // Derive recipient email from route params or user
    const recipientEmail = routeEmail || user?.email || 'unknown';
    const docUuid = documentId || docMetadata?.uuid;

    // Log view start
    const logViewStart = useCallback(async () => {
        try {
            await queueAnalyticsEvent({
                document_id: docUuid,
                access_token_id: accessTokenId,
                recipient_email: recipientEmail,
                event_type: 'view_start',
                device_hash: Platform.OS,
                platform: Platform.OS,
                metadata: { session_id: sessionId }
            });
        } catch (e) {
            console.error('Failed to log view start:', e);
        }
    }, [docUuid, accessTokenId, recipientEmail, sessionId]);

    // Log view end
    const logViewEnd = useCallback(async (duration) => {
        try {
            await queueAnalyticsEvent({
                document_id: docUuid,
                access_token_id: accessTokenId,
                recipient_email: recipientEmail,
                event_type: 'view_end',
                session_duration: duration,
                platform: Platform.OS,
                metadata: { session_id: sessionId }
            });
        } catch (e) {
            console.error('Failed to log view end:', e);
        }
    }, [docUuid, accessTokenId, recipientEmail, sessionId]);

    // Log security event
    const logSecurityIncident = useCallback(async (eventType) => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

        try {
            await queueSecurityEvent({
                document_id: docUuid,
                access_token_id: accessTokenId,
                recipient_email: recipientEmail,
                event_type: eventType,
                platform: Platform.OS,
                blocked: Platform.OS === 'android' // Android blocks, iOS detects
            });
        } catch (e) {
            console.error('Failed to log security event:', e);
        }
    }, [docUuid, accessTokenId, recipientEmail]);

    useEffect(() => {
        const initViewer = async () => {
            try {
                // Enable OS-level screen protection
                if (Platform.OS === 'android') {
                    await enableSecureMode();
                } else if (Platform.OS === 'ios') {
                    startScreenshotDetection(
                        // Screenshot detected - blur immediately, then log and alert
                        async () => {
                            setIsBlurred(true);
                            await logSecurityIncident('screenshot');
                            setTimeout(() => {
                                setIsBlurred(false);
                                Alert.alert(
                                    'Screenshot Detected',
                                    'This activity has been logged and the document owner has been notified.'
                                );
                            }, 2000);
                        },
                        // Screen recording detected
                        () => logSecurityIncident('screen_recording')
                    );
                }

                // Generate device hash for validation
                const deviceHash = await generateDeviceHash();

                // Validate access for online documents
                if (docMetadata?.file_path && accessTokenId) {
                    const { valid, error } = await validateAccessGrant(accessTokenId, docMetadata.id, deviceHash);
                    if (!valid) {
                        Alert.alert(
                            'Access Denied',
                            error || 'This document is no longer accessible. It may have expired or been revoked.',
                            [{ text: 'OK', onPress: () => navigation.goBack() }]
                        );
                        return;
                    }
                }

                // Check expiry for local documents
                if (docMetadata?.expiresAt && docMetadata.expiresAt < Date.now()) {
                    Alert.alert(
                        'Document Expired',
                        'This document has expired and is no longer accessible.',
                        [{ text: 'OK', onPress: () => navigation.goBack() }]
                    );
                    return;
                }

                // Load document data (local or online)
                if (docMetadata) {
                    let fullDoc = null;

                    if (docMetadata.file_path) {
                        // --- ONLINE MODE ---
                        // 2. Download Blob (Encrypted)
                        const { data: blob, error: dlError } = await downloadSecureBlob(docMetadata.file_path);
                        if (dlError) throw dlError;

                        // 3. Convert Blob to String (It's an encrypted base64 string)
                        const encryptedStr = await blobToBase64(blob);

                        // 1. Get Key
                        const { data: keyData, error: keyError } = await getDocumentKey(docMetadata.id);
                        if (!keyData || keyError) {
                            console.error('[Viewer] Key fetch failed:', keyError);
                            // Only throw if we truly simply cannot proceed. 
                            // If we want to offer a "Reset" or "Re-upload" suggestion, we need to handle this.
                            throw new Error(`Decryption key missing. (DocID: ${docMetadata.id}, Error: ${keyError?.message || 'Not found'})`);
                        }

                        // 4. Decrypt
                        // ZERO-TRUST (RELAXED FOR STABILITY):
                        // Prefer RSA-unwrapped AES key when private key is available,
                        // but gracefully fall back to using the stored key directly.
                        // Read chunked private key (consistent with AuthContext storage)
                        const PRIVATE_KEY_STORAGE_KEY = 'secureshare_private_key';
                        const part0 = await SecureStore.getItemAsync(`${PRIVATE_KEY_STORAGE_KEY}_0`);
                        const part1 = await SecureStore.getItemAsync(`${PRIVATE_KEY_STORAGE_KEY}_1`);
                        const chunkedKey = (part0 && part1) ? (part0 + part1) : null;
                        // Fallback to legacy single-key storage
                        const privateKeyPem = chunkedKey || await SecureStore.getItemAsync(PRIVATE_KEY_STORAGE_KEY);
                        let aesKeyHex = null;

                        if (privateKeyPem) {
                            try {
                                const privateKey = await importPrivateKey(privateKeyPem);
                                aesKeyHex = await decryptKey(keyData.encrypted_key, privateKey);
                            } catch (e) {
                                console.warn('[Viewer] RSA key unwrap failed, falling back to raw key:', e);
                                aesKeyHex = keyData.encrypted_key;
                            }
                        } else {
                            console.warn('[Viewer] Private key not found. Using stored key directly (non-zero-trust fallback).');
                            aesKeyHex = keyData.encrypted_key;
                        }

                        // Then decrypt document with the AES Key (hex string)
                        const decryptedBase64 = await decryptData(encryptedStr, aesKeyHex);

                        // SECURITY: Verify watermark HMAC signature
                        try {
                            const isImage = docMetadata.mime_type?.startsWith('image/');
                            const fileExt = docMetadata.filename?.split('.').pop() || 'txt';

                            // Extract watermark from decrypted content
                            let extractedPayload = null;
                            if (isImage) {
                                // Use async extraction which tries native LSB first, then falls back to delimiter
                                const { data: payload, method } = await extractImageWatermarkAsync(decryptedBase64);
                                extractedPayload = payload;
                                if (payload) {
                                    console.log(`[Viewer] Watermark extracted via ${method} method`);
                                }
                            } else {
                                extractedPayload = extractDocumentWatermark(decryptedBase64, fileExt);
                            }

                            if (extractedPayload) {
                                // Verify HMAC signature using the decryption key
                                const { valid, error } = await verifyWatermarkSignature(
                                    extractedPayload,
                                    aesKeyHex
                                );

                                if (!valid) {
                                    console.warn('[Viewer] Watermark signature invalid:', error);
                                    setWatermarkTampered(true);

                                    // Log tamper detection as security event
                                    await queueSecurityEvent({
                                        document_id: docMetadata.id,
                                        access_token_id: accessTokenId,
                                        recipient_email: recipientEmail,
                                        event_type: 'watermark_tamper',
                                        platform: Platform.OS,
                                        blocked: false,
                                        metadata: { error, payload: extractedPayload?.substring(0, 100) }
                                    });
                                } else {
                                    console.log('[Viewer] Watermark signature verified successfully');
                                }
                            } else {
                                console.warn('[Viewer] No watermark found in document');
                            }
                        } catch (verifyError) {
                            console.warn('[Viewer] Watermark verification error:', verifyError);
                            // Don't block viewing, but log the issue
                        }

                        fullDoc = {
                            ...docMetadata,
                            originalData: decryptedBase64
                        };
                    } else {
                        // --- LOCAL MODE ---
                        fullDoc = await storage.getDocumentWithData(docMetadata.uuid);
                    }

                    if (fullDoc) setDocumentData(fullDoc);
                }

                setIsLoading(false);

                // Log view start
                await logViewStart();

                // Start tracking  
                heartbeat.startTracking(docUuid, recipientEmail);
                security.startMonitoring(docUuid, recipientEmail, docMetadata?.filename || 'document');

            } catch (e) {
                console.error('Viewer init error:', e);
                setIsLoading(false);
                Alert.alert('Error', 'Failed to load document. Please try again.');
            }
        };

        initViewer();

        // View timer
        const timer = setInterval(() => {
            setViewSeconds(val => val + 1);
        }, 1000);

        // Security: Clear clipboard on mount
        clearClipboard();

        // App state listener for background detection AND re-validation on resume
        const subscription = AppState.addEventListener('change', async (nextAppState) => {
            if (appState.current === 'active' && nextAppState.match(/inactive|background/)) {
                logSecurityIncident('app_backgrounded');
            }

            // Security: Revalidate access when returning to active
            if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
                // Clear clipboard when returning (prevent copy-out while backgrounded)
                await clearClipboard();

                // Re-validate access for online documents
                if (docMetadata?.file_path && accessTokenId) {
                    const deviceHash = await generateDeviceHash();
                    const { valid, error } = await validateAccessGrant(accessTokenId, docMetadata.id, deviceHash);
                    if (!valid) {
                        Alert.alert(
                            'Access Revoked',
                            error || 'Your access to this document has been revoked.',
                            [{ text: 'OK', onPress: () => navigation.goBack() }]
                        );
                    }
                }
            }

            appState.current = nextAppState;
        });

        return () => {
            // Disable screen protection
            if (Platform.OS === 'android') {
                disableSecureMode();
            } else if (Platform.OS === 'ios') {
                stopScreenshotDetection();
            }

            heartbeat.stopTracking(docUuid);
            security.stopMonitoring();
            clearInterval(timer);
            subscription.remove();

            // Log view end with duration (using ref to get final value)
        };
    }, []);

    // Log view end on unmount
    useEffect(() => {
        return () => {
            logViewEnd(viewSeconds);
        };
    }, [viewSeconds]);

    const formatViewTime = (s) => {
        const m = Math.floor(s / 60);
        const sc = s % 60;
        return `${m}:${sc < 10 ? '0' + sc : sc}`;
    };

    const getSource = () => {
        if (documentData && docMetadata?.fileType === 'pdf' && documentData.originalData) {
            // PDF from React Native PDF needs source={uri: ...} with base64
            return { uri: `data:${docMetadata.mimeType};base64,${documentData.originalData}` };
        }
        else if (documentData && docMetadata?.fileType === 'image') {
            const displayData = documentData.watermarkedData || documentData.originalData;
            if (!displayData) return null;
            const cleanBase64 = getCleanImageBase64(displayData);
            return { uri: `data:${docMetadata.mimeType};base64,${cleanBase64}` };
        }
        return null; // fallback
    };

    const handleBack = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        navigation.goBack();
    };

    if (isLoading) {
        return (
            <View style={[styles.container, styles.loadingContainer]}>
                <StatusBar hidden />
                <ActivityIndicator size="large" color={theme.colors.accent.blue} />
                <Text style={styles.loadingText}>Loading secure content...</Text>
            </View>
        );
    }

    const filename = docMetadata?.filename || 'Secure Document';

    // Derive fileType from mime_type if not explicitly set
    const getFileType = () => {
        if (docMetadata?.fileType) return docMetadata.fileType;
        const mimeType = docMetadata?.mime_type || '';
        if (mimeType.startsWith('image/')) return 'image';
        if (mimeType === 'application/pdf' || mimeType.includes('pdf')) return 'pdf';
        return 'document';
    };
    const fileType = getFileType();

    return (
        <View style={styles.container}>
            <StatusBar hidden />

            {/* Content */}
            <View style={styles.content}>
                {fileType === 'pdf' && getSource() ? (
                    <Pdf
                        source={getSource()}
                        style={styles.pdf}
                        onLoadComplete={(numberOfPages, filePath) => {
                            console.log(`Number of pages: ${numberOfPages}`);
                        }}
                        onError={(error) => {
                            console.log(error);
                        }}
                        enablePaging={true}
                        horizontal={false}
                        enableAnnotationRendering={false}
                        onLongPress={() => { }} // Block long press
                    />
                ) : fileType === 'image' && getSource() ? (
                    <Image
                        source={getSource()}
                        style={styles.image}
                        resizeMode="contain"
                        selectable={false}
                        onLongPress={() => { }} // Block long press
                    />
                ) : (
                    <View style={styles.docCenter}>
                        <View style={styles.iconBox}>
                            <Ionicons name="document-text" size={50} color="white" />
                        </View>
                        <Text style={styles.docName}>{filename}</Text>
                        <Text style={styles.docSub}>Secure document viewer</Text>
                    </View>
                )}
            </View>

            {/* Background Watermark Pattern */}
            <WatermarkBackground recipientEmail={recipientEmail} />

            {/* Floating Visible Watermark */}
            <FloatingWatermark
                recipientEmail={recipientEmail}
                timestamp={Date.now()}
            />

            {/* Header Overlay */}
            <View style={[styles.headerOverlay, { paddingTop: insets.top + 10 }]}>
                <Pressable
                    onPress={handleBack}
                    hitSlop={10}
                    style={styles.backBtn}
                    accessible={true}
                    accessibilityRole="button"
                    accessibilityLabel="Go back"
                >
                    <Ionicons name="arrow-back" size={24} color="white" />
                </Pressable>
                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle} numberOfLines={1}>{filename}</Text>
                    <View style={styles.securedBadge}>
                        <Ionicons name="shield-checkmark" size={12} color={theme.colors.status.success} />
                        <Text style={styles.securedText}>Secured</Text>
                    </View>
                </View>
                <View style={{ width: 24 }} />
            </View>

            {/* Bottom Overlay */}
            <View style={[styles.bottomOverlay, { paddingBottom: insets.bottom + 16 }]}>
                <Text style={styles.bottomTitle} numberOfLines={1}>{recipientEmail}</Text>
                <View style={styles.timer}>
                    <Ionicons name="eye-outline" size={16} color="white" />
                    <Text style={styles.timerText}>{formatViewTime(viewSeconds)}</Text>
                </View>
            </View>

            {/* Tamper Warning Banner */}
            {watermarkTampered && (
                <View style={styles.tamperWarning}>
                    <Ionicons name="warning" size={16} color={theme.colors.status.error} />
                    <Text style={styles.tamperWarningText}>
                        Document integrity could not be verified
                    </Text>
                </View>
            )}

            {/* Security Notice */}
            <View style={styles.securityNotice}>
                <Ionicons name="information-circle-outline" size={14} color={theme.colors.text.muted} />
                <Text style={styles.securityText} selectable={false}>
                    {Platform.OS === 'android'
                        ? 'Screen capture protected'
                        : 'Screen capture monitored'}
                </Text>
            </View>

            {/* iOS Screenshot Blur Overlay */}
            {isBlurred && (
                <BlurView
                    intensity={100}
                    tint="dark"
                    style={StyleSheet.absoluteFill}
                />
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'black',
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    pdf: {
        flex: 1,
        width: '100%',
        height: '100%',
        backgroundColor: 'black',
    },
    image: {
        width: '100%',
        height: '100%',
    },
    docCenter: {
        alignItems: 'center',
    },
    iconBox: {
        width: 80,
        height: 80,
        backgroundColor: theme.colors.accent.blue,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    docName: {
        color: 'white',
        fontSize: 18,
        fontWeight: '600',
        marginBottom: 8,
        textAlign: 'center',
        paddingHorizontal: 40,
    },
    docSub: {
        color: theme.colors.text.muted,
        fontSize: 14,
    },
    headerOverlay: {
        position: 'absolute',
        top: 0, left: 0, right: 0,
        paddingHorizontal: 16,
        paddingBottom: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'rgba(0,0,0,0.7)',
    },
    headerCenter: {
        flex: 1,
        alignItems: 'center',
    },
    headerTitle: {
        color: 'white',
        fontWeight: '600',
        fontSize: 16,
        textAlign: 'center',
        marginHorizontal: 16,
    },
    securedBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 4,
    },
    securedText: {
        color: theme.colors.status.success,
        fontSize: 11,
        fontWeight: '500',
    },
    backBtn: {
        padding: 4,
    },
    bottomOverlay: {
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        paddingTop: 16,
        paddingHorizontal: 20,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.7)',
    },
    bottomTitle: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 13,
        maxWidth: '60%',
    },
    timer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    timerText: {
        color: 'white',
        fontVariant: ['tabular-nums'],
        fontWeight: '600',
    },
    loadingContainer: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    loadingText: {
        color: theme.colors.text.secondary,
        marginTop: 16,
        fontSize: 14,
    },
    securityNotice: {
        position: 'absolute',
        top: 100,
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'rgba(0,0,0,0.5)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
    },
    securityText: {
        color: theme.colors.text.muted,
        fontSize: 11,
    },
    tamperWarning: {
        position: 'absolute',
        top: 130,
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(239, 68, 68, 0.9)',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 8,
    },
    tamperWarningText: {
        color: 'white',
        fontSize: 12,
        fontWeight: '600',
    },
});

const ViewerScreenWithErrorBoundary = (props) => (
    <ErrorBoundary navigation={props.navigation}>
        <ViewerScreen {...props} />
    </ErrorBoundary>
);

export default ViewerScreenWithErrorBoundary;
