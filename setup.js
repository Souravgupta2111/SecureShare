/**
 * Jest Setup - Global Mocks for Expo Modules
 */

// Mock environment variables for testing
process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://mock.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'mock-anon-key';

// Mock react-native first
jest.mock('react-native', () => ({
    Platform: { OS: 'android', Version: 34 },
    AppState: {
        addEventListener: jest.fn(() => ({ remove: jest.fn() })),
        removeEventListener: jest.fn(),
    },
    Alert: {
        alert: jest.fn(),
    },
    Linking: {
        openURL: jest.fn(),
    },
}));

// Mock Expo modules
jest.mock('expo-secure-store', () => ({
    getItemAsync: jest.fn(() => Promise.resolve(null)),
    setItemAsync: jest.fn(() => Promise.resolve()),
    deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-constants', () => ({
    expoConfig: { version: '1.0.0' },
}));

jest.mock('expo-file-system', () => ({
    cacheDirectory: 'file://test/cache/',
    documentDirectory: 'file://test/documents/',
    readDirectoryAsync: jest.fn(() => Promise.resolve([])),
    makeDirectoryAsync: jest.fn(),
    getInfoAsync: jest.fn(),
    writeAsStringAsync: jest.fn(),
    readAsStringAsync: jest.fn(),
    deleteAsync: jest.fn(),
}));

jest.mock('expo-clipboard', () => ({
    getStringAsync: jest.fn(() => Promise.resolve('')),
    setString: jest.fn(),
}));

jest.mock('expo-notifications', () => ({
    addNotificationReceivedListener: jest.fn(),
    addNotificationResponseReceivedListener: jest.fn(),
    getInitialNotification: jest.fn(() => Promise.resolve(null)),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
    clear: jest.fn(() => Promise.resolve()),
}));

// Mock react-native-quick-crypto for Jest environment
jest.mock('react-native-quick-crypto', () => ({
    webcrypto: {
        getRandomValues: jest.fn((array) => {
            for (let i = 0; i < array.length; i++) {
                array[i] = i % 256;
            }
            return array;
        }),
        subtle: {
            importKey: jest.fn().mockResolvedValue({ type: 'secret' }),
            sign: jest.fn().mockResolvedValue(new Uint8Array(32)),
            verify: jest.fn().mockResolvedValue(true),
            decrypt: jest.fn().mockResolvedValue(new Uint8Array(10)),
            encrypt: jest.fn().mockResolvedValue(new Uint8Array(10)),
            digest: jest.fn().mockResolvedValue(new Uint8Array(32)),
        },
    },
    RandomBytes: jest.fn(() => 'mock-random-bytes'),
    createHash: jest.fn(() => ({
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockResolvedValue('mock-hash'),
    })),
    createHmac: jest.fn(() => ({
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockResolvedValue('mock-hmac'),
    })),
    pbkdf2: jest.fn().mockResolvedValue(new Uint8Array(32)),
    encrypt: jest.fn().mockResolvedValue('encrypted'),
    decrypt: jest.fn().mockResolvedValue('decrypted'),
}));
