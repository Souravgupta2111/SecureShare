import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator, Animated } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import theme from '../theme';
import AnimatedHeader from '../components/AnimatedHeader';
import { useAuth } from '../context/AuthContext';
import { uploadOnlineDocument, saveDocumentKey, deleteCloudDocument, getProfile } from '../lib/supabase';
import { generateKey, encryptData, checkFileSize, importPublicKey, encryptKey } from '../utils/crypto';
import * as watermark from '../utils/watermark';
import { generateDeviceHash } from '../utils/deviceSecurity';
import { v4 as uuidv4 } from 'uuid';
import { Pressable } from 'react-native';

const UploadScreen = ({ navigation }) => {
    const { user } = useAuth();
    const [file, setFile] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [progress, setProgress] = useState(''); // 'Reading', 'Encrypting', 'Uploading'
    const [retryCount, setRetryCount] = useState(0);

    // Animation for encryption visualization
    const [encryptAnim] = useState(new Animated.Value(0));

    // Retry with exponential backoff
    const retryWithBackoff = async (fn, maxRetries = 3, baseDelayMs = 1000) => {
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await fn();
            } catch (error) {
                if (attempt === maxRetries) throw error;
                const delay = baseDelayMs * Math.pow(2, attempt);
                setProgress(`Retry ${attempt + 1}/${maxRetries} in ${delay / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    };

    const pickDocument = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: ['application/pdf', 'image/*', 'text/plain'],
                copyToCacheDirectory: true
            });

            if (result.canceled) return;

            const doc = result.assets[0];

            // Check size limits for MVP (Base64 limitation)
            if (!checkFileSize(doc.size)) {
                Alert.alert("File too large", "For this beta, please upload files under 10MB.");
                return;
            }

            setFile(doc);
        } catch (e) {
            console.error(e);
            Alert.alert("Error", "Failed to pick document");
        }
    };

    const handleUpload = async () => {
        if (!file || !user) return;

        let uploadedDocId = null;
        let uploadedFilePath = null;

        try {
            setIsUploading(true);
            setProgress('Reading file...');

            // 1. Read File
            // 1. Read File via Fetch Blob (Avoids Base64 String Overhead)
            // This reads the file into a Blob -> ArrayBuffer -> Uint8Array
            const response = await fetch(file.uri);
            const blob = await response.blob();
            // Create Uint8Array directly from buffer
            const buffer = await new Response(blob).arrayBuffer();
            let fileData = new Uint8Array(buffer);

            setProgress('Applying forensic watermark...');

            // 2. Generate document UUID and device hash
            const documentUUID = uuidv4();
            const deviceHash = await generateDeviceHash();
            const timestamp = Date.now();

            // 3. Create watermark payload with full information
            // Format: documentUUID|recipientEmail|timestamp|deviceHash
            // Note: For upload, recipientEmail will be set when access is granted
            // We'll use owner email as initial recipient
            const watermarkPayload = `${documentUUID}|${user.email}|${timestamp}|${deviceHash}`;

            // PERFORMANCE: Warn about large files
            if (file.size > 5 * 1024 * 1024) {
                console.warn('[Upload] Large file detected. May cause performance issues on low-end devices.');
            }

            // 4. Apply watermark before encryption
            const fileExt = file.name.split('.').pop() || 'txt';
            const isImage = file.mimeType?.startsWith('image/') || false;

            if (isImage) {
                // MEMORY OPTIMIZATION: Use file-based native watermarking
                // Pass original URI -> Native -> Temp File URI
                try {
                    const watermarkedUri = await watermark.embedImageWatermarkFromFileAsync(file.uri, watermarkPayload);

                    // Now read the WATERMARKED file into memory (10MB max)
                    const wmResponse = await fetch(watermarkedUri);
                    const wmBlob = await wmResponse.blob();
                    const wmBuffer = await new Response(wmBlob).arrayBuffer();
                    fileData = new Uint8Array(wmBuffer);

                } catch (e) {
                    console.error('Watermark failed, blocking upload (Security Policy):', e);
                    Alert.alert('Security Error', 'Failed to watermark image. Upload blocked.');
                    setIsUploading(false);
                    return;
                }
            } else {
                // Document watermark (PDF/DOCX/TXT)
                // embedDocumentWatermark now handles Uint8Array and returns buffer
                try {
                    const result = watermark.embedDocumentWatermark(fileData, fileExt, watermarkPayload);
                    // result might be string (for txt fallback) or Uint8Array
                    if (result instanceof Uint8Array) {
                        fileData = result;
                    } else if (typeof result === 'string') {
                        // convert back to bytes if it returned string (txt)
                        const encoder = new TextEncoder();
                        fileData = encoder.encode(result);
                    }
                } catch (e) {
                    console.warn('Doc watermark failed:', e);
                }
            }



            setProgress('Encrypting (Client-Side)...');

            // Animate
            Animated.loop(
                Animated.sequence([
                    Animated.timing(encryptAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
                    Animated.timing(encryptAnim, { toValue: 0, duration: 1000, useNativeDriver: true })
                ])
            ).start();

            // 5. Encrypt watermarked data (Now returns Uint8Array)
            // Generate a random key for this document
            const key = await generateKey();

            // Encrypt the RAW Uint8Array directly (No Base64 overhead)
            const encryptedData = await encryptData(fileData, key);

            setProgress('Uploading encrypted blob...');

            // encryptedData is already Uint8Array, pass directly to upload
            const { data, error } = await uploadOnlineDocument({
                filename: file.name,
                mime_type: file.mimeType,
                size_bytes: file.size,
                encryption_iv: 'aes-gcm-v1', // AES-GCM encryption
                watermark_payload: watermarkPayload // Store watermark metadata
            }, encryptedData, user.id);

            if (error) throw error;

            // Track uploaded document for potential rollback
            uploadedDocId = data.id;
            uploadedFilePath = data.file_path;

            setProgress('Securing encryption key...');

            // ZERO-TRUST: Encrypt AES Key with Owner's Public Key
            // 1. Fetch Owner Profile to get Public Key
            const { data: ownerProfile } = await getProfile(user.id);
            if (!ownerProfile || !ownerProfile.public_key) {
                throw new Error('Zero-Trust Violation: No Public Key found for user. Please sign out and sign in again.');
            }

            // 2. Import Public Key
            const publicKey = await importPublicKey(ownerProfile.public_key);

            // 3. Encrypt AES Key
            const encryptedAesKey = await encryptKey(key, publicKey);

            // Save the ENCRYPTED key (never raw key)
            // TRANSACTION SAFETY: If key save fails, rollback the upload
            const { error: keyError } = await saveDocumentKey(uploadedDocId, encryptedAesKey);
            if (keyError) {
                console.error('Key save failed, initiating rollback:', keyError);
                // Rollback: delete the uploaded document
                await deleteCloudDocument(uploadedDocId, uploadedFilePath);
                throw new Error('Failed to secure encryption key. Upload rolled back for security.');
            }

            Alert.alert("Success", "Document encrypted and uploaded securely.");
            navigation.goBack();

        } catch (e) {
            console.error('Upload error:', e);
            // Attempt rollback on any error if we have an uploaded doc
            if (uploadedDocId && uploadedFilePath) {
                console.log('Rolling back failed upload...');
                await deleteCloudDocument(uploadedDocId, uploadedFilePath).catch(rollbackErr => {
                    console.error('Rollback failed:', rollbackErr);
                });
            }
            Alert.alert("Upload Failed", e.message);
        } finally {
            setIsUploading(false);
            setProgress('');
        }
    };

    return (
        <View style={styles.container}>
            <AnimatedHeader title="Secure Upload" showBack onBack={() => navigation.goBack()} />

            <View style={styles.content}>
                <View style={styles.card}>
                    <Ionicons name="cloud-upload-outline" size={48} color={theme.colors.accent.blue} />
                    <Text style={styles.title}>Upload to Cloud</Text>
                    <Text style={styles.subtitle}>
                        Files are encrypted on your device before they ever touch our servers.
                    </Text>

                    {!file ? (
                        <Pressable style={styles.pickButton} onPress={pickDocument}>
                            <Text style={styles.pickButtonText}>Select Document</Text>
                        </Pressable>
                    ) : (
                        <View style={styles.filePreview}>
                            <Ionicons name="document-text" size={32} color="white" />
                            <View style={styles.fileInfo}>
                                <Text style={styles.fileName}>{file.name}</Text>
                                <Text style={styles.fileSize}>{(file.size / 1024 / 1024).toFixed(2)} MB</Text>
                            </View>
                            <Pressable onPress={() => setFile(null)}>
                                <Ionicons name="close-circle" size={24} color={theme.colors.text.muted} />
                            </Pressable>
                        </View>
                    )}
                </View>

                {file && (
                    <Pressable
                        style={[styles.uploadButton, isUploading && styles.disabled]}
                        onPress={handleUpload}
                        disabled={isUploading}
                    >
                        {isUploading ? (
                            <View style={styles.uploadingRow}>
                                <ActivityIndicator color="white" />
                                <Text style={styles.uploadButtonText}>{progress}</Text>
                            </View>
                        ) : (
                            <Text style={styles.uploadButtonText}>Encrypt & Upload</Text>
                        )}
                    </Pressable>
                )}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.bg.primary,
    },
    content: {
        padding: 20,
    },
    card: {
        backgroundColor: theme.colors.bg.secondary,
        borderRadius: 16,
        padding: 24,
        alignItems: 'center',
        marginBottom: 24,
        ...theme.shadow.glow(theme.colors.accent.blue),
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: 'white',
        marginTop: 16,
        marginBottom: 8,
    },
    subtitle: {
        color: theme.colors.text.muted,
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 20,
    },
    pickButton: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 30,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    pickButtonText: {
        color: 'white',
        fontWeight: '600',
    },
    filePreview: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
        padding: 12,
        borderRadius: 12,
        width: '100%',
    },
    fileInfo: {
        flex: 1,
        marginLeft: 12,
    },
    fileName: {
        color: 'white',
        fontWeight: '500',
    },
    fileSize: {
        color: theme.colors.text.muted,
        fontSize: 12,
        marginTop: 2,
    },
    uploadButton: {
        backgroundColor: theme.colors.accent.blue,
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
    },
    uploadButtonText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 16,
    },
    uploadingRow: {
        flexDirection: 'row',
        gap: 10,
    },
    disabled: {
        opacity: 0.7,
    }
});

export default UploadScreen;
