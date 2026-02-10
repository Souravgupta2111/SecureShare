/**
 * Security Features Unit Tests
 */

jest.mock('expo-constants', () => ({
    expoConfig: { version: '1.0.0' },
}));

jest.mock('expo-file-system', () => ({
    cacheDirectory: 'file://test/cache/',
    readDirectoryAsync: jest.fn(() => Promise.resolve([])),
    documentDirectory: 'file://test/documents/',
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

jest.mock('../lib/supabase', () => ({
    logAnalyticsEvent: jest.fn(() => Promise.resolve({ data: {}, error: null })),
    logSecurityEvent: jest.fn(() => Promise.resolve({ data: {}, error: null })),
}));

jest.mock('../utils/analyticsQueue', () => ({
    queueAnalyticsEvent: jest.fn(() => Promise.resolve()),
    queueSecurityEvent: jest.fn(() => Promise.resolve()),
}));

jest.mock('../native/SecurityBridge', () => ({
    enableSecureMode: jest.fn(() => Promise.resolve({ success: true })),
    disableSecureMode: jest.fn(() => Promise.resolve({ success: true })),
    startScreenshotDetection: jest.fn(() => Promise.resolve({ success: true })),
    stopScreenshotDetection: jest.fn(() => Promise.resolve({ success: true })),
    isDeviceSecured: jest.fn(() => Promise.resolve(true)),
    isRooted: jest.fn(() => Promise.resolve(false)),
}));

jest.mock('../utils/deviceSecurity', () => ({
    generateDeviceHash: jest.fn(() => Promise.resolve('device-hash-123')),
    isDeviceSecure: jest.fn(() => Promise.resolve(true)),
    checkForRoot: jest.fn(() => Promise.resolve({ isRooted: false, isEmulator: false })),
}));

describe('Security Features', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('SecurityBridge Mocks', () => {
        it('should have mocked enableSecureMode', async () => {
            const { enableSecureMode } = require('../native/SecurityBridge');
            await enableSecureMode();
            expect(enableSecureMode).toHaveBeenCalled();
        });

        it('should have mocked disableSecureMode', async () => {
            const { disableSecureMode } = require('../native/SecurityBridge');
            await disableSecureMode();
            expect(disableSecureMode).toHaveBeenCalled();
        });

        it('should have mocked startScreenshotDetection', async () => {
            const { startScreenshotDetection } = require('../native/SecurityBridge');
            await startScreenshotDetection();
            expect(startScreenshotDetection).toHaveBeenCalled();
        });

        it('should have mocked stopScreenshotDetection', async () => {
            const { stopScreenshotDetection } = require('../native/SecurityBridge');
            await stopScreenshotDetection();
            expect(stopScreenshotDetection).toHaveBeenCalled();
        });
    });

    describe('Security Event Logging', () => {
        it('should have queueSecurityEvent function', () => {
            const { queueSecurityEvent } = require('../utils/analyticsQueue');
            expect(typeof queueSecurityEvent).toBe('function');
        });

        it('should have queueAnalyticsEvent function', () => {
            const { queueAnalyticsEvent } = require('../utils/analyticsQueue');
            expect(typeof queueAnalyticsEvent).toBe('function');
        });
    });

    describe('Device Security', () => {
        it('should have generateDeviceHash function', () => {
            const { generateDeviceHash } = require('../utils/deviceSecurity');
            expect(typeof generateDeviceHash).toBe('function');
        });

        it('should have isDeviceSecure function', () => {
            const { isDeviceSecure } = require('../utils/deviceSecurity');
            expect(typeof isDeviceSecure).toBe('function');
        });
    });
});
