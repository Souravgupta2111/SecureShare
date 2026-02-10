import React, { memo } from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import theme from '../theme';
import RichFileIcon from './RichFileIcon';
import formatDistanceToNow from 'date-fns/formatDistanceToNow';

const GridDocCard = ({ document, onPress, onMorePress }) => {
    const isFolder = document.type === 'folder';

    return (
        <Pressable
            style={styles.card}
            onPress={() => onPress(document)}
            android_ripple={{ color: theme.colors.bg.tertiary }}
        >
            <View style={styles.previewArea}>
                {document.thumbnail ? (
                    <Image source={{ uri: document.thumbnail }} style={styles.thumbnail} />
                ) : (
                    <RichFileIcon
                        type={isFolder ? 'folder' : 'file'}
                        mimeType={document.mime_type}
                        size={64}
                    />
                )}

                {document.isOffline && (
                    <View style={styles.offlineBadge}>
                        <Ionicons name="cloud-download" size={12} color="white" />
                    </View>
                )}
            </View>

            <View style={styles.metaArea}>
                <View style={styles.headerRow}>
                    <Text style={styles.title} numberOfLines={1}>
                        {document.filename || document.name}
                    </Text>
                    <Pressable onPress={() => onMorePress(document)} hitSlop={8}>
                        <Ionicons name="ellipsis-vertical" size={16} color={theme.colors.text.secondary} />
                    </Pressable>
                </View>

                {!isFolder && (
                    <Text style={styles.date}>
                        {document.created_at ? formatDistanceToNow(new Date(document.created_at), { addSuffix: true }) : ''}
                    </Text>
                )}
            </View>
        </Pressable>
    );
};

const styles = StyleSheet.create({
    card: {
        flex: 1,
        backgroundColor: theme.colors.bg.secondary,
        borderRadius: theme.layout.radius.md,
        margin: 6,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: theme.colors.border.subtle,
        // Height will be determined by grid layout, typically ~160px
        height: 160,
    },
    previewArea: {
        flex: 2,
        backgroundColor: theme.colors.bg.tertiary,
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
    },
    thumbnail: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover',
    },
    offlineBadge: {
        position: 'absolute',
        top: 8,
        right: 8,
        backgroundColor: theme.colors.bg.glass,
        padding: 4,
        borderRadius: 4,
    },
    metaArea: {
        flex: 1,
        padding: 10,
        justifyContent: 'center',
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    title: {
        flex: 1,
        color: theme.colors.text.primary,
        fontSize: theme.font.size.sm,
        fontWeight: '500',
        marginRight: 4,
    },
    date: {
        color: theme.colors.text.tertiary,
        fontSize: 10,
        marginTop: 4,
    }
});

export default memo(GridDocCard);
