/**
 * Analytics Event Queue Unit Tests
 */

describe('Analytics Queue', () => {
    describe('queueAnalyticsEvent', () => {
        it('should have queueAnalyticsEvent function', () => {
            const { queueAnalyticsEvent } = require('../utils/analyticsQueue');
            expect(typeof queueAnalyticsEvent).toBe('function');
        });
    });

    describe('queueSecurityEvent', () => {
        it('should have queueSecurityEvent function', () => {
            const { queueSecurityEvent } = require('../utils/analyticsQueue');
            expect(typeof queueSecurityEvent).toBe('function');
        });
    });

    describe('clearQueue', () => {
        it('should have clearQueue function', () => {
            const { clearQueue } = require('../utils/analyticsQueue');
            expect(typeof clearQueue).toBe('function');
        });
    });

    describe('flushQueue', () => {
        it('should have flushQueue function', () => {
            const { flushQueue } = require('../utils/analyticsQueue');
            expect(typeof flushQueue).toBe('function');
        });
    });

    describe('initializeAnalyticsQueue', () => {
        it('should have initializeAnalyticsQueue function', () => {
            const { initializeAnalyticsQueue } = require('../utils/analyticsQueue');
            expect(typeof initializeAnalyticsQueue).toBe('function');
        });
    });
});
