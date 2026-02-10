import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing, Modal } from 'react-native';
import theme from '../theme';

const SuccessAnimation = ({ filename, onComplete, visible }) => {
    // Animation Values
    const circleScale = useRef(new Animated.Value(0.5)).current;
    const checkArm1 = useRef(new Animated.Value(0)).current; // 0 to 1
    const checkArm2 = useRef(new Animated.Value(0)).current;
    const textOpacity = useRef(new Animated.Value(0)).current;
    const filenameOpacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            // Reset
            circleScale.setValue(0.5);
            checkArm1.setValue(0);
            checkArm2.setValue(0);
            textOpacity.setValue(0);
            filenameOpacity.setValue(0);

            Animated.sequence([
                // 1. Circle Scale In (0ms - 400ms)
                Animated.spring(circleScale, {
                    toValue: 1,
                    friction: 6,
                    useNativeDriver: true,
                }),

                // 2. Checkmark Draw (Concurrent arms)
                Animated.parallel([
                    Animated.timing(checkArm1, {
                        toValue: 1,
                        duration: 300,
                        easing: Easing.out(Easing.ease),
                        useNativeDriver: false, // width/height interpolation often non-native for layout
                    }),
                    Animated.sequence([
                        Animated.delay(200), // Start arm2 slightly after arm1
                        Animated.timing(checkArm2, {
                            toValue: 1,
                            duration: 400,
                            easing: Easing.out(Easing.ease),
                            useNativeDriver: false,
                        })
                    ])
                ]),

                // 3. Text Fade In
                Animated.parallel([
                    Animated.timing(textOpacity, {
                        toValue: 1,
                        duration: 300,
                        useNativeDriver: true,
                    }),
                    Animated.sequence([
                        Animated.delay(200),
                        Animated.timing(filenameOpacity, {
                            toValue: 1,
                            duration: 300,
                            useNativeDriver: true,
                        })
                    ])
                ]),

                // 4. Hold & Complete
                Animated.delay(1000)
            ]).start(({ finished }) => {
                if (finished && onComplete) {
                    onComplete();
                }
            });
        }
    }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

    // Interpolations for checkmark drawing
    // Arm 1 is short leg (rotated 45deg)
    // Arm 2 is long leg
    // We can just mask it or animate width/height.

    if (!visible) return null;

    return (
        <Modal visible={visible} transparent animationType="fade">
            <View style={styles.container}>
                <View style={styles.content}>
                    {/* Circle */}
                    <Animated.View style={[styles.circle, { transform: [{ scale: circleScale }] }]}>
                        {/* Checkmark: Constructed via 2 views. 
                   L shape rotated -45deg. 
                   Arm1 Vertical (short), Arm2 Horizontal (long) relative to unrotated?
                   Actually simpler: rotated container. 
               */}
                        <View style={styles.checkContainer}>
                            {/* Long arm */}
                            <Animated.View style={[
                                styles.checkArmLong,
                                {
                                    height: checkArm2.interpolate({ inputRange: [0, 1], outputRange: [0, 24] })
                                }
                            ]} />
                            {/* Short arm */}
                            <Animated.View style={[
                                styles.checkArmShort,
                                {
                                    width: checkArm1.interpolate({ inputRange: [0, 1], outputRange: [0, 12] })
                                }
                            ]} />
                        </View>
                    </Animated.View>

                    <Animated.Text style={[styles.successText, { opacity: textOpacity }]}>
                        Shared Successfully
                    </Animated.Text>

                    <Animated.Text style={[styles.filenameText, { opacity: filenameOpacity }]}>
                        {filename}
                    </Animated.Text>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.bg.primary, // Full screen override or transparent overlay? User said "Full-screen overlay... Dark background #080a0f"
        justifyContent: 'center',
        alignItems: 'center',
    },
    content: {
        alignItems: 'center',
    },
    circle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        borderWidth: 3,
        borderColor: theme.colors.accent.blue,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
    },
    checkContainer: {
        width: 40,
        height: 40,
        transform: [{ rotate: '-45deg' }],
        marginTop: -5,
        marginLeft: -5,
    },
    checkArmLong: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        width: 3,
        backgroundColor: 'white',
        // height animated
    },
    checkArmShort: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        height: 3,
        backgroundColor: 'white',
        // width animated
    },
    successText: {
        fontSize: 22,
        fontWeight: theme.font.weight.semibold,
        color: 'white',
        marginBottom: 8,
    },
    filenameText: {
        fontSize: 15,
        color: theme.colors.text.muted,
    }
});

export default SuccessAnimation;
