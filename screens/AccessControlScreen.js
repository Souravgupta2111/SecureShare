import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, Alert, ActivityIndicator, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import theme from '../theme';
import AnimatedHeader from '../components/AnimatedHeader';
import { useAuth } from '../context/AuthContext';
import * as SecureStore from 'expo-secure-store';
import { getDocumentGrants, grantAccess, revokeAccess, getDocumentKey, saveDocumentKey, getProfileByEmail } from '../lib/supabase';
import { decryptKey, encryptKey, importPublicKey, importPrivateKey } from '../utils/crypto';

const PRIVATE_KEY_STORAGE_KEY = 'secureshare_private_key';

const AccessControlScreen = ({ route, navigation }) => {
    const { document } = route.params;
    const { user } = useAuth();

    const [email, setEmail] = useState('');
    const [grants, setGrants] = useState([]);
    const [loading, setLoading] = useState(true);
    const [adding, setAdding] = useState(false);

    useEffect(() => {
        loadGrants();
    }, []);

    const loadGrants = async () => {
        setLoading(true);
        const { data, error } = await getDocumentGrants(document.id);
        if (data) setGrants(data);
        setLoading(false);
    };

    const handleGrant = async () => {
        if (!email.includes('@')) {
            Alert.alert("Invalid Email", "Please enter a valid email address.");
            return;
        }

        setAdding(true);

        try {
            // 1. Get Recipient Profile
            const { data: recipientProfile, error: profileError } = await getProfileByEmail(email);
            if (profileError || !recipientProfile) {
                Alert.alert("Error", "User not found. They must have a SecureShare account to receive secure documents.");
                setAdding(false);
                return;
            }

            if (!recipientProfile.public_key) {
                Alert.alert("Error", "User has not set up Zero-Trust keys yet. Ask them to sign in once.");
                setAdding(false);
                return;
            }

            // 2. Get My Encrypted Key for this Doc
            const { data: myKeyData, error: keyError } = await getDocumentKey(document.id);
            if (keyError || !myKeyData) {
                throw new Error("Could not retrieve encryption key for this document.");
            }

            // 3. Get My Private Key
            const privateKeyPem = await SecureStore.getItemAsync(PRIVATE_KEY_STORAGE_KEY);
            if (!privateKeyPem) {
                throw new Error("Device private key missing. Cannot share.");
            }

            // 4. Decrypt AES Key
            const privateKey = await importPrivateKey(privateKeyPem);
            const aesKey = await decryptKey(myKeyData.encrypted_key, privateKey);

            // 5. Encrypt AES Key for Recipient
            const recipientPubKey = await importPublicKey(recipientProfile.public_key);
            const recipientEncryptedKey = await encryptKey(aesKey, recipientPubKey);

            // 6. Save Key for Recipient
            const { error: saveError } = await saveDocumentKey(document.id, recipientEncryptedKey, recipientProfile.id);
            if (saveError) throw saveError;

            // 7. Grant Access
            const { error: grantError } = await grantAccess(document.id, email, user.id);
            if (grantError) throw grantError;

            setEmail('');
            loadGrants();
            Alert.alert("Success", `Access granted to ${email}`);

        } catch (e) {
            console.error(e);
            Alert.alert("Error", e.message);
        } finally {
            setAdding(false);
        }
    };

    const handleRevoke = async (grantId) => {
        const { error } = await revokeAccess(grantId);
        if (error) Alert.alert("Error", error.message);
        else loadGrants();
    };

    const renderGrantItem = ({ item }) => (
        <View style={styles.grantItem}>
            <View style={styles.grantInfo}>
                <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{item.recipient_email[0].toUpperCase()}</Text>
                </View>
                <View>
                    <Text style={styles.emailText}>{item.recipient_email}</Text>
                    <Text style={[styles.statusText, item.status === 'revoked' && styles.revokedStatus]}>
                        {item.status.toUpperCase()}
                    </Text>
                </View>
            </View>

            {item.status === 'active' && (
                <Pressable onPress={() => handleRevoke(item.id)} style={styles.revokeBtn}>
                    <Ionicons name="close-circle-outline" size={24} color={theme.colors.status.error} />
                </Pressable>
            )}
        </View>
    );

    return (
        <View style={styles.container}>
            <AnimatedHeader title="Manage Access" showBack onBack={() => navigation.goBack()} />

            <View style={styles.content}>
                <View style={styles.docInfo}>
                    <Ionicons name="document-text" size={24} color={theme.colors.text.secondary} />
                    <Text style={styles.docName}>{document.filename}</Text>
                </View>

                {/* Add Recipient */}
                <View style={styles.addSection}>
                    <Text style={styles.sectionTitle}>Add Recipient</Text>
                    <View style={styles.inputRow}>
                        <TextInput
                            style={styles.input}
                            placeholder="recipient@email.com"
                            placeholderTextColor={theme.colors.text.muted}
                            value={email}
                            onChangeText={setEmail}
                            autoCapitalize="none"
                            keyboardType="email-address"
                        />
                        <Pressable
                            style={[styles.addBtn, adding && styles.disabled]}
                            onPress={handleGrant}
                            disabled={adding}
                        >
                            {adding ? <ActivityIndicator color="white" size="small" /> : <Text style={styles.addBtnText}>Grant</Text>}
                        </Pressable>
                    </View>
                </View>

                {/* List */}
                <Text style={styles.sectionTitle}>Who has access</Text>
                {loading ? (
                    <ActivityIndicator style={{ marginTop: 20 }} color={theme.colors.accent.blue} />
                ) : (
                    <FlatList
                        data={grants}
                        keyExtractor={item => item.id}
                        renderItem={renderGrantItem}
                        ListEmptyComponent={<Text style={styles.emptyText}>No one has secure access yet.</Text>}
                        contentContainerStyle={{ paddingBottom: 20 }}
                    />
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
        flex: 1,
        padding: 20,
    },
    docInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 24,
        padding: 16,
        backgroundColor: theme.colors.bg.secondary,
        borderRadius: 12,
        gap: 12,
    },
    docName: {
        color: 'white',
        fontSize: 16,
        fontWeight: '600',
    },
    sectionTitle: {
        color: theme.colors.text.muted,
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 12,
        marginTop: 8,
    },
    addSection: {
        marginBottom: 24,
    },
    inputRow: {
        flexDirection: 'row',
        gap: 12,
    },
    input: {
        flex: 1,
        backgroundColor: theme.colors.bg.secondary,
        borderRadius: 8,
        padding: 12,
        color: 'white',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    addBtn: {
        backgroundColor: theme.colors.accent.blue,
        borderRadius: 8,
        paddingHorizontal: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    addBtnText: {
        color: 'white',
        fontWeight: '600',
    },
    grantItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    grantInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    avatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: theme.colors.bg.secondary,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    avatarText: {
        color: 'white',
        fontWeight: 'bold',
    },
    emailText: {
        color: 'white',
        fontSize: 15,
    },
    statusText: {
        color: theme.colors.status.success,
        fontSize: 12,
        marginTop: 2,
    },
    revokedStatus: {
        color: theme.colors.status.error,
        textDecorationLine: 'line-through',
    },
    revokeBtn: {
        padding: 4,
    },
    emptyText: {
        color: theme.colors.text.muted,
        fontStyle: 'italic',
        marginTop: 8,
    },
    disabled: {
        opacity: 0.7,
    }
});

export default AccessControlScreen;
