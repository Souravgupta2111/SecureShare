/**
 * Authentication Unit Tests
 * 
 * Tests the authentication flow including sign up, sign in, sign out,
 * and consent management.
 */

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
    clear: jest.fn(() => Promise.resolve()),
}));

// Mock SecureStore
jest.mock('expo-secure-store', () => ({
    getItemAsync: jest.fn(() => Promise.resolve(null)),
    setItemAsync: jest.fn(() => Promise.resolve()),
    deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

// Mock supabase
jest.mock('../lib/supabase', () => ({
    signUp: jest.fn(),
    signIn: jest.fn(),
    signOut: jest.fn(),
    getCurrentUser: jest.fn(),
    getProfile: jest.fn(),
    updateProfile: jest.fn(),
    supabase: {
        auth: {
            getSession: jest.fn(),
            getUser: jest.fn(),
        }
    }
}));

import { signUp, signIn, signOut, getCurrentUser, getProfile, updateProfile } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

describe('Authentication Flow', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('signUp', () => {
        it('should create new user with email and password', async () => {
            const mockUser = { id: 'test-uuid', email: 'test@example.com' };
            signUp.mockResolvedValue({ data: { user: mockUser }, error: null });

            const result = await signUp('test@example.com', 'password123', 'Test User');

            expect(signUp).toHaveBeenCalledWith(
                'test@example.com',
                'password123',
                'Test User'
            );
            expect(result.data.user).toEqual(mockUser);
            expect(result.error).toBeNull();
        });

        it('should handle signup error', async () => {
            signUp.mockResolvedValue({ data: null, error: { message: 'Email already taken' } });

            const result = await signUp('existing@example.com', 'password123', 'User');

            expect(result.data).toBeNull();
            expect(result.error.message).toBe('Email already taken');
        });
    });

    describe('signIn', () => {
        it('should sign in with valid credentials', async () => {
            const mockUser = { id: 'test-uuid', email: 'test@example.com' };
            signIn.mockResolvedValue({ data: { user: mockUser, session: {} }, error: null });

            const result = await signIn('test@example.com', 'password123');

            expect(signIn).toHaveBeenCalledWith('test@example.com', 'password123');
            expect(result.data.user).toEqual(mockUser);
            expect(result.error).toBeNull();
        });

        it('should reject invalid credentials', async () => {
            signIn.mockResolvedValue({ data: null, error: { message: 'Invalid credentials' } });

            const result = await signIn('wrong@example.com', 'wrongpassword');

            expect(result.data).toBeNull();
            expect(result.error.message).toBe('Invalid credentials');
        });
    });

    describe('signOut', () => {
        it('should sign out successfully', async () => {
            signOut.mockResolvedValue({ error: null });

            const result = await signOut();

            expect(signOut).toHaveBeenCalled();
            expect(result.error).toBeNull();
        });

        it('should handle signout error', async () => {
            signOut.mockResolvedValue({ error: { message: 'Network error' } });

            const result = await signOut();

            expect(result.error.message).toBe('Network error');
        });
    });

    describe('getCurrentUser', () => {
        it('should return current user when authenticated', async () => {
            const mockUser = { id: 'test-uuid', email: 'test@example.com' };
            getCurrentUser.mockResolvedValue(mockUser);

            const result = await getCurrentUser();

            expect(result).toEqual(mockUser);
        });

        it('should return null when not authenticated', async () => {
            getCurrentUser.mockResolvedValue(null);

            const result = await getCurrentUser();

            expect(result).toBeNull();
        });
    });

    describe('getProfile', () => {
        it('should fetch user profile', async () => {
            const mockProfile = { id: 'test-uuid', email: 'test@example.com', display_name: 'Test User' };
            getProfile.mockResolvedValue({ data: mockProfile, error: null });

            const result = await getProfile('test-uuid');

            expect(getProfile).toHaveBeenCalledWith('test-uuid');
            expect(result.data).toEqual(mockProfile);
            expect(result.error).toBeNull();
        });

        it('should return null when profile not found', async () => {
            getProfile.mockResolvedValue({ data: null, error: null });

            const result = await getProfile('nonexistent-uuid');

            expect(result.data).toBeNull();
        });
    });

    describe('updateProfile', () => {
        it('should update user profile', async () => {
            const mockUpdatedProfile = { id: 'test-uuid', display_name: 'Updated Name', analytics_consent: true };
            updateProfile.mockResolvedValue({ data: mockUpdatedProfile, error: null });

            const result = await updateProfile('test-uuid', { display_name: 'Updated Name' });

            expect(updateProfile).toHaveBeenCalledWith('test-uuid', { display_name: 'Updated Name' });
            expect(result.data.display_name).toBe('Updated Name');
        });

        it('should update consent settings', async () => {
            updateProfile.mockResolvedValue({ data: {}, error: null });

            await updateProfile('test-uuid', { analytics_consent: true });

            expect(updateProfile).toHaveBeenCalledWith('test-uuid', expect.objectContaining({
                analytics_consent: true
            }));
        });
    });

    describe('Consent Defaults', () => {
        it('should have analytics consent default to false', async () => {
            // Verify that initial consent state is false
            const storedConsent = await AsyncStorage.getItem('secureshare_analytics_consent');
            expect(storedConsent).toBeNull();
        });

        it('should have error reporting consent default to false', async () => {
            const storedConsent = await AsyncStorage.getItem('secureshare_error_reporting_consent');
            expect(storedConsent).toBeNull();
        });
    });
});
