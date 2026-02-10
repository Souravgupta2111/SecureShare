/**
 * SecureShare Theme System
 * 
 * Google Drive inspired design with dark/light mode support.
 * Uses neutral grays with teal accent for a professional, secure feel.
 */

// Color Palettes
const darkColors = {
    // Backgrounds — Deep, layered dark mode (Google Drive Dark style)
    bg: {
        primary: '#0F0F0F',    // Deepest background (pure black-ish)
        secondary: '#1A1A1A',  // Card background / Modals
        tertiary: '#2A2A2A',   // Hover states / Inputs
        glass: 'rgba(26, 26, 26, 0.85)', // Glassmorphism base
        elevated: '#1F1F1F',   // Elevated surfaces (modals, popovers)
        surface: '#242424',    // Surface color
    },

    // Brand — Teal accent (secure, professional feel)
    accent: {
        primary: '#1A73E8',    // Google Blue
        secondary: '#4285F4',  // Lighter Blue
        teal: '#00BFA5',       // Teal accent
        blue: '#1A73E8',       // Alias for primary
        gradientStart: '#1A73E8',
        gradientEnd: '#0D47A1',
        glow: 'rgba(26, 115, 232, 0.4)',
        surface: 'rgba(26, 115, 232, 0.1)',
    },

    // Text Hierarchy
    text: {
        primary: '#FFFFFF',    // High contrast
        secondary: '#9AA0A6',  // Muted (Google gray)
        tertiary: '#5F6368',   // Date/Metadata
        muted: '#5F6368',      // Alias for tertiary
        inverse: '#202124',    // Dark text for light surfaces
    },

    // Functional Colors
    status: {
        success: '#34A853',    // Google Green
        successBg: 'rgba(52, 168, 83, 0.15)',
        warning: '#FBBC04',    // Google Yellow
        warningBg: 'rgba(251, 188, 4, 0.15)',
        danger: '#EA4335',     // Google Red
        dangerBg: 'rgba(234, 67, 53, 0.15)',
        error: '#EA4335',
        info: '#4285F4',
        active: '#34A853',     // Alias for success
        expired: '#5F6368',
        // Glow colors for status states
        activeGlow: 'rgba(52, 168, 83, 0.2)',
        expiredGlow: 'rgba(95, 99, 104, 0.2)',
        warningGlow: 'rgba(251, 188, 4, 0.2)',
        dangerGlow: 'rgba(234, 67, 53, 0.2)',
    },

    border: {
        subtle: 'rgba(255, 255, 255, 0.06)',
        default: 'rgba(255, 255, 255, 0.12)',
        light: 'rgba(255, 255, 255, 0.08)',
        focus: 'rgba(26, 115, 232, 0.5)',
        focused: 'rgba(26, 115, 232, 0.5)',
    },

    // Tab bar colors
    tabBar: {
        background: '#0F0F0F',
        active: '#1A73E8',
        inactive: '#5F6368',
    }
};

const lightColors = {
    // Backgrounds — Clean white/gray (Google Drive Light style)
    bg: {
        primary: '#FFFFFF',    // Pure white background
        secondary: '#F8F9FA',  // Card background
        tertiary: '#F1F3F4',   // Hover states / Inputs
        glass: 'rgba(255, 255, 255, 0.9)',
        elevated: '#FFFFFF',
        surface: '#E8EAED',
    },

    // Brand — Same accent colors
    accent: {
        primary: '#1A73E8',
        secondary: '#4285F4',
        teal: '#00BFA5',
        blue: '#1A73E8',
        gradientStart: '#1A73E8',
        gradientEnd: '#0D47A1',
        glow: 'rgba(26, 115, 232, 0.3)',
        surface: 'rgba(26, 115, 232, 0.08)',
    },

    // Text Hierarchy
    text: {
        primary: '#202124',    // Near black
        secondary: '#5F6368',  // Gray
        tertiary: '#80868B',   // Lighter gray
        muted: '#80868B',
        inverse: '#FFFFFF',
    },

    // Functional Colors (same as dark)
    status: {
        success: '#34A853',
        successBg: 'rgba(52, 168, 83, 0.12)',
        warning: '#F9AB00',
        warningBg: 'rgba(249, 171, 0, 0.12)',
        danger: '#EA4335',
        dangerBg: 'rgba(234, 67, 53, 0.12)',
        error: '#EA4335',
        info: '#4285F4',
        active: '#34A853',
        expired: '#80868B',
        activeGlow: 'rgba(52, 168, 83, 0.15)',
        expiredGlow: 'rgba(128, 134, 139, 0.15)',
        warningGlow: 'rgba(249, 171, 0, 0.15)',
        dangerGlow: 'rgba(234, 67, 53, 0.15)',
    },

    border: {
        subtle: 'rgba(0, 0, 0, 0.06)',
        default: 'rgba(0, 0, 0, 0.12)',
        light: 'rgba(0, 0, 0, 0.08)',
        focus: 'rgba(26, 115, 232, 0.4)',
        focused: 'rgba(26, 115, 232, 0.4)',
    },

    tabBar: {
        background: '#FFFFFF',
        active: '#1A73E8',
        inactive: '#5F6368',
    }
};

// Shared design tokens (same for both themes)
const sharedTokens = {
    // Typography
    font: {
        size: {
            xs: 11,
            sm: 13,
            base: 15,
            md: 16,
            lg: 18,
            xl: 20,
            xxl: 24,
            xxxl: 32,
            display: 40,
        },
        weight: {
            regular: '400',
            medium: '500',
            semibold: '600',
            bold: '700',
        },
        family: {
            default: undefined, // Uses system font
        }
    },

    spacing: {
        xs: 4,
        sm: 8,
        md: 12,
        base: 16,
        lg: 20,
        xl: 24,
        xxl: 32,
        xxxl: 48,
    },

    radius: {
        xs: 4,
        sm: 8,
        md: 12,
        lg: 16,
        large: 16,
        xl: 24,
        xxl: 32,
        pill: 9999,
        round: 9999,
    },

    layout: {
        radius: {
            sm: 8,
            md: 12,
            lg: 16,
            xl: 24,
            pill: 9999,
        },
        headerHeight: 56,
        tabBarHeight: 64,
        cardHeight: 72,
        maxWidth: 600,
    },

    animation: {
        fast: 150,
        normal: 250,
        slow: 400,
    },
};

// Shadow utilities
const createShadows = (isDark) => ({
    sm: {
        shadowColor: isDark ? '#000' : '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: isDark ? 0.3 : 0.08,
        shadowRadius: 2,
        elevation: 2,
    },
    md: {
        shadowColor: isDark ? '#000' : '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: isDark ? 0.4 : 0.12,
        shadowRadius: 6,
        elevation: 4,
    },
    lg: {
        shadowColor: isDark ? '#000' : '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: isDark ? 0.5 : 0.16,
        shadowRadius: 12,
        elevation: 8,
    },
    card: {
        shadowColor: isDark ? '#000' : '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: isDark ? 0.3 : 0.06,
        shadowRadius: 3,
        elevation: 2,
    },
    glow: (color) => ({
        shadowColor: color || '#1A73E8',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
        elevation: 6,
    }),
});

// Create theme object for a mode
const createTheme = (isDark) => {
    const colors = isDark ? darkColors : lightColors;
    return {
        isDark,
        colors,
        ...sharedTokens,
        shadow: createShadows(isDark),
        effects: {
            glass: {
                backgroundColor: colors.bg.glass,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: isDark ? 0.4 : 0.15,
                shadowRadius: 24,
            },
            shadow: createShadows(isDark),
        }
    };
};

// Export themes
export const darkTheme = createTheme(true);
export const lightTheme = createTheme(false);

// Default export (dark theme for backward compatibility)
export default darkTheme;
