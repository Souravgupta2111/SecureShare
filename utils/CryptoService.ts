/**
 * CryptoService — Centralized private key management + key rotation (TypeScript)
 * 
 * Single source of truth for:
 *   - Reading RSA private key from SecureStore (chunked + legacy)
 *   - Decrypting document AES keys
 *   - Key rotation (re-encrypting all owned document keys with new RSA pair)
 */

import * as SecureStore from 'expo-secure-store';
import { importPrivateKey, decryptKey, generateKeyPair, exportPublicKey, exportPrivateKey, importPublicKey, encryptKey } from './crypto';
// @ts-ignore — supabase is JS
import { supabase, updateProfile } from '../lib/supabase';

const PRIVATE_KEY_STORAGE_KEY = 'secureshare_private_key';

// ============================================================================
// PRIVATE KEY ACCESS
// ============================================================================

/**
 * Retrieve the user's RSA private key PEM from SecureStore.
 * Handles both 2-chunk storage and legacy single-key format.
 */
export const getPrivateKeyPem = async (): Promise<string | null> => {
    const part0 = await SecureStore.getItemAsync(`${PRIVATE_KEY_STORAGE_KEY}_0`);
    const part1 = await SecureStore.getItemAsync(`${PRIVATE_KEY_STORAGE_KEY}_1`);

    if (part0 && part1) {
        return part0 + part1;
    }

    const legacyKey = await SecureStore.getItemAsync(PRIVATE_KEY_STORAGE_KEY);
    return legacyKey || null;
};

/**
 * Store a private key PEM in SecureStore using 2-chunk format.
 */
const storePrivateKeyPem = async (pem: string): Promise<void> => {
    const mid = Math.ceil(pem.length / 2);
    const chunk0 = pem.substring(0, mid);
    const chunk1 = pem.substring(mid);

    await SecureStore.setItemAsync(`${PRIVATE_KEY_STORAGE_KEY}_0`, chunk0);
    await SecureStore.setItemAsync(`${PRIVATE_KEY_STORAGE_KEY}_1`, chunk1);

    // Verify write-back
    const verify0 = await SecureStore.getItemAsync(`${PRIVATE_KEY_STORAGE_KEY}_0`);
    const verify1 = await SecureStore.getItemAsync(`${PRIVATE_KEY_STORAGE_KEY}_1`);
    if (verify0 !== chunk0 || verify1 !== chunk1) {
        throw new Error('Key storage verification failed — SecureStore write corruption.');
    }
};

// ============================================================================
// DOCUMENT KEY DECRYPTION
// ============================================================================

/**
 * Decrypt a document's AES key using the user's RSA private key.
 * @throws If private key is missing or decryption fails
 */
export const decryptDocumentKey = async (encryptedKey: string): Promise<string> => {
    const pem = await getPrivateKeyPem();

    if (!pem) {
        throw new Error(
            'Your encryption keys are missing.\n\n' +
            'This can happen after reinstalling the app or switching devices.\n' +
            'Go to Settings → Security Setup to regenerate your keys, ' +
            'then ask the document owner to re-share with you.'
        );
    }

    try {
        const privateKey = await importPrivateKey(pem);
        return await decryptKey(encryptedKey, privateKey);
    } catch (error) {
        console.error('[CryptoService] RSA key unwrap failed:', error);
        throw new Error(
            'Failed to decrypt the document key.\n\n' +
            'Your encryption keys may have changed since this document was shared.\n' +
            'Ask the document owner to re-share this document with you.'
        );
    }
};

// ============================================================================
// KEY ROTATION
// ============================================================================

interface RotationResult {
    success: boolean;
    rotatedKeys: number;
    failedKeys: number;
    error?: string;
}

/**
 * Rotate the user's RSA key pair.
 * 
 * 1. Generates a new RSA-2048 key pair
 * 2. Fetches all document_keys owned by this user
 * 3. Decrypts each AES key with the OLD private key
 * 4. Re-encrypts each AES key with the NEW public key
 * 5. Updates document_keys rows in Supabase
 * 6. Stores new private key in SecureStore
 * 7. Updates profile.public_key in Supabase
 * 
 * @param userId - The authenticated user's UUID
 * @param onProgress - Optional callback for progress updates (0-100)
 */
export const rotateKeys = async (
    userId: string,
    onProgress?: (percent: number, status: string) => void
): Promise<RotationResult> => {
    const progress = onProgress || (() => {});

    try {
        // Step 1: Get old private key
        progress(5, 'Reading current keys...');
        const oldPem = await getPrivateKeyPem();
        if (!oldPem) {
            return { success: false, rotatedKeys: 0, failedKeys: 0, error: 'No existing private key found.' };
        }
        const oldPrivateKey = await importPrivateKey(oldPem);

        // Step 2: Generate new key pair
        progress(10, 'Generating new RSA-2048 key pair...');
        const newKeyPair = await generateKeyPair();
        const newPublicKeyBase64 = await exportPublicKey(newKeyPair.publicKey);
        const newPrivateKeyBase64 = await exportPrivateKey(newKeyPair.privateKey);

        // Step 3: Fetch all document_keys for this user
        progress(20, 'Fetching document keys...');
        const { data: docKeys, error: fetchError } = await supabase
            .from('document_keys')
            .select('id, document_id, encrypted_key')
            .eq('user_id', userId);

        if (fetchError) {
            return { success: false, rotatedKeys: 0, failedKeys: 0, error: `Failed to fetch keys: ${fetchError.message}` };
        }

        if (!docKeys || docKeys.length === 0) {
            // No document keys to rotate — just update the RSA pair
            progress(80, 'Updating RSA key pair...');
            await storePrivateKeyPem(newPrivateKeyBase64);
            await updateProfile(userId, { public_key: newPublicKeyBase64 });
            progress(100, 'Done — no document keys to rotate.');
            return { success: true, rotatedKeys: 0, failedKeys: 0 };
        }

        // Step 4: Re-encrypt each key
        let rotated = 0;
        let failed = 0;

        for (let i = 0; i < docKeys.length; i++) {
            const dk = docKeys[i];
            const pct = 20 + Math.floor((i / docKeys.length) * 60); // 20-80%
            progress(pct, `Re-encrypting key ${i + 1}/${docKeys.length}...`);

            try {
                // Decrypt with old key
                const aesKeyHex = await decryptKey(dk.encrypted_key, oldPrivateKey);

                // Encrypt with new key
                const newEncryptedKey = await encryptKey(aesKeyHex, newKeyPair.publicKey);

                // Update in database
                const { error: updateError } = await supabase
                    .from('document_keys')
                    .update({ encrypted_key: newEncryptedKey })
                    .eq('id', dk.id);

                if (updateError) {
                    console.error(`[KeyRotation] Failed to update key ${dk.id}:`, updateError);
                    failed++;
                } else {
                    rotated++;
                }
            } catch (err) {
                console.error(`[KeyRotation] Failed to re-encrypt key ${dk.id}:`, err);
                failed++;
            }
        }

        // Step 5: Store new private key + update profile
        progress(85, 'Storing new private key...');
        await storePrivateKeyPem(newPrivateKeyBase64);

        progress(90, 'Updating server-side public key...');
        await updateProfile(userId, { public_key: newPublicKeyBase64 });

        progress(100, 'Key rotation complete.');
        return { success: true, rotatedKeys: rotated, failedKeys: failed };

    } catch (error) {
        console.error('[KeyRotation] Fatal error:', error);
        return {
            success: false,
            rotatedKeys: 0,
            failedKeys: 0,
            error: `Key rotation failed: ${(error as Error).message}`
        };
    }
};

export default { getPrivateKeyPem, decryptDocumentKey, rotateKeys };
