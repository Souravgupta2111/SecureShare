/**
 * StatusBadge Component
 * Displays document status with appropriate styling
 */

import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import PropTypes from 'prop-types';
import theme from '../theme';

const StatusBadge = ({ status }) => {
    let bgColor = theme.colors.status.activeGlow;
    let textColor = theme.colors.status.active;
    let label = 'Active';
    let showDot = true;

    if (status === 'expiring_soon') {
        bgColor = theme.colors.status.warningGlow;
        textColor = theme.colors.status.warning;
        label = 'Expires Soon';
        showDot = true;
    } else if (status === 'expired') {
        bgColor = theme.colors.status.expiredGlow;
        textColor = theme.colors.status.expired;
        label = 'Expired';
        showDot = false;
    } else if (status === 'revoked') {
        bgColor = theme.colors.status.dangerGlow;
        textColor = theme.colors.status.danger;
        label = 'Revoked';
        showDot = false;
    }

    return (
        <View
            style={[styles.badge, { backgroundColor: bgColor }]}
            accessible={true}
            accessibilityRole="text"
            accessibilityLabel={`Document status: ${label}`}
        >
            {showDot && (
                <View
                    style={[styles.dot, { backgroundColor: textColor }]}
                    accessibilityElementsHidden={true}
                />
            )}
            <Text style={[styles.text, { color: textColor }]}>{label}</Text>
        </View>
    );
};

StatusBadge.propTypes = {
    status: PropTypes.oneOf(['active', 'expiring_soon', 'expired', 'revoked']).isRequired
};

const styles = StyleSheet.create({
    badge: {
        borderRadius: 100,
        paddingVertical: 4,
        paddingHorizontal: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    text: {
        fontSize: 12,
        fontWeight: theme.font.weight.semibold,
    },
});

// Memoize to prevent unnecessary re-renders
export default memo(StatusBadge);
