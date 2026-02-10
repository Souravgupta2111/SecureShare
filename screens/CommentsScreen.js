/**
 * CommentsScreen - Document comments viewer
 * 
 * Shows list of comments on a document with ability to add new ones.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    RefreshControl,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AnimatedHeader from '../components/AnimatedHeader';
import CommentInput from '../components/CommentInput';
import { useAuth } from '../context/AuthContext';
import { getDocumentComments, addDocumentComment } from '../lib/supabase';
import theme from '../theme';

const CommentsScreen = ({ route, navigation }) => {
    const { documentId, documentName } = route.params;
    const { user } = useAuth();
    const insets = useSafeAreaInsets();

    const [comments, setComments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const fetchComments = useCallback(async () => {
        try {
            const { data, error } = await getDocumentComments(documentId);
            if (error) throw error;
            setComments(data || []);
        } catch (e) {
            console.error('Error fetching comments:', e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [documentId]);

    useEffect(() => {
        fetchComments();
    }, [fetchComments]);

    const handleRefresh = () => {
        setRefreshing(true);
        fetchComments();
    };

    const handleAddComment = async (text) => {
        if (!user?.email) return;

        setSubmitting(true);
        try {
            const { error } = await addDocumentComment(documentId, user.id, user.email, text);
            if (error) throw error;
            fetchComments();
        } catch (e) {
            console.error('Error adding comment:', e);
        } finally {
            setSubmitting(false);
        }
    };

    const formatDate = (dateStr) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    };

    const renderComment = ({ item }) => (
        <View style={styles.commentCard}>
            <View style={styles.commentHeader}>
                <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                        {item.user_email?.[0]?.toUpperCase() || '?'}
                    </Text>
                </View>
                <View style={styles.commentMeta}>
                    <Text style={styles.commentEmail}>{item.user_email}</Text>
                    <Text style={styles.commentTime}>{formatDate(item.created_at)}</Text>
                </View>
            </View>
            <Text style={styles.commentText}>{item.content}</Text>
        </View>
    );

    const renderEmptyState = () => (
        <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>💬</Text>
            <Text style={styles.emptyTitle}>No Comments Yet</Text>
            <Text style={styles.emptySubtitle}>
                Be the first to add a comment to this document
            </Text>
        </View>
    );

    return (
        <View style={styles.container}>
            <AnimatedHeader
                title="Comments"
                subtitle={documentName}
                showBack
                onBack={() => navigation.goBack()}
            />

            <KeyboardAvoidingView
                style={styles.content}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
            >
                <FlatList
                    data={comments}
                    keyExtractor={(item) => item.id}
                    renderItem={renderComment}
                    ListEmptyComponent={!loading && renderEmptyState}
                    contentContainerStyle={[
                        styles.listContent,
                        comments.length === 0 && styles.emptyList,
                    ]}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={handleRefresh}
                            tintColor={theme.colors.accent.blue}
                        />
                    }
                />

                <View style={[styles.inputContainer, { paddingBottom: insets.bottom + 12 }]}>
                    <CommentInput
                        onSubmit={handleAddComment}
                        loading={submitting}
                    />
                </View>
            </KeyboardAvoidingView>
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
    },
    listContent: {
        padding: 16,
    },
    emptyList: {
        flex: 1,
    },
    commentCard: {
        backgroundColor: theme.colors.bg.secondary,
        borderRadius: 12,
        padding: 14,
        marginBottom: 12,
    },
    commentHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
    },
    avatar: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: theme.colors.bg.tertiary,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
    },
    avatarText: {
        color: theme.colors.accent.blue,
        fontSize: 14,
        fontWeight: 'bold',
    },
    commentMeta: {
        flex: 1,
    },
    commentEmail: {
        color: 'white',
        fontSize: 13,
        fontWeight: '600',
    },
    commentTime: {
        color: theme.colors.text.muted,
        fontSize: 11,
        marginTop: 1,
    },
    commentText: {
        color: theme.colors.text.secondary,
        fontSize: 14,
        lineHeight: 20,
    },
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyIcon: {
        fontSize: 48,
        marginBottom: 16,
    },
    emptyTitle: {
        color: 'white',
        fontSize: 18,
        fontWeight: '600',
        marginBottom: 8,
    },
    emptySubtitle: {
        color: theme.colors.text.muted,
        fontSize: 14,
        textAlign: 'center',
    },
    inputContainer: {
        paddingHorizontal: 16,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border.light,
        backgroundColor: theme.colors.bg.primary,
    },
});

export default CommentsScreen;
