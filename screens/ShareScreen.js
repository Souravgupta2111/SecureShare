import React, { useState, useRef, useCallback, memo, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, Animated, Modal, Alert, ActivityIndicator, Platform, InteractionManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Haptics from 'expo-haptics';
import { v4 as uuidv4 } from 'uuid';
import PropTypes from 'prop-types';
import theme from '../theme';
import AnimatedHeader from '../components/AnimatedHeader';
import SuccessAnimation from '../components/SuccessAnimation';
import * as watermark from '../utils/watermark';
import * as storage from '../utils/storage';
import { useAuth } from '../context/AuthContext';
import * as SecureStore from 'expo-secure-store';
import { uploadOnlineDocument, saveDocumentKey, grantAccess, getProfileByEmail, storeWatermarkHash, updateProfile, getProfile } from '../lib/supabase';
import { generateKey, encryptData, encryptKey, importPublicKey, checkFileSize } from '../utils/crypto';
import { generateDeviceHash } from '../utils/deviceSecurity';

// Max image size for compression (1MB in base64 is ~750KB decoded)
const MAX_IMAGE_SIZE = 1024 * 1024; // 1MB

// Max email length per RFC 5321
const MAX_EMAIL_LENGTH = 254;

// RFC 5322 compliant email regex (hoisted to prevent recreation)
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

// Expiry Options
const EXPIRY_OPTIONS = [
    { label: '1 Hour', value: 3600000 },
    { label: '24 Hours', value: 86400000 },
    { label: '7 Days', value: 604800000 },
    { label: '30 Days', value: 2592000000 },
    { label: 'Custom', value: 'custom' },
];

const ShareScreen = ({ navigation }) => {
    const { user, isAuthenticated, profile, refreshProfile } = useAuth();
    const [currentProfile, setCurrentProfile] = useState(profile);
    const [selectedFile, setSelectedFile] = useState(null); // { uri, name, size, type, mimeType, base64? }

    // Update local profile when context profile changes
    useEffect(() => {
        setCurrentProfile(profile);
    }, [profile]);
    const [emailInput, setEmailInput] = useState('');
    const [recipients, setRecipients] = useState([]);
    const [expiryOption, setExpiryOption] = useState(EXPIRY_OPTIONS[1]); // Default 24h
    const [customDate, setCustomDate] = useState('');
    const [loading, setLoading] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [shareMode, setShareMode] = useState('online'); // Always online mode

    // Picker Modal
    const [pickerVisible, setPickerVisible] = useState(false);

    // Animations
    const focusAnim = useRef(new Animated.Value(0)).current;
    const fileCardOpacity = useRef(new Animated.Value(1)).current;

    // --- Handlers ---

    const handlePickFile = () => {
        setPickerVisible(true);
    };

    const processFileSelection = async (type) => {
        setPickerVisible(false);

        // Animate out
        Animated.timing(fileCardOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(async () => {
            try {
                let result = null;
                let fileData = null;

                if (type === 'image') {
                    const res = await ImagePicker.launchImageLibraryAsync({
                        mediaTypes: ['images'],
                        quality: 1,
                        base64: true, // we need base64 for watermarking
                    });

                    if (!res.canceled && res.assets && res.assets.length > 0) {
                        let asset = res.assets[0];
                        const info = await FileSystem.getInfoAsync(asset.uri);

                        let base64Data = asset.base64;
                        let finalUri = asset.uri;
                        let finalSize = info.size || 0;

                        // Compress large images
                        if (finalSize > MAX_IMAGE_SIZE) {
                            const compressed = await ImageManipulator.manipulateAsync(
                                asset.uri,
                                [{ resize: { width: 1920 } }], // Resize to max 1920px width
                                { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
                            );
                            base64Data = compressed.base64;
                            finalUri = compressed.uri;
                            const compressedInfo = await FileSystem.getInfoAsync(compressed.uri);
                            finalSize = compressedInfo.size || 0;
                        }

                        fileData = {
                            uri: finalUri,
                            name: asset.fileName || `image_${Date.now()}.jpg`,
                            size: finalSize,
                            type: 'image',
                            mimeType: 'image/jpeg',
                            base64: base64Data
                        };
                    }
                } else {
                    const res = await DocumentPicker.getDocumentAsync({
                        type: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'],
                        copyToCacheDirectory: true,
                    });
                    // DocumentPicker result structure changed in recent versions
                    if (!res.canceled && res.assets && res.assets.length > 0) {
                        const asset = res.assets[0];
                        // Need to read base64
                        const b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: 'base64' });

                        fileData = {
                            uri: asset.uri,
                            name: asset.name,
                            size: asset.size,
                            type: 'document',
                            mimeType: asset.mimeType,
                            base64: b64,
                            ext: asset.name.split('.').pop()
                        };
                    }
                }

                if (fileData) {
                    setSelectedFile(fileData);
                }
            } catch (e) {
                console.error('Pick error', e);
                Alert.alert("Error", "Could not select file");
            } finally {
                // Animate in
                Animated.timing(fileCardOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
            }
        });
    };

    const handleAddRecipient = () => {
        // Sanitize: trim, lowercase, remove leading/trailing special chars
        const email = emailInput
            .trim()
            .toLowerCase()
            .replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, ''); // Remove non-alphanumeric from start/end

        if (!email) return;

        // Enhanced validation with length check
        if (email.length > MAX_EMAIL_LENGTH) {
            Alert.alert("Invalid Email", "Email address is too long");
            return;
        }

        // Use hoisted EMAIL_REGEX for validation
        if (!EMAIL_REGEX.test(email)) {
            Alert.alert("Invalid Email", "Please enter a valid email address");
            return;
        }

        if (recipients.includes(email)) {
            setEmailInput('');
            return;
        }

        // Haptic feedback on add
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

        setRecipients([...recipients, email]);
        setEmailInput('');
    };

    const removeRecipient = (email) => {
        setRecipients(recipients.filter(r => r !== email));
    };

    const handleShare = async () => {
        setLoading(true);

        try {
            // 1. Calculate Expiry
            let expiresAt = null;
            if (expiryOption.value !== 'custom') {
                expiresAt = new Date(Date.now() + expiryOption.value).toISOString();
            } else {
                // Parse custom date string "DD/MM/YYYY HH:MM"
                const [datePart, timePart] = customDate.split(' ');
                const [D, M, Y] = datePart.split('/');
                const [h, m] = timePart.split(':');
                const d = new Date(Y, M - 1, D, h, m);
                if (isNaN(d.getTime()) || d.getTime() <= Date.now()) {
                    Alert.alert("Invalid Date", "Please enter a future date in format DD/MM/YYYY HH:MM");
                    setLoading(false);
                    return;
                }
                expiresAt = d.toISOString();
            }

            if (shareMode === 'online' && isAuthenticated) {
                // --- ONLINE SHARING MODE ---
                // 1. Generate document UUID and device hash
                const documentUUID = uuidv4();
                const deviceHash = await generateDeviceHash();

                // 2. Generate encryption key (will also be used for HMAC)
                const key = await generateKey();

                // 3. Create SIGNED watermark payload with HMAC signature
                // Format: documentUUID|email|timestamp|deviceHash|HMAC_SIGNATURE
                const signedWatermarkPayload = await watermark.createSignedWatermarkPayload(
                    documentUUID,
                    user.email,
                    deviceHash,
                    key
                );

                // 4. Apply watermark with signed payload
                let watermarkedData = selectedFile.base64;
                const fileExt = selectedFile.ext || 'txt';
                const isImage = selectedFile.type === 'image';

                if (isImage) {
                    // Use async version with native LSB steganography for secure watermarking
                    try {
                        const result = await watermark.embedImageWatermarkAsync(selectedFile.base64, signedWatermarkPayload);
                        watermarkedData = result.data;
                        console.log('[Share] Image watermarked using method:', result.method);
                    } catch (wmError) {
                        // Native LSB not available - use fallback but warn
                        console.warn('[Share] Native LSB unavailable, using delimiter fallback:', wmError.message);
                        watermarkedData = watermark.embedImageWatermark(selectedFile.base64, signedWatermarkPayload);
                    }
                } else {
                    watermarkedData = watermark.embedDocumentWatermark(selectedFile.base64, fileExt, signedWatermarkPayload);
                }

                // 5. Encrypt document content
                console.log('[Share] Encrypting data...');
                const encryptedData = await encryptData(watermarkedData, key);
                console.log('[Share] Encryption complete. Type:', encryptedData.constructor.name);

                // 6. Upload encrypted document (encryptData returns Uint8Array)
                const arrayBuffer = encryptedData instanceof Uint8Array ? encryptedData : new Uint8Array(encryptedData);
                const { data: docData, error: uploadError } = await uploadOnlineDocument({
                    filename: selectedFile.name,
                    mime_type: selectedFile.mimeType,
                    size_bytes: selectedFile.size,
                    encryption_iv: 'aes-gcm-v1',
                    watermark_payload: signedWatermarkPayload
                }, arrayBuffer, user.id);

                if (uploadError) throw uploadError;

                // 6. Check owner has keys
                // SECURITY CRITICAL: Never store raw key - require public key
                const activeProfile = currentProfile || profile;
                if (!activeProfile?.public_key) {
                    // Keys should have been generated during signup
                    // If missing, redirect user to complete security setup
                    console.warn('[Share] Owner has no public key - security setup incomplete');
                    setLoading(false);
                    Alert.alert(
                        'Security Setup Required',
                        'Your encryption keys are not set up. Please complete the security setup to share documents securely.',
                        [
                            { text: 'Cancel', style: 'cancel' },
                            {
                                text: 'Setup Now',
                                onPress: () => navigation.navigate('Settings')
                            }
                        ]
                    );
                    return;
                }

                // Use the most up-to-date profile
                let finalProfile = currentProfile || profile;
                if (!finalProfile?.public_key) {
                    // Try to fetch fresh profile
                    const { data: freshProfile } = await getProfile(user.id);
                    finalProfile = freshProfile || finalProfile;
                }

                if (!finalProfile?.public_key) {
                    setLoading(false);
                    Alert.alert(
                        'Error',
                        'Public key not available. Please try again.',
                        [{ text: 'OK' }]
                    );
                    return;
                }

                const ownerPubKey = await importPublicKey(finalProfile.public_key);
                const ownerEncryptedKey = await encryptKey(key, ownerPubKey);
                const { error: ownerKeyError } = await saveDocumentKey(docData.id, ownerEncryptedKey, user.id);

                if (ownerKeyError) {
                    throw new Error(`Failed to save document key: ${ownerKeyError.message}`);
                }

                // 7. Create access grants and share keys for recipients
                const pendingRecipients = [];
                const failedRecipients = [];

                for (const recipientEmail of recipients) {
                    try {
                        // a) Get Recipient Profile (for Public Key)
                        const { data: recipientProfile, error: profileError } = await getProfileByEmail(recipientEmail);

                        if (profileError || !recipientProfile) {
                            pendingRecipients.push(recipientEmail);
                            console.warn(`[Share] Recipient ${recipientEmail} not found. They need to register first.`);
                            continue;
                        }

                        if (!recipientProfile.public_key) {
                            pendingRecipients.push(recipientEmail);
                            console.warn(`[Share] Recipient ${recipientEmail} has no public key. They need to complete security setup.`);
                            // Still grant access so they can request key later
                            await grantAccess(docData.id, recipientEmail, user.id, deviceHash);
                            continue;
                        }

                        // b) Encrypt AES Key with Recipient's Public Key
                        console.log(`[Share] Encrypting key for ${recipientEmail}`);
                        const recipientPubKey = await importPublicKey(recipientProfile.public_key);
                        const recipientEncryptedKey = await encryptKey(key, recipientPubKey);

                        // c) Save Key for Recipient
                        const { error: keyError } = await saveDocumentKey(docData.id, recipientEncryptedKey, recipientProfile.id);
                        if (keyError) {
                            throw new Error(`Failed to save key: ${keyError.message}`);
                        }

                        // d) Grant Access
                        const { error: grantError } = await grantAccess(docData.id, recipientEmail, user.id, deviceHash);
                        if (grantError) {
                            throw new Error(`Failed to grant access: ${grantError.message}`);
                        }

                        // e) Store watermark hash (Forensic Proof) - using utility function
                        const watermarkHash = await watermark.generateWatermarkHash(signedWatermarkPayload);
                        const { error: hashError } = await storeWatermarkHash({
                            document_id: docData.id,
                            recipient_email: recipientEmail,
                            watermark_hash: watermarkHash,
                            hmac_signature: signedWatermarkPayload.split('|').pop(),
                            device_hash: deviceHash
                        });

                        if (hashError) {
                            console.error(`[Share] Failed to store watermark hash for ${recipientEmail}:`, hashError);
                            // Non-critical, continue
                        }

                    } catch (recipientError) {
                        console.error(`[Share] Failed to process recipient ${recipientEmail}:`, recipientError);
                        failedRecipients.push({ email: recipientEmail, error: recipientError.message });
                    }
                }

                // 8. Success - show appropriate messages
                setLoading(false);

                // Show error if any recipients failed completely
                if (failedRecipients.length > 0) {
                    Alert.alert(
                        'Some Recipients Failed',
                        `Document shared, but these recipients encountered errors:\n\n${failedRecipients.map(r => `${r.email}: ${r.error}`).join('\n')}\n\nYou can try sharing again later.`,
                        [{
                            text: 'OK', onPress: () => {
                                if (pendingRecipients.length === 0 && failedRecipients.length < recipients.length) {
                                    setShowSuccess(true);
                                }
                            }
                        }]
                    );
                }

                // Show warning if some recipients are not yet registered
                if (pendingRecipients.length > 0) {
                    Alert.alert(
                        'Shared with Pending Recipients',
                        `Document shared! However, these recipients need to register and set up their security keys before they can decrypt:\n\n${pendingRecipients.join('\n')}\n\nYou can re-share the key later from Access Control once they're set up.`,
                        [{ text: 'Got it', onPress: () => setShowSuccess(true) }]
                    );
                } else if (failedRecipients.length === 0) {
                    setShowSuccess(true);
                }
            } else {
                // --- LOCAL SHARING MODE ---
                // 2. Generate UUID
                const uuid = uuidv4();

                // 3. Watermark - create payload with recipient info
                const deviceHash = await generateDeviceHash();
                const timestamp = Date.now();
                // For local sharing, create watermark per recipient
                const watermarkPayload = `${uuid}|${recipients[0] || 'local'}|${timestamp}|${deviceHash}`;

                let processedBase64 = null;
                if (selectedFile.type === 'image') {
                    try {
                        const result = await watermark.embedImageWatermarkAsync(selectedFile.base64, watermarkPayload);
                        processedBase64 = result.data;
                        console.log('[Local Share] Image watermarked using method:', result.method);
                    } catch (wmError) {
                        console.warn('[Local Share] Native LSB unavailable, using document watermark fallback');
                        processedBase64 = watermark.embedDocumentWatermark(selectedFile.base64, selectedFile.ext || 'txt', watermarkPayload);
                    }
                } else {
                    processedBase64 = watermark.embedDocumentWatermark(selectedFile.base64, selectedFile.ext || 'txt', watermarkPayload);
                }

                // 4. Construct Doc Object
                const doc = {
                    uuid,
                    filename: selectedFile.name,
                    fileType: selectedFile.type,
                    mimeType: selectedFile.mimeType,
                    fileSize: selectedFile.size,
                    recipients: recipients.map(email => ({
                        email,
                        openedAt: null,
                        totalViewTime: 0,
                        openCount: 0
                    })),
                    sharedAt: Date.now(),
                    expiresAt: expiresAt ? new Date(expiresAt).getTime() : 0,
                    status: 'active',
                    watermarkedData: processedBase64,
                    originalData: selectedFile.base64,
                    securityEvents: []
                };

                // 5. Save locally
                await storage.saveDocument(doc);

                // 6. Success
                setLoading(false);
                setShowSuccess(true);
            }

        } catch (e) {
            console.error('Share error', e);
            setLoading(false);
            Alert.alert("Error", "Failed to share document: " + (e.message || "Unknown error"));
        }
    };

    const handleSuccessComplete = () => {
        try {
            setShowSuccess(false);

            navigation.navigate('Home');

            setSelectedFile(null);
            setRecipients([]);
            setExpiryOption(EXPIRY_OPTIONS[1]);
            setEmailInput('');
            setCustomDate('');
        } catch (error) {
            console.error('[ShareScreen] handleSuccessComplete error:', error);
            setShowSuccess(false);
            setSelectedFile(null);
            setRecipients([]);
        }
    };

    // Render Helpers
    const formatSize = (bytes) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    const canShare = selectedFile && recipients.length > 0 && (expiryOption.value !== 'custom' || customDate.length > 10);

    return (
        <View style={styles.container}>
            <AnimatedHeader title="Share Document" showBack={false} />

            <ScrollView contentContainerStyle={styles.scrollContent}>

                {/* Removed mode selector - always online */}

                {/* Section 1: Pickle */}
                <Text style={styles.sectionLabel}>SELECT FILE</Text>
                <Pressable onPress={handlePickFile}>
                    <Animated.View style={[
                        styles.fileCard,
                        !selectedFile && styles.fileCardEmpty,
                        { opacity: fileCardOpacity }
                    ]}>
                        {!selectedFile ? (
                            <>
                                <Ionicons name="cloud-upload-outline" size={36} color={theme.colors.accent.blue} />
                                <Text style={styles.fileCardText}>Tap to select file or image</Text>
                                <Text style={styles.fileCardSubtext}>PDF, DOCX, TXT, JPG, PNG</Text>
                            </>
                        ) : (
                            <View style={styles.filePreviewRow}>
                                <View style={styles.fileThumb}>
                                    {selectedFile.type === 'image' ? (
                                        // Note: Use base64 uri for preview
                                        // But Image component needs 'data:image/...' prefix
                                        <View style={styles.imagePlaceholder}>
                                            <Ionicons name="image" size={30} color={theme.colors.accent.blue} />
                                        </View>
                                        // Real implementation would render Image source={{ uri: selectedFile.uri }}
                                        // But let's stick to icon for simplicity or use uri if allowed
                                    ) : (
                                        <View style={styles.docIcon}>
                                            <Ionicons name="document-text" size={30} color="white" />
                                        </View>
                                    )}
                                </View>
                                <View style={{ flex: 1, marginLeft: 16 }}>
                                    <Text style={styles.fileName}>{selectedFile.name}</Text>
                                    <Text style={styles.fileSize}>{formatSize(selectedFile.size)}</Text>
                                </View>
                                <Pressable onPress={(e) => { e.stopPropagation(); setSelectedFile(null); }}>
                                    <Ionicons name="close" size={20} color={theme.colors.text.muted} />
                                </Pressable>
                            </View>
                        )}
                    </Animated.View>
                </Pressable>

                {/* Section 2: Recipients */}
                <Text style={styles.sectionLabel}>WHO CAN VIEW THIS?</Text>
                <View style={[styles.inputContainer, emailInput.length > 0 && styles.inputFocused]}>
                    <TextInput
                        style={styles.input}
                        placeholder="Enter email address"
                        placeholderTextColor={theme.colors.text.muted}
                        value={emailInput}
                        onChangeText={setEmailInput}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        onSubmitEditing={handleAddRecipient}
                    />
                    {emailInput.length > 0 && (
                        <Pressable onPress={handleAddRecipient} style={styles.plusBtn}>
                            <Ionicons name="add" size={20} color="white" />
                        </Pressable>
                    )}
                </View>
                <View style={styles.chipContainer}>
                    {recipients.map(email => (
                        <View key={email} style={styles.chip}>
                            <Text style={styles.chipText}>{email}</Text>
                            <Pressable onPress={() => removeRecipient(email)}>
                                <Ionicons name="close-circle" size={16} color={theme.colors.text.muted} />
                            </Pressable>
                        </View>
                    ))}
                </View>

                {/* Section 3: Expiry */}
                <Text style={styles.sectionLabel}>WHEN SHOULD ACCESS EXPIRE?</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillRow}>
                    {EXPIRY_OPTIONS.map((opt) => {
                        const isSelected = expiryOption.label === opt.label;
                        return (
                            <Pressable
                                key={opt.label}
                                onPress={() => setExpiryOption(opt)}
                                style={[styles.expiryPill, isSelected && styles.expiryPillActive]}
                            >
                                <Text style={[styles.expiryText, isSelected && styles.expiryTextActive]}>
                                    {opt.label}
                                </Text>
                            </Pressable>
                        );
                    })}
                </ScrollView>

                {expiryOption.value === 'custom' && (
                    <View style={styles.customDateContainer}>
                        <TextInput
                            style={styles.input}
                            placeholder="DD/MM/YYYY HH:MM"
                            placeholderTextColor={theme.colors.text.muted}
                            value={customDate}
                            onChangeText={setCustomDate}
                        />
                    </View>
                )}

                {/* Share Button */}
                <Pressable
                    onPress={handleShare}
                    disabled={!canShare || loading}
                    style={[styles.shareBtn, (!canShare || loading) && styles.shareBtnDisabled]}
                >
                    {loading ? (
                        <ActivityIndicator color="white" />
                    ) : (
                        <Text style={styles.shareBtnText}>Share Securely</Text>
                    )}
                </Pressable>

                <View style={{ height: 40 }} />

            </ScrollView>

            {/* Picker Modal */}
            <Modal visible={pickerVisible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Select File Type</Text>
                        <Pressable style={styles.modalOption} onPress={() => processFileSelection('document')}>
                            <Ionicons name="document-text-outline" size={24} color={theme.colors.text.primary} />
                            <Text style={styles.modalOptionText}>Document</Text>
                        </Pressable>
                        <Pressable style={styles.modalOption} onPress={() => processFileSelection('image')}>
                            <Ionicons name="image-outline" size={24} color={theme.colors.text.primary} />
                            <Text style={styles.modalOptionText}>Image</Text>
                        </Pressable>
                        <Pressable style={styles.modalClose} onPress={() => setPickerVisible(false)}>
                            <Text style={styles.modalCloseText}>Cancel</Text>
                        </Pressable>
                    </View>
                </View>
            </Modal>

            <SuccessAnimation
                visible={showSuccess}
                filename={selectedFile?.name || ''}
                onComplete={handleSuccessComplete}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.bg.primary,
    },
    scrollContent: {
        padding: 16,
    },
    sectionLabel: {
        fontSize: 11,
        color: theme.colors.text.muted,
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 8,
        marginTop: 16,
    },
    fileCard: {
        backgroundColor: theme.colors.bg.secondary,
        borderRadius: 16,
        padding: 24,
        minHeight: 120,
        justifyContent: 'center',
        alignItems: 'center',
    },
    fileCardEmpty: {
        borderWidth: 2,
        borderColor: 'rgba(61,122,255,0.3)',
        borderStyle: 'dashed',
    },
    fileCardText: {
        color: theme.colors.text.primary,
        fontSize: 15,
        marginTop: 12,
    },
    fileCardSubtext: {
        color: theme.colors.text.muted,
        fontSize: 12,
        marginTop: 4,
    },
    filePreviewRow: {
        flexDirection: 'row',
        alignItems: 'center',
        width: '100%',
    },
    fileThumb: {
        width: 50, height: 50,
        borderRadius: 8,
        backgroundColor: theme.colors.bg.tertiary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    docIcon: {
        width: 40, height: 40,
        backgroundColor: theme.colors.accent.blue,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    imagePlaceholder: {
        width: 40, height: 40, alignItems: 'center', justifyContent: 'center'
    },
    fileName: {
        color: 'white',
        fontWeight: '600',
        fontSize: 15,
    },
    fileSize: {
        color: theme.colors.text.secondary,
        fontSize: 13,
    },
    inputContainer: {
        flexDirection: 'row',
        backgroundColor: theme.colors.bg.tertiary,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.colors.border.light,
        alignItems: 'center',
        paddingRight: 8,
    },
    inputFocused: {
        borderColor: theme.colors.border.focus,
        // shadow...
    },
    input: {
        flex: 1,
        padding: 14,
        color: 'white',
        fontSize: 15,
    },
    plusBtn: {
        width: 32, height: 32,
        borderRadius: 16,
        backgroundColor: theme.colors.accent.blue,
        alignItems: 'center',
        justifyContent: 'center',
    },
    chipContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 12,
    },
    chip: {
        backgroundColor: theme.colors.bg.tertiary,
        borderRadius: 20,
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: theme.colors.border.light,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    chipText: {
        color: theme.colors.text.secondary,
        fontSize: 13,
    },
    pillRow: {
        flexDirection: 'row',
        paddingVertical: 4,
    },
    expiryPill: {
        backgroundColor: theme.colors.bg.tertiary,
        borderRadius: 20,
        paddingVertical: 8,
        paddingHorizontal: 16,
        marginRight: 8,
    },
    expiryPillActive: {
        backgroundColor: theme.colors.accent.blue,
    },
    expiryText: {
        color: theme.colors.text.secondary,
        fontSize: 14,
    },
    expiryTextActive: {
        color: 'white',
    },
    customDateContainer: {
        marginTop: 12,
        backgroundColor: theme.colors.bg.tertiary,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.colors.border.light,
    },
    shareBtn: {
        backgroundColor: theme.colors.accent.blue,
        borderRadius: 16,
        paddingVertical: 16,
        alignItems: 'center',
        marginTop: 32,
        ...theme.shadow.glow(theme.colors.accent.blue),
    },
    shareBtnDisabled: {
        backgroundColor: 'rgba(61,122,255,0.15)',
        shadowOpacity: 0,
        elevation: 0,
    },
    shareBtnText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 16,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        width: '80%',
        backgroundColor: theme.colors.bg.elevated,
        borderRadius: 16,
        padding: 24,
    },
    modalTitle: {
        color: 'white',
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 20,
        textAlign: 'center',
    },
    modalOption: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border.light,
        gap: 16,
    },
    modalOptionText: {
        color: 'white',
        fontSize: 16,
    },
    modalClose: {
        marginTop: 20,
        alignItems: 'center',
    },
    modalCloseText: {
        color: theme.colors.text.secondary,
        fontSize: 15,
    },
    modeSelector: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 16,
    },
    modeButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        padding: 12,
        backgroundColor: theme.colors.bg.secondary,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.colors.border.light,
    },
    modeButtonActive: {
        borderColor: theme.colors.accent.blue,
        backgroundColor: 'rgba(61, 122, 255, 0.1)',
    },
    modeText: {
        color: theme.colors.text.secondary,
        fontSize: 14,
        fontWeight: '500',
    },
    modeTextActive: {
        color: theme.colors.accent.blue,
        fontWeight: '600',
    },
});

export default ShareScreen;
