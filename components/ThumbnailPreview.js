/**
 * ThumbnailPreview Component
 * 
 * Displays document thumbnail for images or file type icon for documents.
 */

import React, { useState, memo } from 'react';
import {
    View,
    Image,
    StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import theme from '../theme';

const FILE_TYPE_ICONS = {
    'application/pdf': { icon: 'document-text', color: '#FF5733' },
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { icon: 'document', color: '#2B579A' },
    'text/plain': { icon: 'document-outline', color: '#6B7280' },
    'image/jpeg': { icon: 'image', color: '#10B981' },
    'image/png': { icon: 'image', color: '#10B981' },
    'image/gif': { icon: 'image', color: '#8B5CF6' },
    'default': { icon: 'document', color: theme.colors.accent.blue },
};

const ThumbnailPreview = memo(({
    mimeType,
    thumbnailUri,
    size = 44,
    borderRadius = 8,
}) => {
    const [imageError, setImageError] = useState(false);
    const isImage = mimeType?.startsWith('image/');
    const showThumbnail = isImage && thumbnailUri && !imageError;

    const fileType = FILE_TYPE_ICONS[mimeType] || FILE_TYPE_ICONS.default;

    if (showThumbnail) {
        return (
            <View style={[styles.container, { width: size, height: size, borderRadius }]}>
                <Image
                    source={{ uri: thumbnailUri }}
                    style={[styles.image, { borderRadius }]}
                    onError={() => setImageError(true)}
                    resizeMode="cover"
                />
            </View>
        );
    }

    return (
        <View
            style={[
                styles.container,
                styles.iconContainer,
                {
                    width: size,
                    height: size,
                    borderRadius,
                    backgroundColor: fileType.color + '20',
                }
            ]}
        >
            <Ionicons
                name={fileType.icon}
                size={size * 0.5}
                color={fileType.color}
            />
        </View>
    );
});

const styles = StyleSheet.create({
    container: {
        overflow: 'hidden',
    },
    image: {
        width: '100%',
        height: '100%',
    },
    iconContainer: {
        alignItems: 'center',
        justifyContent: 'center',
    },
});

ThumbnailPreview.displayName = 'ThumbnailPreview';

export default ThumbnailPreview;
