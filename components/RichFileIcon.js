import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

const RichFileIcon = ({ type, size = 48, mimeType }) => {
    // Determine icon type logic
    const getIcon = () => {
        if (type === 'folder') {
            return {
                bg: '#374151', // Slate gray folder
                accent: '#9CA3AF',
                icon: 'folder',
                lib: Ionicons,
                color: '#60A5FA' // Blue tint
            };
        }

        if (mimeType?.includes('pdf')) {
            return {
                bg: 'rgba(239, 68, 68, 0.1)',
                accent: '#EF4444',
                icon: 'file-pdf-box',
                lib: MaterialCommunityIcons,
                color: '#EF4444'
            };
        }

        if (mimeType?.includes('image')) {
            return {
                bg: 'rgba(59, 130, 246, 0.1)',
                accent: '#3B82F6',
                icon: 'image',
                lib: Ionicons,
                color: '#3B82F6'
            };
        }

        // Default Doc
        return {
            bg: 'rgba(16, 185, 129, 0.1)',
            accent: '#10B981',
            icon: 'document-text',
            lib: Ionicons,
            color: '#10B981'
        };
    };

    const config = getIcon();
    const IconLib = config.lib;

    return (
        <View style={[styles.container, { width: size, height: size }]}>
            {/* Folder Shape or Document Shape */}
            {type === 'folder' ? (
                <IconLib name={config.icon} size={size} color={config.color} />
            ) : (
                <View style={[styles.docBase, { backgroundColor: config.bg, borderColor: config.accent }]}>
                    <IconLib name={config.icon} size={size * 0.6} color={config.color} />
                    {/* Folded Corner Effect */}
                    <View style={[styles.corner, { borderBottomColor: config.accent }]} />
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    docBase: {
        width: '80%',
        height: '100%',
        borderRadius: 4,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderStyle: 'solid',
        position: 'relative',
        overflow: 'hidden',
    },
    corner: {
        position: 'absolute',
        top: 0,
        right: 0,
        width: 0,
        height: 0,
        borderStyle: 'solid',
        borderRightWidth: 12,
        borderBottomWidth: 12,
        borderRightColor: 'transparent', // Transparent top right
        backgroundColor: 'transparent',
        opacity: 0.5,
    }
});

export default RichFileIcon;
