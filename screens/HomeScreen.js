/**
 * HomeScreen - Document List View
 * 
 * Enhanced with Google Drive features:
 * - Category filtering (Starred, Recent, Offline)
 * - Swipeable cards with actions
 * - Floating Action Button (FAB)
 * - Animated interactions
 */

import React, { useCallback, useEffect, useState, useRef, memo, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Animated, AccessibilityInfo, Alert, Pressable, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as storage from '../utils/storage';
import * as Notifications from '../services/NotificationService';
import { getCloudDocuments, deleteCloudDocument, renameCloudDocument } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { scheduleAllExpiryNotifications } from '../utils/expiryNotifications';
import AnimatedHeader from '../components/AnimatedHeader';
import SkeletonLoader from '../components/SkeletonLoader';
import SwipeableDocCard from '../components/SwipeableDocCard';
import GridDocCard from '../components/GridDocCard';
import FilterChips from '../components/FilterChips';
import FloatingActionButton from '../components/FloatingActionButton';
import ScreenContainer from '../components/ScreenContainer';
import DocumentActionSheet from '../components/DocumentActionSheet';
import InputModal from '../components/InputModal';

// AnimatedNumber component - accepts styles as prop
const AnimatedNumber = memo(({ anim, styles }) => {
    const [displayVal, setDisplayVal] = useState(0);

    useEffect(() => {
        const id = anim.addListener(({ value }) => {
            setDisplayVal(Math.floor(value));
        });
        return () => anim.removeListener(id);
    }, [anim]);

    return (
        <Text style={styles.statNumber} accessible accessibilityRole="text">
            {displayVal}
        </Text>
    );
});

// PulseShield component - accepts styles and theme as props
const PulseShield = memo(({ styles, theme }) => {
    const scale = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        const animation = Animated.loop(
            Animated.sequence([
                Animated.timing(scale, { toValue: 1.04, duration: 1500, useNativeDriver: true }),
                Animated.timing(scale, { toValue: 1, duration: 1500, useNativeDriver: true }),
            ])
        );
        animation.start();
        return () => animation.stop();
    }, [scale]);

    return (
        <Animated.View style={[styles.pulseContainer, { transform: [{ scale }] }]}>
            <Ionicons name="shield-outline" size={64} color={theme.colors.accent.primary} />
            <View style={styles.plusOverlay}>
                <Ionicons name="add" size={20} color={theme.colors.bg.primary} />
            </View>
        </Animated.View>
    );
});

const flatListContentStyle = { paddingBottom: 100, paddingTop: 8, paddingHorizontal: 10 };



const HomeScreen = ({ navigation }) => {
    const { user } = useAuth();
    const { theme, isDark } = useTheme();
    const [docs, setDocs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [activeFilter, setActiveFilter] = useState('all');
    const [stats, setStats] = useState({ shared: 0, active: 0, expired: 0 });
    const [filterCounts, setFilterCounts] = useState({});

    // Dynamic styles
    const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);

    // View Mode
    const [viewMode, setViewMode] = useState('list'); // 'list' | 'grid'

    // Selection Mode
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedItems, setSelectedItems] = useState(new Set());

    // Action Sheet & Modals
    const [actionSheetVisible, setActionSheetVisible] = useState(false);
    const [selectedDoc, setSelectedDoc] = useState(null);
    const [renameModalVisible, setRenameModalVisible] = useState(false);

    // Stats animation refs
    const sharedAnim = useRef(new Animated.Value(0)).current;
    const activeAnim = useRef(new Animated.Value(0)).current;
    const expiredAnim = useRef(new Animated.Value(0)).current;

    const loadData = useCallback(async (isRefresh = false) => {
        if (!isRefresh) setLoading(true);

        const start = Date.now();

        // Fetch local and cloud documents in parallel
        let localDocs = [];
        let cloudDocs = [];

        try {
            const [localResult, cloudResult] = await Promise.all([
                storage.getAllDocuments(),
                user ? getCloudDocuments(user.id, 0, 20, 'created_at', false) : { data: [], error: null }
            ]);

            localDocs = localResult || [];

            // Transform cloud documents to match local format
            if (cloudResult.data && !cloudResult.error) {
                cloudDocs = cloudResult.data.map(doc => ({
                    ...doc,
                    uuid: doc.id,
                    isCloud: true,
                    filename: doc.filename,
                    fileType: doc.mime_type?.startsWith('image/') ? 'image' :
                        doc.mime_type === 'application/pdf' ? 'pdf' : 'document',
                    sharedAt: new Date(doc.created_at).getTime(),
                    status: doc.status || 'active'
                }));
            }
        } catch (e) {
            console.error('Error loading documents:', e);
        }

        // Merge and deduplicate documents
        const allDocs = [...localDocs, ...cloudDocs];

        // Check expiry
        const now = Date.now();
        const updatedDocs = allDocs.map(doc => {
            if (doc.status === 'active' && doc.expiresAt < now) {
                storage.updateDocument(doc.uuid, { status: 'expired' });
                return { ...doc, status: 'expired' };
            }
            return doc;
        });

        // Sort by sharedAt desc
        updatedDocs.sort((a, b) => b.sharedAt - a.sharedAt);

        setDocs(updatedDocs);

        // Calculate counts
        const deletedCount = updatedDocs.filter(d => d.status === 'deleted').length; // NEW
        const counts = {
            all: updatedDocs.filter(d => d.status !== 'deleted').length,
            starred: updatedDocs.filter(d => d.isStarred && d.status !== 'deleted').length,
            recent: updatedDocs.filter(d => (now - d.sharedAt) < 24 * 60 * 60 * 1000 && d.status !== 'deleted').length,
            offline: updatedDocs.filter(d => d.isOffline && d.status !== 'deleted').length,
            active: updatedDocs.filter(d => d.status === 'active').length,
            expired: updatedDocs.filter(d => d.status === 'expired').length,
            trash: deletedCount // NEW
        };
        setFilterCounts(counts);

        const newStats = {
            shared: counts.all,
            active: counts.active,
            expired: counts.expired
        };
        setStats(newStats);

        // Min delay for loader
        const elapsed = Date.now() - start;
        if (elapsed < 400 && !isRefresh) {
            await new Promise(r => setTimeout(r, 400 - elapsed));
        }

        setLoading(false);
        setRefreshing(false);

        // Animate stats
        animateStat(sharedAnim, newStats.shared, 0);
        animateStat(activeAnim, newStats.active, 100);
        animateStat(expiredAnim, newStats.expired, 200);

        // Schedule expiry notifications for active documents
        scheduleAllExpiryNotifications(updatedDocs);

    }, [sharedAnim, activeAnim, expiredAnim]);

    const animateStat = useCallback((animVal, toValue, delay) => {
        animVal.setValue(0);
        Animated.sequence([
            Animated.delay(delay),
            Animated.timing(animVal, { toValue, duration: 600, useNativeDriver: false })
        ]).start();
    }, []);

    useFocusEffect(
        useCallback(() => {
            loadData();
            Notifications.clearAllNotifications();
        }, [loadData])
    );

    useEffect(() => {
        Notifications.initializeNotifications();
    }, []);

    const filteredDocs = useMemo(() => {
        switch (activeFilter) {
            case 'starred': return docs.filter(d => d.isStarred && d.status !== 'deleted');
            case 'recent': return docs.filter(d => (Date.now() - d.sharedAt) < 24 * 60 * 60 * 1000 && d.status !== 'deleted');
            case 'offline': return docs.filter(d => d.isOffline && d.status !== 'deleted');
            case 'active': return docs.filter(d => d.status === 'active');
            case 'expired': return docs.filter(d => d.status === 'expired');
            case 'trash': return docs.filter(d => d.status === 'deleted'); // NEW: Trash Filter
            default: return docs.filter(d => d.status !== 'deleted'); // Default: Hide deleted
        }
    }, [docs, activeFilter]);

    // Actions
    const handleStar = useCallback(async (uuid, isStarred) => {
        await storage.toggleStar(uuid, isStarred);
        // Optimistic update
        setDocs(prev => prev.map(d => d.uuid === uuid ? { ...d, isStarred } : d));
        loadData(true);
    }, [loadData]);

    const handleOffline = useCallback(async (uuid, isOffline) => {
        await storage.toggleOffline(uuid, isOffline);
        setDocs(prev => prev.map(d => d.uuid === uuid ? { ...d, isOffline } : d));
        loadData(true);
    }, [loadData]);

    const handleRevoke = useCallback(async (uuid) => {
        Alert.alert("Revoke Access", "Are you sure?", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Revoke", style: "destructive", onPress: async () => {
                    await storage.revokeDocument(uuid);
                    loadData(true);
                }
            }
        ]);
    }, [loadData]);

    const handleDelete = useCallback(async (uuid, permanent = false) => {
        const title = permanent ? "Delete Forever?" : "Move to Bin?";
        const msg = permanent ? "This cannot be undone." : "You can restore this later.";
        const doc = docs.find(d => d.uuid === uuid || d.id === uuid);

        Alert.alert(title, msg, [
            { text: "Cancel", style: "cancel" },
            {
                text: "Delete", style: "destructive", onPress: async () => {
                    try {
                        if (doc?.isCloud) {
                            // Cloud document - use Supabase
                            await deleteCloudDocument(uuid, doc.storage_path);
                        } else if (permanent) {
                            await storage.permanentlyDeleteDocument(uuid);
                        } else {
                            await storage.deleteDocument(uuid); // Soft delete
                        }
                        loadData(true);
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    } catch (e) {
                        console.error('Delete failed:', e);
                        Alert.alert('Error', 'Failed to delete document');
                    }
                }
            }
        ]);
    }, [loadData, docs]);

    const handleRestore = useCallback(async (uuid) => {
        await storage.restoreDocument(uuid);
        loadData(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }, [loadData]);

    const handleDuplicate = useCallback(async (uuid) => {
        try {
            await storage.duplicateDocument(uuid);
            loadData(true);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (e) {
            Alert.alert("Error", "Failed to duplicate document");
        }
    }, [loadData]);

    const handleRename = async (newName) => {
        if (!selectedDoc) return;
        try {
            if (selectedDoc.isCloud) {
                // Cloud document - use Supabase
                await renameCloudDocument(selectedDoc.uuid || selectedDoc.id, newName);
            } else {
                await storage.renameDocument(selectedDoc.uuid, newName);
            }
            setRenameModalVisible(false);
            setSelectedDoc(null);
            loadData(true);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (e) {
            console.error('Rename failed:', e);
            Alert.alert("Error", "Failed to rename document");
        }
    };

    const handleOpenActionSheet = (doc) => {
        setSelectedDoc(doc);
        setActionSheetVisible(true);
        Haptics.selectionAsync();
    };

    const handleSheetAction = (action, doc) => {
        switch (action) {
            case 'rename':
                setRenameModalVisible(true);
                break;
            case 'share':
                navigation.navigate('Share', { document: doc });
                break;
            case 'duplicate':
                handleDuplicate(doc.uuid);
                break;
            case 'star':
                handleStar(doc.uuid, !doc.isStarred);
                break;
            case 'offline':
                handleOffline(doc.uuid, !doc.isOffline);
                break;
            case 'analytics':
                navigation.navigate('Analytics', { documentId: doc.uuid, documentName: doc.filename });
                break;
            case 'access':
                navigation.navigate('AccessControl', { document: doc });
                break;
            case 'details':
                Alert.alert(
                    "Document Details",
                    `Name: ${doc.filename}\nSize: ${(doc.size / 1024 / 1024).toFixed(2)} MB\nCreated: ${new Date(doc.created_at).toLocaleDateString()}\nStatus: ${doc.status}`
                );
                break;
            case 'restore':
                handleRestore(doc.uuid);
                break;
            case 'delete':
                // Check if already in trash
                handleDelete(doc.uuid, doc.status === 'deleted');
                break;
        }
    };

    const toggleSelection = (uuid) => {
        const newSelected = new Set(selectedItems);
        if (newSelected.has(uuid)) {
            newSelected.delete(uuid);
            if (newSelected.size === 0) setIsSelectionMode(false);
        } else {
            newSelected.add(uuid);
        }
        setSelectedItems(newSelected);
    };

    const handleLongPress = (uuid) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setIsSelectionMode(true);
        toggleSelection(uuid);
    };

    const handleBatchDelete = async () => {
        Alert.alert(
            "Delete Selected",
            `Delete ${selectedItems.size} documents?`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        for (const uuid of selectedItems) {
                            await storage.deleteDocument(uuid);
                        }
                        setSelectedItems(new Set());
                        setIsSelectionMode(false);
                        loadData(true);
                    }
                }
            ]
        );
    };

    const handleBatchOffline = async () => {
        for (const uuid of selectedItems) {
            await storage.toggleOffline(uuid, true);
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setSelectedItems(new Set());
        setIsSelectionMode(false);
        loadData(true);
    };

    // NEW: Header Integration
    const settingsIcon = <Ionicons name="settings-outline" size={22} color={theme.colors.text.primary} />;

    const toggleViewIcon = (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 15 }}>
            <Pressable onPress={() => setViewMode(m => m === 'list' ? 'grid' : 'list')}>
                <Ionicons
                    name={viewMode === 'list' ? 'grid-outline' : 'list-outline'}
                    size={22}
                    color={theme.colors.text.primary}
                />
            </Pressable>
            <Pressable onPress={() => navigation.navigate('Settings')}>
                {settingsIcon}
            </Pressable>
        </View>
    );

    const renderItem = useCallback(({ item }) => {
        if (viewMode === 'grid') {
            return (
                <View style={{ flex: 1, maxWidth: '50%' }}>
                    <GridDocCard
                        document={item}
                        onPress={(doc) => navigation.navigate('Detail', { document: doc })}
                        onMorePress={() => handleOpenActionSheet(item)}
                    />
                </View>
            );
        }

        return (
            <SwipeableDocCard
                document={item}
                onPress={(doc) => {
                    if (isSelectionMode) {
                        toggleSelection(doc.uuid);
                    } else {
                        navigation.navigate('Detail', { document: doc });
                    }
                }}
                onMorePress={() => handleOpenActionSheet(item)}
                onLongPress={() => handleLongPress(item.uuid)}
                onStar={handleStar}
                onOffline={handleOffline}
                onRevoke={handleRevoke}
                onDelete={handleDelete}
                isStarred={item.isStarred}
                isOffline={item.isOffline}
                isSelected={selectedItems.has(item.uuid)}
                selectionMode={isSelectionMode}
            />
        );
    }, [navigation, isSelectionMode, selectedItems, handleStar, viewMode]);

    return (
        <ScreenContainer>
            {isSelectionMode ? (
                <View style={styles.selectionHeader}>
                    <Pressable onPress={() => { setIsSelectionMode(false); setSelectedItems(new Set()); }}>
                        <Ionicons name="close" size={24} color="white" />
                    </Pressable>
                    <Text style={styles.selectionTitle}>{selectedItems.size} Selected</Text>
                    <Pressable onPress={() => { setSelectedItems(new Set(filteredDocs.map(d => d.uuid))); }}>
                        <Text style={styles.selectAllText}>All</Text>
                    </Pressable>
                </View>
            ) : (
                <AnimatedHeader
                    title="My Drive"
                    rightIcon={toggleViewIcon}
                    onRightPress={() => { }}
                />
            )}

            {!isSelectionMode && (
                <>
                    {/* Stats Row */}
                    <View style={styles.statsRow}>
                        <View style={styles.statItem}>
                            <AnimatedNumber anim={sharedAnim} styles={styles} />
                            <Text style={styles.statLabel}>Shared</Text>
                        </View>
                        <View style={styles.statDivider} />
                        <View style={styles.statItem}>
                            <AnimatedNumber anim={activeAnim} styles={styles} />
                            <Text style={styles.statLabel}>Active</Text>
                        </View>
                        <View style={styles.statDivider} />
                        <View style={styles.statItem}>
                            <AnimatedNumber anim={expiredAnim} styles={styles} />
                            <Text style={styles.statLabel}>Expired</Text>
                        </View>
                    </View>

                    {/* Filters */}
                    <View style={styles.filterContainer}>
                        <FilterChips
                            activeFilter={activeFilter}
                            onFilterChange={setActiveFilter}
                            counts={filterCounts}
                        />
                    </View>
                </>
            )}

            <DocumentActionSheet
                visible={actionSheetVisible}
                document={selectedDoc}
                onClose={() => setActionSheetVisible(false)}
                onAction={handleSheetAction}
            />

            <InputModal
                visible={renameModalVisible}
                title="Rename Document"
                initialValue={selectedDoc?.filename}
                placeholder="Enter new name"
                onClose={() => setRenameModalVisible(false)}
                onSubmit={handleRename}
            />

            {loading ? (
                <SkeletonLoader />
            ) : (
                <FlatList
                    key={viewMode} // Force re-render on toggle
                    data={filteredDocs}
                    keyExtractor={item => item.uuid}
                    renderItem={renderItem}
                    numColumns={viewMode === 'grid' ? 2 : 1}
                    contentContainerStyle={flatListContentStyle}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} tintColor={theme.colors.accent.primary} />
                    }
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <PulseShield styles={styles} theme={theme} />
                            <Text style={styles.emptyTitle}>Nothing here yet</Text>
                            <Text style={styles.emptySubtitle}>
                                {activeFilter === 'all'
                                    ? 'Tap + to share your first document'
                                    : `No ${activeFilter} documents found`}
                            </Text>
                        </View>
                    }
                />
            )}

            {/* Bottom Selection Bar */}
            {isSelectionMode && (
                <View style={styles.bottomSelectionBar}>
                    <Pressable style={styles.actionBarItem} onPress={handleBatchOffline}>
                        <Ionicons name="cloud-download-outline" size={24} color="white" />
                        <Text style={styles.actionBarText}>Make Offline</Text>
                    </Pressable>
                    <Pressable style={styles.actionBarItem} onPress={handleBatchDelete}>
                        <Ionicons name="trash-outline" size={24} color={theme.colors.status.danger} />
                        <Text style={[styles.actionBarText, { color: theme.colors.status.danger }]}>Delete</Text>
                    </Pressable>
                </View>
            )}

            <FloatingActionButton
                navigation={navigation}
                onUpload={() => navigation.navigate('Share')}
                onScan={() => navigation.navigate('Share')}
            />
        </ScreenContainer>
    );
};

const createStyles = (theme, isDark) => StyleSheet.create({
    statsRow: {
        flexDirection: 'row',
        backgroundColor: theme.colors.bg.secondary,
        marginHorizontal: 16,
        marginTop: 16,
        marginBottom: 12,
        paddingVertical: 16,
        borderRadius: 16,
        ...theme.effects.shadow.md,
    },
    statItem: {
        flex: 1,
        alignItems: 'center',
    },
    statDivider: {
        width: 1,
        backgroundColor: theme.colors.border.subtle,
        height: '60%',
        alignSelf: 'center',
    },
    statNumber: {
        fontSize: 20,
        fontWeight: '700',
        color: theme.colors.text.primary,
        marginBottom: 4,
    },
    statLabel: {
        fontSize: 11,
        color: theme.colors.text.secondary,
        fontWeight: '500',
    },
    filterContainer: {
        height: 50,
        marginBottom: 8,
        paddingHorizontal: 8,
    },
    emptyContainer: {
        alignItems: 'center',
        paddingTop: 80,
    },
    emptyTitle: {
        color: theme.colors.text.primary,
        fontSize: 18,
        fontWeight: '600',
        marginTop: 16,
    },
    emptySubtitle: {
        color: theme.colors.text.secondary,
        marginTop: 8,
    },
    pulseContainer: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    plusOverlay: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        backgroundColor: theme.colors.accent.primary,
        borderRadius: 10,
        width: 20,
        height: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    selectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 60,
        paddingBottom: 16,
        backgroundColor: theme.colors.bg.secondary,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border.subtle,
    },
    selectionTitle: {
        color: theme.colors.text.primary,
        fontSize: 18,
        fontWeight: 'bold',
    },
    selectAllText: {
        color: theme.colors.accent.primary,
        fontWeight: '600',
    },
    bottomSelectionBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        backgroundColor: theme.colors.bg.secondary,
        paddingVertical: 16,
        paddingBottom: 30,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border.subtle,
        justifyContent: 'space-around',
    },
    actionBarItem: {
        alignItems: 'center',
        gap: 4,
    },
    actionBarText: {
        color: theme.colors.text.primary,
        fontSize: 12,
    },
});

export default memo(HomeScreen);

