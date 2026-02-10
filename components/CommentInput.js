/**
 * CommentInput Component
 * 
 * Text input for adding comments to documents.
 */

import React, { useState } from 'react';
import {
    View,
    TextInput,
    StyleSheet,
    Pressable,
    ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import theme from '../theme';

const CommentInput = ({ onSubmit, loading = false, placeholder = 'Add a comment...' }) => {
    const [text, setText] = useState('');

    const handleSubmit = () => {
        if (!text.trim() || loading) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onSubmit?.(text.trim());
        setText('');
    };

    const canSubmit = text.trim().length > 0 && !loading;

    return (
        <View style={styles.container}>
            <TextInput
                style={styles.input}
                value={text}
                onChangeText={setText}
                placeholder={placeholder}
                placeholderTextColor={theme.colors.text.muted}
                multiline
                maxLength={500}
                editable={!loading}
            />
            <Pressable
                onPress={handleSubmit}
                disabled={!canSubmit}
                style={[styles.button, canSubmit && styles.buttonActive]}
            >
                {loading ? (
                    <ActivityIndicator size="small" color="white" />
                ) : (
                    <Ionicons
                        name="send"
                        size={18}
                        color={canSubmit ? 'white' : theme.colors.text.muted}
                    />
                )}
            </Pressable>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        backgroundColor: theme.colors.bg.secondary,
        borderRadius: 20,
        paddingLeft: 16,
        paddingRight: 6,
        paddingVertical: 6,
        borderWidth: 1,
        borderColor: theme.colors.border.light,
    },
    input: {
        flex: 1,
        color: 'white',
        fontSize: 15,
        maxHeight: 100,
        paddingVertical: 8,
    },
    button: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: theme.colors.bg.tertiary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonActive: {
        backgroundColor: theme.colors.accent.blue,
    },
});

export default CommentInput;
