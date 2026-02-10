/**
 * SharedWithMeScreen - Documents Shared TO Current User
 * 
 * Displays documents that other users have shared with the current user.
 * Similar to Google Drive's "Shared with me" section.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    Pressable,
    RefreshControl,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../context/AuthContext';
import { getSharedWithMe } from '../lib/supabase';
import AnimatedHeader from '../components/AnimatedHeader';
import SkeletonLoader from '../components/SkeletonLoader';
import theme from '../theme';

const SharedWithMeScreen = ({ navigation }) => {
    const insets = useSafeAreaInsets();
    const { user } = useAuth();

    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);

    const fetchSharedDocuments = useCallback(async (pageNum = 0, isRefresh = false) => {
        if (!user?.email) return;

        try {
            if (isRefresh) setPage(0);

            const { data, error, hasMore: more } = await getSharedWithMe(user.email, pageNum);
            if (error) throw error;

            // Filter out expired documents
            const now = new Date();
            const validDocs = (data || []).filter(item => {
                if (!item.document) return false;
                if (item.expires_at && new Date(item.expires_at) < now) {
                    return false;
                }
                return item.document.status === 'active';
            });

            if (isRefresh || pageNum === 0) {
                setDocuments(validDocs);
            } else {
                setDocuments(prev => [...prev, ...validDocs]);
            }
            setHasMore(more);
        } catch (error) {
            console.error('Error fetching shared documents:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
            setLoadingMore(false);
        }
    }, [user]);

    useEffect(() => {
        fetchSharedDocuments();
    }, [fetchSharedDocuments]);

    const handleRefresh = () => {
        setRefreshing(true);
        fetchSharedDocuments(0, true);
    };

    const handleLoadMore = () => {
        if (!hasMore || loadingMore) return;
        setLoadingMore(true);
        const nextPage = page + 1;
        setPage(nextPage);
        fetchSharedDocuments(nextPage, false);
    };

    const handleOpenDocument = (item) => {
        if (!item?.document) {
            Alert.alert('Error', 'Document information is missing. Please refresh and try again.');
            return;
        }
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        navigation.navigate('ViewerScreen', {
            document: item.document,
            documentId: item.document.id,
            accessTokenId: item.id,
            recipientEmail: user.email,
        });
    };

    const getFileIcon = (fileType) => {
        switch (fileType) {
            case 'image':
                return 'image-outline';
            case 'pdf':
                return 'document-text-outline';
            default:
                return 'document-outline';
        }
    };

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;
        return date.toLocaleDateString();
    };

    const renderDocumentCard = ({ item }) => {
        const doc = item.document;
        if (!doc) return null;

        return (
            <Pressable
                style={({ pressed }) => [
                    styles.documentCard,
                    pressed && styles.documentCardPressed
                ]}
                onPress={() => handleOpenDocument(item)}
            >
                <View style={styles.iconContainer}>
                    <Ionicons
                        name={getFileIcon(doc.mime_type?.startsWith('image/') ? 'image' : 'document')}
                        size={24}
                        color={theme.colors.accent.blue}
                    />
                </View>
                <View style={styles.documentInfo}>
                    <Text style={styles.documentName} numberOfLines={1}>
                        {doc.filename}
                    </Text>
                    <Text style={styles.documentMeta}>
                        Shared {formatDate(item.created_at)}
                    </Text>
                </View>
                <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={theme.colors.text.muted}
                />
            </Pressable>
        );
    };

    const renderFooter = () => {
        if (!loadingMore) return null;
        return (
            <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color={theme.colors.accent.blue} />
            </View>
        );
    };

    const renderEmptyState = () => (
        <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
                <Ionicons name="people-outline" size={48} color={theme.colors.text.muted} />
            </View>
            <Text style={styles.emptyTitle}>No Shared Documents</Text>
            <Text style={styles.emptySubtitle}>
                When someone shares a document with you, it will appear here.
            </Text>
        </View>
    );

    if (loading) {
        return (
            <View style={styles.container}>
                <AnimatedHeader title="Shared with Me" />
                <View style={styles.loadingContainer}>
                    <SkeletonLoader type="list" />
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <AnimatedHeader title="Shared with Me" />

            <FlatList
                data={documents}
                keyExtractor={(item) => item.id}
                renderItem={renderDocumentCard}
                contentContainerStyle={[
                    styles.listContent,
                    { paddingBottom: insets.bottom + 80 }
                ]}
                ListEmptyComponent={renderEmptyState}
                ListFooterComponent={renderFooter}
                onEndReached={handleLoadMore}
                onEndReachedThreshold={0.5}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={handleRefresh}
                        tintColor={theme.colors.accent.blue}
                    />
                }
                showsVerticalScrollIndicator={false}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.bg.primary,
    },
    loadingContainer: {
        flex: 1,
        padding: 16,
    },
    listContent: {
        padding: 16,
    },
    documentCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.bg.secondary,
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
    },
    documentCardPressed: {
        opacity: 0.8,
        transform: [{ scale: 0.98 }],
    },
    iconContainer: {
        width: 48,
        height: 48,
        borderRadius: 12,
        backgroundColor: 'rgba(61, 122, 255, 0.15)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    documentInfo: {
        flex: 1,
    },
    documentName: {
        color: 'white',
        fontSize: 16,
        fontWeight: theme.font.weight.medium,
        marginBottom: 4,
    },
    documentMeta: {
        color: theme.colors.text.muted,
        fontSize: 13,
    },
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 100,
    },
    emptyIcon: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: theme.colors.bg.secondary,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
    },
    emptyTitle: {
        color: 'white',
        fontSize: 18,
        fontWeight: theme.font.weight.semibold,
        marginBottom: 8,
    },
    emptySubtitle: {
        color: theme.colors.text.muted,
        fontSize: 14,
        textAlign: 'center',
        maxWidth: 280,
        lineHeight: 20,
    },
});

export default SharedWithMeScreen;
