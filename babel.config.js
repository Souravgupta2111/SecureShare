/**
 * Babel configuration for SecureShare
 * 
 * Production optimizations:
 * - Strips console.* statements in production builds
 * - React Compiler enabled via Expo SDK 54
 */
module.exports = function (api) {
    api.cache(true);

    const isProduction = process.env.NODE_ENV === 'production';

    const plugins = [];

    // Strip console logs in production
    if (isProduction) {
        plugins.push(['@babel/plugin-transform-remove-console', {
            exclude: ['error', 'warn'] // Keep console.error and console.warn
        }]);
    }

    return {
        presets: ['babel-preset-expo'],
        plugins
    };
};
