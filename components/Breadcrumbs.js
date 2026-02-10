import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import theme from '../theme';

const Breadcrumbs = ({ path, onNavigate }) => {
    // Path structure: [{ id: 'root', name: 'Home' }, { id: '123', name: 'Projects' }]

    return (
        <View style={styles.container}>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                <Pressable onPress={() => onNavigate(null)} style={styles.item}>
                    <Ionicons name="home" size={16} color={theme.colors.text.secondary} />
                </Pressable>

                {path.map((folder, index) => (
                    <View key={folder.id} style={styles.row}>
                        <Ionicons name="chevron-forward" size={14} color={theme.colors.text.tertiary} />
                        <Pressable
                            onPress={() => onNavigate(folder)}
                            style={styles.item}
                        >
                            <Text style={[
                                styles.text,
                                index === path.length - 1 && styles.activeText
                            ]}>
                                {folder.name}
                            </Text>
                        </Pressable>
                    </View>
                ))}
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        height: 48,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border.subtle,
        backgroundColor: theme.colors.bg.primary,
    },
    scrollContent: {
        alignItems: 'center',
        paddingHorizontal: 16,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    item: {
        paddingHorizontal: 8,
        paddingVertical: 12,
    },
    text: {
        color: theme.colors.text.secondary,
        fontSize: 14,
        fontWeight: '500',
    },
    activeText: {
        color: theme.colors.text.primary,
        fontWeight: '700',
    }
});

export default Breadcrumbs;
