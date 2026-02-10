import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Image, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import theme from '../theme';
import AnimatedHeader from '../components/AnimatedHeader';
import * as watermark from '../utils/watermark';
import * as storage from '../utils/storage';

const VerifyLeakScreen = ({ route, navigation }) => {
    const params = route.params || {}; // Logic to handle direct tab press vs nav from Detail
    const { preloadedDocument } = params;

    const [selectedFile, setSelectedFile] = useState(null); // { uri, name, base64, type, ext }
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null); // { status: 'found'|'not_found', data: { doc } }

    // Animation for pulse
    const pulseScale = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (preloadedDocument) {
            // Auto-load logic
            // We simulate "loading" the file from the preloaded doc data as if it were a file on disk? 
            // Or we just present it as ready to scan.
            // User spec: "Show the document preview immediately... Auto-trigger the scan after a 500ms delay"

            // Prepare file object
            const file = {
                name: preloadedDocument.filename,
                type: preloadedDocument.fileType,
                base64: preloadedDocument.watermarkedData || preloadedDocument.originalData, // The leaked file is the one containing watermark
                // For verification simulation, we verify the stored data.
                ext: preloadedDocument.mimeType ? (preloadedDocument.mimeType.includes('image') ? 'jpg' : 'txt') : 'txt' // Simplification
            };
            // Fix ext
            if (preloadedDocument.fileType === 'document') {
                // Try to guess from filename or mime
                const ext = preloadedDocument.filename.split('.').pop();
                file.ext = ext;
            }

            setSelectedFile(file);

            // Auto Trigger
            setTimeout(() => {
                handleScan(file);
            }, 500);
        }
    }, [preloadedDocument]);

    const handlePick = () => {
        Alert.alert(
            "Select File Type",
            "Choose the source of the file to verify",
            [
                { text: "Cancel", style: "cancel" },
                { text: "Document", onPress: () => pick('document') },
                { text: "Image", onPress: () => pick('image') }
            ]
        );
    };

    const pick = async (type) => {
        setResult(null);
        try {
            let fileData = null;
            if (type === 'image') {
                const res = await ImagePicker.launchImageLibraryAsync({
                    mediaTypes: ['images'],
                    quality: 1,
                    base64: true, // WARNING: This can crash on large images
                });

                if (!res.canceled && res.assets && res.assets.length > 0) {
                    const a = res.assets[0];

                    // Safety check (approximate from base64 length or file size if available)
                    // 15MB limit for safety on JS thread
                    const size = a.fileSize || (a.base64 ? a.base64.length * 0.75 : 0);
                    if (size > 15 * 1024 * 1024) {
                        Alert.alert("File Too Large", "Please select an image under 15MB for verification.");
                        return;
                    }

                    fileData = {
                        uri: a.uri,
                        name: a.fileName || 'CHECK_IMAGE.jpg',
                        type: 'image',
                        base64: a.base64,
                        ext: 'jpg'
                    };
                }
            } else {
                // doc
                const res = await DocumentPicker.getDocumentAsync({
                    copyToCacheDirectory: true,
                });

                if (!res.canceled && res.assets && res.assets.length > 0) {
                    const a = res.assets[0];

                    if (a.size > 15 * 1024 * 1024) {
                        Alert.alert("File Too Large", "Please select a document under 15MB for verification.");
                        return;
                    }

                    const b64 = await FileSystem.readAsStringAsync(a.uri, { encoding: 'base64' });
                    fileData = {
                        uri: a.uri,
                        name: a.name,
                        type: 'document',
                        base64: b64,
                        ext: a.name.split('.').pop()
                    };
                }
            }

            if (fileData) {
                setSelectedFile(fileData);
            }
        } catch (e) {
            console.error(e);
            Alert.alert("Error", "Failed to load file. It might be too large.");
        }
    };

    const handleScan = async (fileObj = selectedFile) => {
        if (!fileObj) return;

        setLoading(true);
        // Animation pulse
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulseScale, { toValue: 1.15, duration: 900, useNativeDriver: true }),
                Animated.timing(pulseScale, { toValue: 1, duration: 900, useNativeDriver: true })
            ])
        ).start();

        // Minimum 1800ms
        const start = Date.now();

        // Extract
        let extractedUUID = null;
        try {
            if (fileObj.type === 'image') {
                const extractionResult = await watermark.extractImageWatermarkAsync(fileObj.base64);
                extractedUUID = extractionResult.data;
            } else {
                extractedUUID = watermark.extractDocumentWatermark(fileObj.base64, fileObj.ext);
            }
        } catch (e) {
            console.error("Extraction failed", e);
        }

        const elapsed = Date.now() - start;
        if (elapsed < 1800) {
            await new Promise(r => setTimeout(r, 1800 - elapsed));
        }

        // Check DB
        if (extractedUUID) {
            const doc = await storage.getDocumentByUUID(extractedUUID);
            if (doc) {
                setResult({ status: 'found', data: doc });
            } else {
                // UUID found but not in DB? (Deleted?)
                setResult({ status: 'not_found' });
            }
        } else {
            setResult({ status: 'not_found' });
        }

        setLoading(false);
        pulseScale.setValue(1); // stop anim
    };

    const getPreview = () => {
        if (!selectedFile) return null;
        if (selectedFile.type === 'image') return { uri: 'data:image/jpeg;base64,' + selectedFile.base64 }; // Assumes jpeg/png
        return null;
    };

    return (
        <View style={styles.container}>
            <AnimatedHeader title="Verify Leak" showBack={false} />

            <View style={styles.content}>

                {/* Pick Card (if not scanning/result) */}
                {!result && !loading && (
                    <>
                        {!selectedFile ? (
                            <>
                                <Text style={styles.sectionTitle}>LOAD SUSPECTED IMAGE OR DOCUMENT</Text>
                                <Pressable style={styles.pickCard} onPress={handlePick}>
                                    <Ionicons name="search-outline" size={36} color={theme.colors.accent.blue} />
                                    <Text style={styles.pickText}>Tap to load a file to verify</Text>
                                </Pressable>
                            </>
                        ) : (
                            <View style={styles.previewContainer}>
                                {selectedFile.type === 'image' ? (
                                    <Image source={getPreview()} style={styles.previewImage} />
                                ) : (
                                    <View style={styles.docIcon}>
                                        <Ionicons name="document-text" size={32} color="white" />
                                    </View>
                                )}
                                <Text style={styles.previewName}>Verifying watermark for '{selectedFile.name}'</Text>
                            </View>
                        )}
                    </>
                )}

                {/* Loading State */}
                {loading && (
                    <View style={styles.loadingContainer}>
                        <Animated.View style={{ transform: [{ scale: pulseScale }] }}>
                            <View style={styles.pulseCircle}>
                                <Ionicons name="scan-outline" size={40} color={theme.colors.accent.blue} />
                            </View>
                        </Animated.View>
                        <Text style={styles.loadingText}>Scanning for watermark...</Text>
                        <Text style={styles.loadingSubText}>Analyzing file for embedded security marks</Text>
                    </View>
                )}

                {/* Result */}
                {result && (
                    <View style={styles.resultContainer}>
                        {result.status === 'found' ? (
                            <View style={styles.foundCard}>
                                <View style={styles.resultHeader}>
                                    <Ionicons name="checkmark-circle" size={36} color={theme.colors.status.active} />
                                    <Text style={styles.resultTitleFound}>Watermark Identified</Text>
                                </View>
                                <Text style={styles.resultSubFound}>This file was shared through SecureShare</Text>
                                <View style={styles.divider} />
                                <View style={styles.details}>
                                    <Text style={styles.detailRow}><Text style={styles.label}>Document:</Text> {result.data.filename}</Text>
                                    <Text style={styles.detailRow}><Text style={styles.label}>Shared With:</Text> {result.data.recipients.map(r => r.email).join(', ')}</Text>
                                    <Text style={styles.detailRow}><Text style={styles.label}>Shared On:</Text> {new Date(result.data.sharedAt).toLocaleDateString()}</Text>
                                    <Text style={styles.detailRow}><Text style={styles.label}>Status:</Text> {result.data.status.toUpperCase()}</Text>
                                </View>
                                <Pressable onPress={() => navigation.navigate('Home', { screen: 'Detail', params: { document: result.data } })}>
                                    <Text style={styles.link}>View Full Details →</Text>
                                </Pressable>
                            </View>
                        ) : (
                            <View style={styles.notFoundCard}>
                                <Ionicons name="information-circle-outline" size={36} color={theme.colors.text.secondary} />
                                <Text style={styles.resultTitleNotFound}>No Watermark Found</Text>
                                <Text style={styles.resultSubNotFound}>
                                    This file was not shared through SecureShare, or the watermark could not be read.
                                </Text>
                            </View>
                        )}

                        <Pressable style={styles.rescanBtn} onPress={() => { setSelectedFile(null); setResult(null); }}>
                            <Text style={styles.rescanText}>Scan Another File</Text>
                        </Pressable>
                    </View>
                )}

                {/* Scan Button */}
                {selectedFile && !loading && !result && (
                    <Pressable style={styles.scanBtn} onPress={() => handleScan(selectedFile)}>
                        <Text style={styles.scanBtnText}>Scan Watermark</Text>
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
        padding: 16,
        flex: 1,
    },
    sectionTitle: {
        fontSize: 11, color: theme.colors.text.muted, marginTop: 16, marginBottom: 12, letterSpacing: 1,
    },
    pickCard: {
        backgroundColor: theme.colors.bg.secondary,
        borderRadius: 16,
        borderWidth: 2,
        borderColor: 'rgba(61,122,255,0.3)',
        borderStyle: 'dashed',
        height: 140,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
    },
    pickText: {
        color: theme.colors.text.secondary,
        fontSize: 15,
    },
    previewContainer: {
        alignItems: 'center',
        marginTop: 40,
    },
    previewImage: {
        width: 100, height: 100, borderRadius: 12, marginBottom: 16,
    },
    docIcon: {
        width: 80, height: 80, borderRadius: 12, backgroundColor: theme.colors.accent.blue,
        alignItems: 'center', justifyContent: 'center', marginBottom: 16,
    },
    previewName: {
        color: theme.colors.text.secondary,
        fontSize: 14,
        textAlign: 'center',
    },
    loadingContainer: {
        flex: 1, alignItems: 'center', justifyContent: 'center',
    },
    pulseCircle: {
        width: 80, height: 80, borderRadius: 40,
        borderWidth: 3, borderColor: theme.colors.accent.blue,
        alignItems: 'center', justifyContent: 'center', marginBottom: 16,
    },
    loadingText: {
        color: theme.colors.accent.blue, fontSize: 18, fontWeight: '600', marginTop: 8,
    },
    loadingSubText: {
        color: theme.colors.text.muted, fontSize: 13, marginTop: 6, textAlign: 'center',
    },
    scanBtn: {
        position: 'absolute', bottom: 100, left: 16, right: 16,
        backgroundColor: theme.colors.accent.blue,
        paddingVertical: 16, borderRadius: 12, alignItems: 'center',
        shadowColor: theme.colors.accent.blue,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
    },
    scanBtnText: {
        color: 'white', fontWeight: 'bold', fontSize: 16,
    },
    resultContainer: {
        marginTop: 20,
    },
    foundCard: {
        backgroundColor: 'rgba(52,211,153,0.06)',
        borderWidth: 1.5, borderColor: theme.colors.status.active,
        borderRadius: 16, padding: 20,
    },
    resultHeader: {
        flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8,
    },
    resultTitleFound: {
        color: theme.colors.status.active, fontSize: 18, fontWeight: 'bold'
    },
    resultSubFound: {
        color: theme.colors.text.secondary, fontSize: 14, marginBottom: 16,
    },
    divider: {
        height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginBottom: 16,
    },
    details: {
        gap: 8, marginBottom: 16,
    },
    detailRow: {
        color: 'white', fontSize: 14,
    },
    label: {
        color: theme.colors.text.muted,
    },
    link: {
        color: theme.colors.accent.blue, fontWeight: '600', fontSize: 14,
    },
    notFoundCard: {
        backgroundColor: 'rgba(107,114,128,0.06)',
        borderWidth: 1, borderColor: theme.colors.border.light,
        borderRadius: 16, padding: 24, alignItems: 'center',
    },
    resultTitleNotFound: {
        color: 'white', fontSize: 18, fontWeight: 'bold', marginTop: 12, marginBottom: 8,
    },
    resultSubNotFound: {
        color: theme.colors.text.muted, textAlign: 'center', fontSize: 14, lineHeight: 20,
    },
    rescanBtn: {
        marginTop: 24, alignItems: 'center',
    },
    rescanText: {
        color: theme.colors.text.secondary, textDecorationLine: 'underline',
    }
});

export default VerifyLeakScreen;
