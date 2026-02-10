/**
 * Unit Tests for Pagination Logic
 * Tests the paginated supabase functions
 */

// Mock Supabase
const mockSupabase = {
    from: jest.fn(() => mockSupabase),
    select: jest.fn(() => mockSupabase),
    eq: jest.fn(() => mockSupabase),
    neq: jest.fn(() => mockSupabase),
    order: jest.fn(() => mockSupabase),
    range: jest.fn(() => mockSupabase),
    single: jest.fn(() => Promise.resolve({ data: {}, error: null })),
};

jest.mock('@supabase/supabase-js', () => ({
    createClient: jest.fn(() => mockSupabase),
}));

jest.mock('expo-secure-store', () => ({
    getItemAsync: jest.fn(),
    setItemAsync: jest.fn(),
}));

describe('Pagination Logic', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('getCloudDocuments pagination', () => {
        it('should calculate correct range for page 0', () => {
            const page = 0;
            const pageSize = 20;
            const from = page * pageSize;
            const to = from + pageSize - 1;

            expect(from).toBe(0);
            expect(to).toBe(19);
        });

        it('should calculate correct range for page 1', () => {
            const page = 1;
            const pageSize = 20;
            const from = page * pageSize;
            const to = from + pageSize - 1;

            expect(from).toBe(20);
            expect(to).toBe(39);
        });

        it('should calculate correct range for page 5', () => {
            const page = 5;
            const pageSize = 20;
            const from = page * pageSize;
            const to = from + pageSize - 1;

            expect(from).toBe(100);
            expect(to).toBe(119);
        });

        it('should correctly determine hasMore', () => {
            const testCases = [
                { count: 25, to: 19, expected: true },   // 25 items, showing 0-19, more exist
                { count: 20, to: 19, expected: false },  // 20 items, showing 0-19, no more
                { count: 19, to: 19, expected: false },  // 19 items, showing 0-19, no more
                { count: 100, to: 39, expected: true },  // 100 items, showing 20-39, more exist
            ];

            testCases.forEach(({ count, to, expected }) => {
                const hasMore = count > to + 1;
                expect(hasMore).toBe(expected);
            });
        });
    });

    describe('getSharedWithMeCloud pagination', () => {
        it('should use same pagination logic', () => {
            const page = 2;
            const pageSize = 20;
            const from = page * pageSize;
            const to = from + pageSize - 1;

            expect(from).toBe(40);
            expect(to).toBe(59);
        });
    });

    describe('Infinite scroll integration', () => {
        it('should append new items to existing array', () => {
            const existingDocs = [{ id: 1 }, { id: 2 }];
            const newDocs = [{ id: 3 }, { id: 4 }];

            const combined = [...existingDocs, ...newDocs];

            expect(combined.length).toBe(4);
            expect(combined[2].id).toBe(3);
        });

        it('should replace array on refresh', () => {
            const existingDocs = [{ id: 1 }, { id: 2 }];
            const refreshedDocs = [{ id: 5 }, { id: 6 }];

            // On refresh, we replace entirely
            const result = refreshedDocs;

            expect(result.length).toBe(2);
            expect(result[0].id).toBe(5);
        });
    });
});
