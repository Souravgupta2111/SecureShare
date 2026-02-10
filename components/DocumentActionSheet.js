import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    Modal,
    TouchableWithoutFeedback,
    Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import theme from '../theme';

const ActionItem = ({ icon, label, onPress, color = 'white', danger = false }) => (
    <Pressable
        style={({ pressed }) => [
            styles.actionItem,
            pressed && styles.actionPressed
        ]}
        onPress={onPress}
    >
        <View style={[styles.iconContainer, danger && styles.dangerIconContainer]}>
            <Ionicons
                name={icon}
                size={22}
                color={danger ? theme.colors.status.danger : color}
            />
        </View>
        <Text style={[styles.actionLabel, danger && styles.dangerLabel]}>{label}</Text>
    </Pressable>
);

const DocumentActionSheet = ({ visible, onClose, document, onAction }) => {
    if (!document) return null;

    const handleAction = (action) => {
        onClose();
        // Small delay to allow modal to close before triggering action
        setTimeout(() => {
            onAction(action, document);
        }, 100);
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
            statusBarTranslucent
        >
            <TouchableWithoutFeedback onPress={onClose}>
                <View style={styles.overlay}>
                    <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
                        <View style={styles.sheetContainer}>
                            {Platform.OS === 'ios' ? (
                                <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />
                            ) : (
                                <View style={[StyleSheet.absoluteFillObject, { backgroundColor: theme.colors.bg.secondary }]} />
                            )}

                            {/* Header */}
                            <View style={styles.header}>
                                <View style={styles.handle} />
                                <Text style={styles.title} numberOfLines={1}>
                                    {document.name || document.filename}
                                </Text>
                                <Text style={styles.subtitle}>
                                    {(document.size / 1024 / 1024).toFixed(1)} MB • {new Date(document.created_at || Date.now()).toLocaleDateString()}
                                </Text>
                            </View>

                            {/* Actions Grid */}
                            <View style={styles.grid}>
                                {document.status === 'deleted' ? (
                                    <>
                                        <ActionItem
                                            icon="refresh-outline"
                                            label="Restore"
                                            onPress={() => handleAction('restore')}
                                            color={theme.colors.status.success}
                                        />
                                        <ActionItem
                                            icon="information-circle-outline"
                                            label="Details"
                                            onPress={() => handleAction('details')}
                                        />
                                    </>
                                ) : (
                                    <>
                                        <ActionItem
                                            icon="pencil"
                                            label="Rename"
                                            onPress={() => handleAction('rename')}
                                        />
                                        <ActionItem
                                            icon="copy-outline"
                                            label="Duplicate"
                                            onPress={() => handleAction('duplicate')}
                                        />
                                        <ActionItem
                                            icon="share-outline"
                                            label="Share"
                                            onPress={() => handleAction('share')}
                                        />
                                        <ActionItem
                                            icon={document.isStarred ? "star" : "star-outline"}
                                            label={document.isStarred ? "Unstar" : "Star"}
                                            color={document.isStarred ? theme.colors.accent.warning : 'white'}
                                            onPress={() => handleAction('star')}
                                        />
                                        <ActionItem
                                            icon={document.isOffline ? "cloud-done" : "cloud-download-outline"}
                                            label={document.isOffline ? "Remove" : "Offline"}
                                            color={document.isOffline ? theme.colors.status.success : 'white'}
                                            onPress={() => handleAction('offline')}
                                        />
                                        <ActionItem
                                            icon="information-circle-outline"
                                            label="Details"
                                            onPress={() => handleAction('details')}
                                        />
                                        <ActionItem
                                            icon="analytics-outline"
                                            label="Analytics"
                                            onPress={() => handleAction('analytics')}
                                        />
                                        <ActionItem
                                            icon="lock-closed-outline"
                                            label="Access"
                                            onPress={() => handleAction('access')}
                                        />
                                    </>
                                )}
                            </View>

                            <View style={styles.divider} />

                            <View style={styles.dangerZone}>
                                <ActionItem
                                    icon="trash-outline"
                                    label={document.status === 'deleted' ? "Delete Forever" : "Move to Bin"}
                                    danger
                                    onPress={() => handleAction('delete')}
                                />
                            </View>
                        </View>
                    </TouchableWithoutFeedback>
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    sheetContainer: {
        backgroundColor: Platform.OS === 'android' ? theme.colors.bg.secondary : theme.colors.effects.glass.backgroundColor,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingBottom: 40,
        overflow: 'hidden',
        borderTopWidth: 1,
        borderColor: theme.colors.border.subtle,
    },
    handle: {
        width: 40,
        height: 4,
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 2,
        marginBottom: 16,
        alignSelf: 'center',
    },
    header: {
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 24,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border.subtle,
    },
    title: {
        color: 'white',
        fontSize: 18,
        fontWeight: '600',
        marginBottom: 4,
        textAlign: 'center',
    },
    subtitle: {
        color: theme.colors.text.tertiary,
        fontSize: 13,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        padding: 16,
    },
    actionItem: {
        width: '33.33%',
        alignItems: 'center',
        paddingVertical: 16,
        gap: 8,
    },
    actionPressed: {
        opacity: 0.7,
    },
    iconContainer: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: theme.colors.bg.tertiary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dangerIconContainer: {
        backgroundColor: theme.colors.status.dangerBg,
    },
    actionLabel: {
        color: theme.colors.text.primary,
        fontSize: 13,
        fontWeight: '500',
    },
    dangerLabel: {
        color: theme.colors.status.danger,
    },
    divider: {
        height: 1,
        backgroundColor: theme.colors.border.subtle,
        marginHorizontal: 20,
    },
    dangerZone: {
        flexDirection: 'row',
        justifyContent: 'center',
        paddingVertical: 8,
    }
});

export default DocumentActionSheet;
