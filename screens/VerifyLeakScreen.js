import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Image, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import DocumentScanner from 'react-native-document-scanner-plugin';
import theme from '../theme';
import AnimatedHeader from '../components/AnimatedHeader';
import * as watermark from '../utils/watermark';
import * as storage from '../utils/storage';
import { supabase, getDocumentGrants } from '../lib/supabase';

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
                { text: "AI Scanner (Camera)", onPress: handleAIScan },
                { text: "Gallery Image", onPress: () => pick('image') },
                { text: "Document File", onPress: () => pick('document') }
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
                });

                if (!res.canceled && res.assets && res.assets.length > 0) {
                    const a = res.assets[0];

                    // Safety check (approximate from file size if available)
                    // 15MB limit for safety on JS thread
                    const size = a.fileSize || 0;
                    if (size > 15 * 1024 * 1024) {
                        Alert.alert("File Too Large", "Please select an image under 15MB for verification.");
                        return;
                    }

                    const base64String = await FileSystem.readAsStringAsync(a.uri, {
                        encoding: 'base64'
                    });

                    fileData = {
                        uri: a.uri,
                        name: a.fileName || 'CHECK_IMAGE.jpg',
                        type: 'image',
                        base64: base64String,
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

    const handleAIScan = async () => {
        setResult(null);
        try {
            const { scannedImages } = await DocumentScanner.scanDocument();
            if (scannedImages && scannedImages.length > 0) {
                // Ensure it's a local file format and load into base64
                const localUri = scannedImages[0];
                const cleanBase64 = await FileSystem.readAsStringAsync(localUri, { encoding: 'base64' });
                
                setSelectedFile({
                    uri: localUri,
                    base64: cleanBase64,
                    type: 'image',
                    ext: 'jpeg',
                    name: 'AI_Scanner_Leak.jpg'
                });
            }
        } catch (e) {
            console.error('AI Scan failed:', e);
            Alert.alert('Scanner Error', 'Failed to acquire geometric scan: ' + e.message);
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
        let leakerId = null;
        let confidenceScore = 0;
        let targetDoc = null;
        let detectionMethod = null; // 'invisible' or 'visible'

        try {
            if (fileObj.type === 'image') {
                let SecureWatermark = null;
                try {
                    const { requireNativeModule } = require('expo-modules-core');
                    SecureWatermark = requireNativeModule('SecureWatermark');
                } catch (e) {
                    console.warn('[VerifyLeak] SecureWatermark not available:', e.message);
                }

                if (SecureWatermark) {
                    // ── STEP 1: INVISIBLE DETECTION (Spread Spectrum Correlation) ──
                    const { data: allDocs } = await supabase.from('documents').select('id');
                    const allDocIds = (allDocs || []).map(d => d.id).filter(Boolean);

                    console.log(`[VerifyLeak] Scanning for Document ID among ${allDocIds.length} known documents...`);
                    const detectedDocId = await SecureWatermark.detectDocumentId(
                        fileObj.base64,
                        JSON.stringify(allDocIds)
                    );
                    console.log(`[VerifyLeak] Extracted Document ID:`, detectedDocId);

                    if (detectedDocId) {
                        extractedUUID = detectedDocId;
                        targetDoc = (await supabase.from('documents').select('*').eq('id', detectedDocId).maybeSingle()).data;

                        if (targetDoc) {
                            // Correlate user ID from known document recipients
                            const grantsRes = await getDocumentGrants(detectedDocId);
                            const candidates = grantsRes?.data?.map(g => g.recipient_email).filter(Boolean) || [];
                            
                            const { data: ownerProfile } = await supabase.from('profiles').select('email').eq('id', targetDoc.owner_id).maybeSingle();
                            if (ownerProfile && ownerProfile.email) candidates.push(ownerProfile.email);

                            if (candidates.length > 0) {
                                console.log(`[VerifyLeak] Scanning for Leaker ID among ${candidates.length} candidates...`);
                                const leakResult = await SecureWatermark.detectLeaker(
                                    fileObj.base64,
                                    detectedDocId,
                                    JSON.stringify(candidates)
                                );
                                console.log(`[VerifyLeak] Leaker Extraction Result:`, leakResult);

                                if (leakResult && leakResult.confidence > 0.5) {
                                    leakerId = leakResult.userId;
                                    confidenceScore = leakResult.confidence;
                                    detectionMethod = 'invisible';
                                }
                            }
                        }
                    }

                    // ── STEP 2: VISIBLE DETECTION (ML Kit OCR fallback) ──
                    // If invisible detection didn't find the leaker, try reading the visible overlay
                    if (!leakerId) {
                        console.log('[VerifyLeak] Invisible detection did not identify leaker. Trying visible watermark OCR...');
                        try {
                            const ocrText = await SecureWatermark.extractVisibleWatermark(fileObj.base64);
                            console.log(`[VerifyLeak] OCR extracted text: "${ocrText}"`);

                            if (ocrText && ocrText.length > 0) {
                                // Parse userId|docId patterns from the OCR output
                                // The overlay format is: "userId|docId" repeated 20 times
                                const pipeMatches = ocrText.match(/([^\s|]+)\|([^\s|]+)/g);
                                if (pipeMatches && pipeMatches.length > 0) {
                                    // Take the most frequently occurring match (consensus vote)
                                    const freq = {};
                                    pipeMatches.forEach(m => { freq[m] = (freq[m] || 0) + 1; });
                                    const bestMatch = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
                                    
                                    if (bestMatch) {
                                        const parts = bestMatch[0].split('|');
                                        const visibleUserId = parts[0];
                                        const visibleDocId = parts[1];
                                        
                                        console.log(`[VerifyLeak] Visible watermark detected: user=${visibleUserId}, doc=${visibleDocId}, votes=${bestMatch[1]}`);
                                        
                                        leakerId = visibleUserId;
                                        confidenceScore = Math.min(bestMatch[1] / 10, 1.0); // Normalize vote count to 0-1
                                        detectionMethod = 'visible';

                                        // If we didn't find the doc from invisible detection, try from visible
                                        if (!extractedUUID && visibleDocId) {
                                            extractedUUID = visibleDocId;
                                            targetDoc = (await supabase.from('documents').select('*').eq('id', visibleDocId).maybeSingle()).data;
                                        }
                                    }
                                }

                                // Fallback: check if any known email appears in the raw OCR text
                                if (!leakerId && allDocIds.length > 0) {
                                    const { data: allProfiles } = await supabase.from('profiles').select('email').limit(100);
                                    const knownEmails = (allProfiles || []).map(p => p.email).filter(Boolean);
                                    for (const email of knownEmails) {
                                        if (ocrText.includes(email)) {
                                            leakerId = email;
                                            confidenceScore = 0.7;
                                            detectionMethod = 'visible';
                                            console.log(`[VerifyLeak] Visible watermark email match: ${email}`);
                                            break;
                                        }
                                    }
                                }
                            }
                        } catch (ocrErr) {
                            console.warn('[VerifyLeak] Visible watermark OCR failed:', ocrErr.message);
                        }
                    }
                } else {
                    console.log('[VerifyLeak] Native SecureWatermark missing, falling back to legacy delimiter extraction.');
                    // Fallback to legacy extraction if native module not available
                    const extractionResult = await watermark.extractImageWatermarkAsync(fileObj.base64);
                    extractedUUID = extractionResult.data;
                    console.log(`[VerifyLeak] Legacy Extraction Result:`, extractedUUID);
                }
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
            // Document text watermark format might split by |
            const docId = extractedUUID.includes('|') ? extractedUUID.split('|')[0] : extractedUUID;
            const doc = targetDoc || (await supabase.from('documents').select('*').eq('id', docId).maybeSingle()).data;
            
            // Text legacy leaker fallback
            if (!leakerId && extractedUUID.includes('|')) {
                leakerId = extractedUUID.split('|')[1];
                detectionMethod = 'legacy';
            }
            
            if (doc) {
                setResult({ status: 'found', data: doc, leaker: leakerId, confidence: confidenceScore, method: detectionMethod });
            } else {
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
                                    <Text style={styles.detailRow}><Text style={styles.label}>Shared With:</Text> {result.data.recipients?.map(r => r.email).join(', ') || 'None'}</Text>
                                    <Text style={styles.detailRow}><Text style={styles.label}>Shared On:</Text> {new Date(result.data.sharedAt || result.data.created_at).toLocaleDateString()}</Text>
                                    <Text style={styles.detailRow}><Text style={styles.label}>Status:</Text> {result.data.status?.toUpperCase() || 'ACTIVE'}</Text>
                                    
                                    {result.leaker && (() => {
                                        const getConfidenceLabel = (score) => {
                                            if (score > 3.0) return { label: 'Very High', color: '#ef4444' };
                                            if (score > 2.0) return { label: 'High', color: '#f97316' };
                                            if (score > 1.5) return { label: 'Medium', color: '#eab308' };
                                            return { label: 'Low', color: '#6b7280' };
                                        };
                                        const getMethodLabel = (method) => {
                                            if (method === 'invisible') return { label: 'Spread-Spectrum (Invisible)', icon: 'eye-off-outline' };
                                            if (method === 'visible') return { label: 'OCR Overlay (Visible)', icon: 'eye-outline' };
                                            return { label: 'Legacy Delimiter', icon: 'code-outline' };
                                        };
                                        const conf = getConfidenceLabel(result.confidence);
                                        const methodInfo = getMethodLabel(result.method);
                                        return (
                                            <>
                                                <View style={[styles.divider, { marginTop: 12, marginBottom: 12, backgroundColor: 'rgba(255,100,100,0.2)' }]} />
                                                <Text style={[styles.detailRow, { color: theme.colors.status.error, fontWeight: 'bold' }]}>
                                                    <Ionicons name="warning" size={16} color={theme.colors.status.error} /> FORENSIC MATCH
                                                </Text>
                                                <Text style={styles.detailRow}><Text style={styles.label}>Leaked By:</Text> <Text style={{ color: '#fff', fontWeight: 'bold' }}>{result.leaker}</Text></Text>
                                                {result.confidence > 0 && (
                                                    <Text style={styles.detailRow}>
                                                        <Text style={styles.label}>Confidence:</Text> {result.confidence.toFixed(2)} (<Text style={{ color: conf.color }}>{conf.label}</Text>)
                                                    </Text>
                                                )}
                                                <Text style={styles.detailRow}>
                                                    <Text style={styles.label}>Detected Via:</Text> <Ionicons name={methodInfo.icon} size={14} color={theme.colors.accent.blue} /> <Text style={{ color: theme.colors.accent.blue }}>{methodInfo.label}</Text>
                                                </Text>
                                            </>
                                        );
                                    })()}
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
