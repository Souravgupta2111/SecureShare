/**
 * React Native + Expo Type Declarations
 * 
 * These declarations allow TypeScript to compile without errors
 * even when node_modules are not installed locally.
 * When node_modules ARE installed, the real type packages take precedence.
 */

// --- React Native Globals ---

declare var global: typeof globalThis & {
    atob: (input: string) => string;
    btoa: (input: string) => string;
    crypto: Crypto;
};

// --- Third-party Module Declarations ---

declare module 'node-forge' {
    const forge: any;
    export default forge;
    export const pki: any;
    export const md: any;
    export const util: any;
    export const asn1: any;
}

declare module 'expo-secure-store' {
    export function getItemAsync(key: string): Promise<string | null>;
    export function setItemAsync(key: string, value: string): Promise<void>;
    export function deleteItemAsync(key: string): Promise<void>;
}

declare module 'expo-file-system/legacy' {
    export const cacheDirectory: string | null;
    export const documentDirectory: string | null;
    export function getInfoAsync(uri: string): Promise<{ exists: boolean; size?: number; isDirectory?: boolean }>;
    export function readAsStringAsync(uri: string, options?: any): Promise<string>;
    export function writeAsStringAsync(uri: string, contents: string, options?: any): Promise<void>;
    export function deleteAsync(uri: string, options?: { idempotent?: boolean }): Promise<void>;
    export function makeDirectoryAsync(uri: string, options?: { intermediates?: boolean }): Promise<void>;
}

declare module '@react-native-async-storage/async-storage' {
    const AsyncStorage: {
        getItem(key: string): Promise<string | null>;
        setItem(key: string, value: string): Promise<void>;
        removeItem(key: string): Promise<void>;
    };
    export default AsyncStorage;
}

declare module '@supabase/supabase-js' {
    export function createClient(url: string, key: string, options?: any): any;
}

declare module 'react-native' {
    export const Platform: { OS: string; select: (options: any) => any };
    export const AppState: { addEventListener: (type: string, handler: (state: string) => void) => any };
    export const Alert: { alert: (...args: any[]) => void };
    export const Dimensions: { get: (dim: string) => { width: number; height: number } };
    export class View extends React.Component<any> {}
    export class Text extends React.Component<any> {}
    export class TextInput extends React.Component<any> {}
    export class ScrollView extends React.Component<any> {}
    export class FlatList extends React.Component<any> {}
    export class ActivityIndicator extends React.Component<any> {}
    export class Pressable extends React.Component<any> {}
    export class StyleSheet {
        static create(styles: any): any;
    }
}
