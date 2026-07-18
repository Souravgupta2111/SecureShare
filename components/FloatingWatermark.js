/**
 * Visible Watermark
 *
 * Two layers:
 *  - WatermarkBackground: a clean, uniform diagonal tiled watermark (standard
 *    DRM style) that covers the whole screen for attribution + camera deterrence.
 *  - FloatingWatermark: a single subtle, slowly drifting attribution line that
 *    also shows the timestamp, so a photo of the screen captures live proof.
 */

import { memo, useEffect, useRef } from 'react';
import { Animated, Dimensions, StyleSheet, Text, View } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const shortTrk = (documentId) => (documentId ? String(documentId).substring(0, 8) : null);

// ---------------------------------------------------------------------------
// Uniform diagonal tiled watermark (the primary visible mark)
// ---------------------------------------------------------------------------
export const WatermarkBackground = memo(function WatermarkBackground({ recipientEmail, documentId }) {
    const label = recipientEmail || 'SecureShare';
    const trk = shortTrk(documentId);
    const line = trk ? `${label}   ·   TRK-${trk}` : label;

    const TILE_W = 230;
    const TILE_H = 96;

    // Oversize the rotated layer so the corners stay covered after rotation.
    const layerW = SCREEN_WIDTH * 1.9;
    const layerH = SCREEN_HEIGHT * 1.9;
    const cols = Math.ceil(layerW / TILE_W);
    const rows = Math.ceil(layerH / TILE_H);

    const items = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const stagger = (r % 2) * (TILE_W / 2); // brick offset for a denser weave
            items.push(
                <Text
                    key={`${r}-${c}`}
                    numberOfLines={1}
                    style={[styles.tileText, { width: TILE_W - 30, left: c * TILE_W + stagger, top: r * TILE_H }]}
                >
                    {line}
                </Text>
            );
        }
    }

    return (
        <View style={styles.tileWrap} pointerEvents="none">
            <View
                style={{
                    position: 'absolute',
                    width: layerW,
                    height: layerH,
                    left: (SCREEN_WIDTH - layerW) / 2,
                    top: (SCREEN_HEIGHT - layerH) / 2,
                    transform: [{ rotate: '-30deg' }],
                }}
            >
                {items}
            </View>
        </View>
    );
});

// ---------------------------------------------------------------------------
// Single subtle drifting attribution line (liveness + timestamp)
// ---------------------------------------------------------------------------
const FloatingWatermark = memo(function FloatingWatermark({ recipientEmail, timestamp, documentId }) {
    const translateY = useRef(new Animated.Value(0)).current;

    const formatTime = () => {
        const d = new Date(timestamp || Date.now());
        return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    };

    const trk = shortTrk(documentId);

    useEffect(() => {
        // Gentle continuous vertical drift so a screenshot always differs slightly.
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(translateY, { toValue: 1, duration: 6000, useNativeDriver: true }),
                Animated.timing(translateY, { toValue: 0, duration: 6000, useNativeDriver: true }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, [translateY]);

    const y = translateY.interpolate({
        inputRange: [0, 1],
        outputRange: [SCREEN_HEIGHT * 0.42, SCREEN_HEIGHT * 0.58],
    });

    return (
        <Animated.View style={[styles.floatWrap, { transform: [{ translateY: y }] }]} pointerEvents="none">
            <View style={styles.floatPill}>
                <Text style={styles.floatText} numberOfLines={1}>
                    {(recipientEmail || 'recipient@email.com')} · {formatTime()}{trk ? ` · TRK-${trk}` : ''}
                </Text>
            </View>
        </Animated.View>
    );
});

const styles = StyleSheet.create({
    tileWrap: {
        ...StyleSheet.absoluteFillObject,
        overflow: 'hidden',
        zIndex: 50,
    },
    tileText: {
        position: 'absolute',
        color: 'rgba(255,255,255,0.09)',
        fontSize: 13,
        fontWeight: '600',
        letterSpacing: 0.4,
        textAlign: 'center',
    },
    floatWrap: {
        position: 'absolute',
        left: 0,
        right: 0,
        alignItems: 'center',
        zIndex: 60,
    },
    floatPill: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
        backgroundColor: 'rgba(0,0,0,0.22)',
        transform: [{ rotate: '-30deg' }],
    },
    floatText: {
        color: 'rgba(255,255,255,0.28)',
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: 0.4,
    },
});

export default FloatingWatermark;
