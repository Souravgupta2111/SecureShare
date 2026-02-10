// Core crypto polyfill for Expo SDK 50+
// This must be imported FIRST in the app entry point
// Based on react-native-quick-crypto documentation

import 'react-native-get-random-values';
import { install, subtle, getRandomValues } from 'react-native-quick-crypto';

// Call install() which sets global.crypto = QuickCrypto and global.Buffer
install();

// Patch subtle onto globalThis.crypto for WebCrypto compatibility
// The quick-crypto install() spreads subtle methods but doesn't create .subtle property
if (globalThis.crypto && typeof subtle === 'object') {
    Object.defineProperty(globalThis.crypto, 'subtle', {
        value: subtle,
        writable: false,
        configurable: false,
    });
}

// Verify installation
const hasSubtle = !!globalThis.crypto?.subtle;
const hasGetRandomValues = typeof globalThis.crypto?.getRandomValues === 'function';

console.log(
    '[CryptoBootstrap]',
    'quick-crypto installed:',
    hasSubtle && hasGetRandomValues,
    '| subtle:', hasSubtle,
    '| getRandomValues:', hasGetRandomValues
);

// Hard guard
if (!hasSubtle) {
    console.error(
        'CRITICAL: WebCrypto.subtle not available. Dev client may be misconfigured.'
    );
}
