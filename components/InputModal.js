import React, { useState, useEffect } from 'react';
import {
    Modal,
    View,
    Text,
    TextInput,
    StyleSheet,
    Pressable,
    KeyboardAvoidingView,
    Platform,
    TouchableWithoutFeedback,
} from 'react-native';
import theme from '../theme';
import { Ionicons } from '@expo/vector-icons';

const InputModal = ({ visible, title, initialValue, onClose, onSubmit, placeholder }) => {
    const [value, setValue] = useState('');

    useEffect(() => {
        if (visible) {
            setValue(initialValue || '');
        }
    }, [visible, initialValue]);

    const handleSubmit = () => {
        if (value.trim()) {
            onSubmit(value.trim());
            setValue('');
        }
    };

    if (!visible) return null;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <TouchableWithoutFeedback onPress={onClose}>
                <View style={styles.overlay}>
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        style={styles.keyboardView}
                    >
                        <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
                            <View style={styles.modalContainer}>
                                <View style={styles.header}>
                                    <Text style={styles.title}>{title}</Text>
                                    <Pressable onPress={onClose}>
                                        <Ionicons name="close" size={24} color={theme.colors.text.muted} />
                                    </Pressable>
                                </View>

                                <TextInput
                                    style={styles.input}
                                    value={value}
                                    onChangeText={setValue}
                                    placeholder={placeholder}
                                    placeholderTextColor={theme.colors.text.muted}
                                    autoFocus
                                    selectTextOnFocus
                                    onSubmitEditing={handleSubmit}
                                    returnKeyType="done"
                                />

                                <View style={styles.actions}>
                                    <Pressable style={styles.cancelBtn} onPress={onClose}>
                                        <Text style={styles.cancelText}>Cancel</Text>
                                    </Pressable>
                                    <Pressable style={styles.submitBtn} onPress={handleSubmit}>
                                        <Text style={styles.submitText}>Save</Text>
                                    </Pressable>
                                </View>
                            </View>
                        </TouchableWithoutFeedback>
                    </KeyboardAvoidingView>
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    keyboardView: {
        width: '100%',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    modalContainer: {
        width: '100%',
        maxWidth: 340,
        backgroundColor: theme.colors.bg.secondary,
        borderRadius: 16,
        padding: 20,
        borderWidth: 1,
        borderColor: theme.colors.border.subtle,
        ...theme.effects.shadow.md,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    title: {
        fontSize: 18,
        fontWeight: '600',
        color: 'white',
    },
    input: {
        backgroundColor: theme.colors.bg.tertiary,
        borderRadius: 8,
        padding: 12,
        color: 'white',
        fontSize: 16,
        borderWidth: 1,
        borderColor: theme.colors.border.subtle,
        marginBottom: 24,
    },
    actions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 12,
    },
    cancelBtn: {
        paddingVertical: 10,
        paddingHorizontal: 16,
    },
    cancelText: {
        color: theme.colors.text.secondary,
        fontSize: 16,
        fontWeight: '500',
    },
    submitBtn: {
        backgroundColor: theme.colors.accent.primary,
        borderRadius: 8,
        paddingVertical: 10,
        paddingHorizontal: 20,
    },
    submitText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '600',
    },
});

export default InputModal;
