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

import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    AppState,
    Image,
    Platform,
    Pressable,
    StatusBar,
    StyleSheet,
    Text,
    View
} from 'react-native';
import Pdf from 'react-native-pdf';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ErrorBoundary from '../components/ErrorBoundary';
import FloatingWatermark, { WatermarkBackground } from '../components/FloatingWatermark';
import { useAuth } from '../context/AuthContext';
import { blockSender, downloadSecureBlob, endViewSession, getDocumentKey, getProfile, logScreenshotAttempt, notifyDocumentOwner, reportContent, startViewSession, updateViewDuration, validateAccessGrant } from '../lib/supabase';
import { disableSecureMode, startScreenshotDetection, stopScreenshotDetection } from '../native/SecurityBridge';
import theme from '../theme';
import { queueSecurityEvent } from '../utils/analyticsQueue';
import { decryptData } from '../utils/crypto';
import { decryptDocumentKey } from '../utils/CryptoService';
import { generateDeviceHash } from '../utils/deviceSecurity';
import * as heartbeat from '../utils/heartbeat';
import * as security from '../utils/security';
import * as storage from '../utils/storage';
import { extractDocumentWatermark, getCleanImageBase64, verifyWatermarkSignature } from '../utils/watermark';

// SecureWatermark is an Expo Module (not a classic NativeModule), so we must use requireNativeModule
let SecureWatermark = null;
try {
    const { requireNativeModule } = require('expo-modules-core');
    SecureWatermark = requireNativeModule('SecureWatermark');
} catch (e) {
    console.warn('[Viewer] SecureWatermark native module not available:', e.message);
}

// Security: Clear clipboard to prevent data exfiltration
const clearClipboard = async () => {
    try {
        await Clipboard.setStringAsync('');
    } catch (e) {
        // Ignore clipboard errors
    }
};

const ViewerScreen = ({ route, navigation }) => {
    const { document: docMetadata, documentId, accessTokenId, recipientEmail: routeEmail } = route.params;
    const insets = useSafeAreaInsets();
    const { user } = useAuth();
    
    // Enable strict native DRM (Screen Capture Prevention)
    usePreventScreenCapture();

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

    // Tracks whether a document_analytics session row was successfully created,
    // so we only try to close/update a session that actually exists.
    const sessionActiveRef = useRef(false);

    // Log view start — creates the document_analytics session row that the
    // owner's DocumentAnalyticsScreen reads (opens, view time, screenshots).
    const logViewStart = useCallback(async () => {
        try {
            const deviceHash = await generateDeviceHash();
            const { error } = await startViewSession({
                documentId: docUuid,
                viewerEmail: recipientEmail,
                sessionId,
                deviceHash,
                platform: Platform.OS,
                appVersion: Constants?.expoConfig?.version || '1.0.0',
                accessGrantId: accessTokenId || null,
                totalPages: 1,
            });
            if (error) {
                console.warn('[Viewer] startViewSession failed:', error.message);
            } else {
                sessionActiveRef.current = true;
            }

            // Real-time alert to the document owner (best-effort). Skip when the
            // viewer IS the owner; the server double-checks this too.
            const isOwnDoc = docMetadata?.owner_id && user?.id && docMetadata.owner_id === user.id;
            if (!isOwnDoc) {
                notifyDocumentOwner(docUuid, 'view_start');
            }
        } catch (e) {
            console.error('Failed to log view start:', e);
        }
    }, [docUuid, accessTokenId, recipientEmail, sessionId, docMetadata, user]);

    // Log view end — closes the session and records the total duration.
    const logViewEnd = useCallback(async (duration) => {
        if (!sessionActiveRef.current) return;
        try {
            await endViewSession(sessionId, { duration, pagesViewed: 1 });
        } catch (e) {
            console.error('Failed to log view end:', e);
        }
    }, [sessionId]);

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

        // Push a real-time alert to the owner for genuine leak threats only.
        if (eventType === 'screenshot' || eventType === 'screen_recording') {
            notifyDocumentOwner(docUuid, eventType);
        }
    }, [docUuid, accessTokenId, recipientEmail]);

    useEffect(() => {
        const initViewer = async () => {
            try {
                // DRM: usePreventScreenCapture() is already active via the hook at component level.
                // Additional check: Hardware Mirroring (scrcpy/Miracast on Android, AirPlay/external
                // display on iOS). Implemented natively on both platforms now.
                if (SecureWatermark && SecureWatermark.isScreenBeingMirrored) {
                    const isMirroring = await SecureWatermark.isScreenBeingMirrored();
                    if (isMirroring) {
                        Alert.alert('Screen Mirroring Detected', 'Content hidden for security.');
                        logSecurityIncident('screen_recording');
                        navigation.goBack();
                        return;
                    }
                }
                
                if (Platform.OS === 'ios') {
                    startScreenshotDetection(
                        // Screenshot detected - blur immediately, then log and alert
                        async () => {
                            setIsBlurred(true);
                            // Increment the per-session screenshot counter AND log a security event.
                            logScreenshotAttempt(sessionId).catch(() => {});
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

                // Normalize document metadata for consistent property access
                const doc = {
                    ...docMetadata,
                    id: docMetadata.id || docMetadata.uuid,
                    mimeType: docMetadata.mimeType || docMetadata.mime_type,
                    filePath: docMetadata.filePath || docMetadata.file_path,
                };

                // Generate device hash for validation
                const deviceHash = await generateDeviceHash();

                // Validate access for online documents
                if (doc.filePath && accessTokenId) {
                    const { valid, error } = await validateAccessGrant(accessTokenId, doc.id, deviceHash);
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
                if (doc.expiresAt && doc.expiresAt < Date.now()) {
                    Alert.alert(
                        'Document Expired',
                        'This document has expired and is no longer accessible.',
                        [{ text: 'OK', onPress: () => navigation.goBack() }]
                    );
                    return;
                }

                // Load document data (local or online)
                if (doc) {
                    let fullDoc = null;

                    if (doc.filePath) {
                        // --- ONLINE MODE ---
                        // 1. Download Blob (Encrypted)
                        const { data: blob, error: dlError } = await downloadSecureBlob(doc.filePath);
                        if (dlError) throw dlError;

                        // 3. Get Key
                        const { data: keyData, error: keyError } = await getDocumentKey(doc.id);
                        if (!keyData || keyError) {
                            console.error('[Viewer] Key fetch failed:', keyError);
                            throw new Error('Decryption key not found for this document. Ask owner to re-share.');
                        }

                        // 4. Decrypt AES key via CryptoService (handles chunked + legacy key formats)
                        const aesKeyHex = await decryptDocumentKey(keyData.encrypted_key);

                        const isImage = doc.mimeType?.startsWith('image/');
                        const fileExt = doc.filename?.split('.').pop() || 'txt';
                        let decryptedBase64;
                        
                        if (isImage) {
                            // Step 1: Decrypt in JS (proven working path)
                            console.log('[Viewer] blob type:', typeof blob, 'blob size:', blob?.size, 'blob type:', blob?.type);
                            const encryptedBuffer = await new Response(blob).arrayBuffer();
                            console.log('[Viewer] encryptedBuffer byteLength:', encryptedBuffer?.byteLength);
                            const encryptedBytes = new Uint8Array(encryptedBuffer);
                            console.log('[Viewer] encryptedBytes length:', encryptedBytes?.length, 'first4:', encryptedBytes?.slice(0, 4));
                            const rawBase64 = await decryptData(encryptedBytes, aesKeyHex);
                            console.log('[Viewer] rawBase64 type:', typeof rawBase64, 'length:', rawBase64?.length, 'first80:', rawBase64?.substring(0, 80));
                            
                            // Step 2: Strip legacy LSB delimiter if present
                            const cleanBase64 = getCleanImageBase64(rawBase64);
                            
                            console.log('[Viewer] cleanBase64 length:', cleanBase64?.length, 'first80:', cleanBase64?.substring(0, 80));
                            
                            // FAIL CLOSED: images MUST carry a forensic watermark. If the native
                            // watermark module is unavailable or embedding fails, refuse to display
                            // the image rather than silently leaking an untraceable copy.
                            if (!SecureWatermark) {
                                console.warn('[Viewer] SecureWatermark unavailable — blocking image view (fail closed).');
                                await logSecurityIncident('watermark_unavailable');
                                setIsLoading(false);
                                Alert.alert(
                                    'Cannot Display Image',
                                    'Forensic protection is unavailable on this device, so this image cannot be shown. Please update to an official build of SecureShare.',
                                    [{ text: 'OK', onPress: () => navigation.goBack() }]
                                );
                                return;
                            }
                            try {
                                // Pass clean base64 to the native module for Spread Spectrum embedding
                                decryptedBase64 = await SecureWatermark.embedWatermark(
                                    cleanBase64,
                                    recipientEmail,
                                    doc.id
                                );
                                console.log('[Viewer] Spread Spectrum watermark embedded');
                            } catch (wmErr) {
                                console.error('[Viewer] Watermark embedding failed — blocking image view:', wmErr?.message);
                                await logSecurityIncident('watermark_failed');
                                setIsLoading(false);
                                Alert.alert(
                                    'Cannot Display Image',
                                    'Forensic watermarking failed on this device, so this image cannot be shown. Please try again or update the app.',
                                    [{ text: 'OK', onPress: () => navigation.goBack() }]
                                );
                                return;
                            }
                        } else {
                            // Legacy/PDF decryption in JS
                            // 2. Convert Blob directly to Uint8Array 
                            console.log('[Viewer] Non-Image blob size:', blob?.size);
                            const encryptedBuffer = await new Response(blob).arrayBuffer();
                            const encryptedBytes = new Uint8Array(encryptedBuffer);
                            console.log('[Viewer] Non-Image encryptedBytes length:', encryptedBytes?.length);
                            
                            // 5. Decrypt document content with the AES key
                            decryptedBase64 = await decryptData(encryptedBytes, aesKeyHex);
                            console.log('[Viewer] Non-Image decryptedBase64 length:', decryptedBase64?.length, 'first40:', decryptedBase64?.substring(0, 40));
                            
                            // SECURITY: Verify text/pdf watermark HMAC signature
                            try {
                                const extractedPayload = extractDocumentWatermark(decryptedBase64, fileExt);
                                console.log('[Viewer] Non-Image extractedPayload:', extractedPayload);
                                if (extractedPayload) {
                                    const { valid, error } = await verifyWatermarkSignature(extractedPayload, aesKeyHex);
                                    if (!valid) {
                                        console.warn('[Viewer] Watermark signature invalid:', error);
                                        setWatermarkTampered(true);
                                    }
                                }
                            } catch (extractionErr) {
                                console.error('[Viewer] Failed to extract document watermark:', extractionErr.message);
                            }
                        }

                        fullDoc = {
                            ...doc,
                            originalData: decryptedBase64
                        };
                    } else {
                        // --- LOCAL MODE ---
                        fullDoc = await storage.getDocumentWithData(doc.uuid || doc.id);
                    }

                    if (fullDoc) setDocumentData(fullDoc);
                }

                setIsLoading(false);

                // Log view start
                await logViewStart();

                // Start tracking  
                heartbeat.startTracking(docUuid, recipientEmail);
                security.startMonitoring(docUuid, recipientEmail, doc.filename || 'document');

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

        // Persist view duration periodically so it survives an app kill / crash
        // (endViewSession may never fire in those cases).
        const viewStartMs = Date.now();
        const durationTimer = setInterval(() => {
            if (sessionActiveRef.current) {
                const secs = Math.floor((Date.now() - viewStartMs) / 1000);
                updateViewDuration(sessionId, secs).catch(() => {});
            }
        }, 15000);

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
            clearInterval(durationTimer);
            subscription.remove();

            // Log view end with duration (using ref to get final value)
        };
    }, []);

    // Log view end on unmount — use ref to avoid stale closure + duplicate cleanups
    const viewSecondsRef = useRef(viewSeconds);
    useEffect(() => {
        viewSecondsRef.current = viewSeconds;
    }, [viewSeconds]);
    useEffect(() => {
        return () => {
            logViewEnd(viewSecondsRef.current);
        };
    }, []);

    const formatViewTime = (s) => {
        const m = Math.floor(s / 60);
        const sc = s % 60;
        return `${m}:${sc < 10 ? '0' + sc : sc}`;
    };

    // --- UGC safety: report objectionable content / block the sender ---
    const submitReport = async () => {
        const { error } = await reportContent({ documentId: docUuid, reason: 'objectionable_content' });
        Alert.alert(
            error ? 'Error' : 'Report Submitted',
            error ? 'Could not submit your report. Please try again.'
                  : 'Thank you. Our team will review this content within 24 hours.'
        );
    };

    const confirmBlockSender = async () => {
        try {
            const ownerId = docMetadata?.owner_id;
            let senderEmail = docMetadata?.owner_email || null;
            if (!senderEmail && ownerId) {
                const { data } = await getProfile(ownerId);
                senderEmail = data?.email || null;
            }
            if (!senderEmail) {
                Alert.alert('Error', 'Could not identify the sender.');
                return;
            }
            const { error } = await blockSender(senderEmail);
            if (error) {
                Alert.alert('Error', 'Could not block this sender.');
                return;
            }
            Alert.alert(
                'Sender Blocked',
                `You will no longer receive documents from ${senderEmail}.`,
                [{ text: 'OK', onPress: () => navigation.goBack() }]
            );
        } catch (_e) {
            Alert.alert('Error', 'Could not block this sender.');
        }
    };

    const handleReportOrBlock = () => {
        const isOwnDoc = docMetadata?.owner_id && user?.id && docMetadata.owner_id === user.id;
        const options = [
            { text: 'Report content', onPress: submitReport },
        ];
        // Only offer "block sender" when viewing someone else's shared document.
        if (!isOwnDoc) {
            options.push({ text: 'Block sender', style: 'destructive', onPress: confirmBlockSender });
        }
        options.push({ text: 'Cancel', style: 'cancel' });
        Alert.alert('Report or Block', 'Report objectionable content or block this sender.', options);
    };

    const getSource = () => {
        // Derive file type & mime type from both local (camelCase) and cloud (snake_case) properties
        const mimeType = docMetadata?.mimeType || docMetadata?.mime_type || 'application/octet-stream';
        let fType = docMetadata?.fileType;
        if (!fType) {
            if (mimeType.startsWith('image/')) fType = 'image';
            else if (mimeType === 'application/pdf' || mimeType.includes('pdf')) fType = 'pdf';
            else fType = 'document';
        }

        if (documentData && fType === 'pdf' && documentData.originalData) {
            return { uri: `data:${mimeType};base64,${documentData.originalData}` };
        }
        else if (documentData && fType === 'image') {
            const displayData = documentData.watermarkedData || documentData.originalData;
            if (!displayData) return null;
            const cleanBase64 = getCleanImageBase64(displayData);
            return { uri: `data:${mimeType};base64,${cleanBase64}` };
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
            <WatermarkBackground recipientEmail={recipientEmail} documentId={docUuid} />

            {/* Floating Visible Watermark */}
            <FloatingWatermark
                recipientEmail={recipientEmail}
                timestamp={Date.now()}
                documentId={docUuid}
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
                <Pressable
                    onPress={handleReportOrBlock}
                    hitSlop={10}
                    style={styles.backBtn}
                    accessible={true}
                    accessibilityRole="button"
                    accessibilityLabel="Report or block"
                >
                    <Ionicons name="flag-outline" size={22} color="white" />
                </Pressable>
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
