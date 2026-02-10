import React, { useRef, useEffect, memo } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import PropTypes from 'prop-types';
import theme from '../theme';

// Note: For actual gradient text animation of the title "SecureShare", 
// standard React Native Text doesn't support gradients efficiently. 
// A robust way for "Animated Gradient Text" without masked-view is complex.
// The user requirement: "animated gradient text effect — it slowly shifts color between #3d7aff and #6dd5fa in a loop."
// We'll approximate this by animating the color property itself using Animated.loop 
// between the two distinct blue colors (interpolation).

const AnimatedHeader = ({ title, rightIcon, onRightPress, showBack, onBack }) => {
    // Title Animation Logic (Only if title is "SecureShare" or complex? User said title generally)
    // But strictly standard Titles are white. "SecureShare" is special.
    // The user said: "The title must have an animated gradient text effect" for HomeScreen (where title="SecureShare").
    // For other screens, title is white.
    // We can check if title === "SecureShare" to apply special effect.

    const isHomeTitle = title === "SecureShare";
    const colorAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (isHomeTitle) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(colorAnim, {
                        toValue: 1,
                        duration: 3000,
                        useNativeDriver: false, // Color interp isn't native supported everywhere
                    }),
                    Animated.timing(colorAnim, {
                        toValue: 0,
                        duration: 3000,
                        useNativeDriver: false,
                    }),
                ])
            ).start();
        }
    }, [isHomeTitle, colorAnim]);

    const titleColor = colorAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['#3d7aff', '#6dd5fa']
    });

    return (
        <View style={styles.container}>
            <View style={styles.leftContainer}>
                {showBack ? (
                    <Pressable
                        onPress={onBack}
                        hitSlop={10}
                        accessible={true}
                        accessibilityRole="button"
                        accessibilityLabel="Go back"
                    >
                        <Ionicons name="chevron-back" size={24} color={theme.colors.text.secondary} />
                    </Pressable>
                ) : (
                    <View style={{ width: 24 }} />
                )}
            </View>

            {/* Center (Title) */}
            <View style={styles.centerContainer}>
                {isHomeTitle ? (
                    <Animated.Text style={[styles.title, { color: titleColor }]}>
                        {title}
                    </Animated.Text>
                ) : (
                    <Text style={[styles.title, { color: 'white' }]} numberOfLines={1}>
                        {title}
                    </Text>
                )}
            </View>

            {/* Right (Icon or Empty) */}
            <View style={styles.rightContainer}>
                {rightIcon ? (
                    <Pressable
                        onPress={onRightPress}
                        hitSlop={10}
                        accessible={true}
                        accessibilityRole="button"
                    >
                        {rightIcon}
                    </Pressable>
                ) : (
                    <View style={{ width: 24 }} />
                )}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        height: 80,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 36,
        backgroundColor: theme.colors.bg.primary,
    },
    leftContainer: {
        width: 40,
        alignItems: 'flex-start',
    },
    centerContainer: {
        flex: 1,
        alignItems: 'center',
    },
    rightContainer: {
        width: 40,
        alignItems: 'flex-end',
    },
    title: {
        fontSize: 18,
        fontWeight: theme.font.weight.semibold,
        textAlign: 'center',
    },
});

AnimatedHeader.propTypes = {
    title: PropTypes.string.isRequired,
    rightIcon: PropTypes.node,
    onRightPress: PropTypes.func,
    showBack: PropTypes.bool,
    onBack: PropTypes.func
};

AnimatedHeader.defaultProps = {
    showBack: false,
    rightIcon: null,
    onRightPress: null,
    onBack: null
};

AnimatedHeader.displayName = 'AnimatedHeader';

export default memo(AnimatedHeader);
