/**
 * Web Crypto API for End-to-End Encryption (E2EE)
 * 
 * This module provides all cryptographic operations using ONLY the Web Crypto API.
 * NO external crypto libraries are used.
 * 
 * Algorithms used:
 * - RSA-OAEP 2048-bit: For key encryption
 * - AES-GCM 256-bit: For message encryption
 * - PBKDF2: For password-based key derivation
 * - AES-KW: For key wrapping
 */

/**
 * Helper to get subtle crypto safely in both SSR and Client environments
 */
function getSubtleCrypto() {
  if (typeof window !== "undefined" && window.crypto) {
    return window.crypto.subtle;
  }
  return null as unknown as SubtleCrypto;
}

const CRYPTO = getSubtleCrypto();

// Type definitions
export interface KeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

export interface EncryptedMessage {
  ciphertext: string; // Base64
  encryptedKey: string; // Base64
  iv: string; // Base64
  algorithm: string;
  encryptedKeyForSelf?: string; // Base64
}

export interface WrappedPrivateKey {
  wrappedKey: string; // Base64 (contains IV + Ciphertext)
  salt: string; // Base64
  algorithm: string;
}

// ============================================================================
// KEY GENERATION AND MANAGEMENT
// ============================================================================

/**
 * Generate an RSA-OAEP 2048-bit key pair for asymmetric encryption
 */
export async function generateRSAKeyPair(): Promise<KeyPair> {
  const crypto = getSubtleCrypto();
  if (!crypto) throw new Error("SubtleCrypto not available");

  const keyPair = await crypto.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]), // 65537
      hash: "SHA-256",
    },
    true, // extractable for export
    ["encrypt", "decrypt"]
  );

  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
  };
}

/**
 * Export public key to SPKI format (PEM-ready)
 */
export async function exportPublicKey(
  publicKey: CryptoKey
): Promise<ArrayBuffer> {
  const crypto = getSubtleCrypto();
  if (!crypto) throw new Error("SubtleCrypto not available");
  return await crypto.exportKey("spki", publicKey);
}

/**
 * Export public key to JWK for JSON serialization
 */
export async function exportPublicKeyJWK(
  publicKey: CryptoKey
): Promise<JsonWebKey> {
  const crypto = getSubtleCrypto();
  if (!crypto) throw new Error("SubtleCrypto not available");
  return (await crypto.exportKey("jwk", publicKey)) as JsonWebKey;
}

/**
 * Import public key from JWK
 */
export async function importPublicKeyFromJWK(
  jwk: JsonWebKey
): Promise<CryptoKey> {
  const crypto = getSubtleCrypto();
  if (!crypto) throw new Error("SubtleCrypto not available");
  return await crypto.importKey(
    "jwk",
    jwk,
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    true,
    ["encrypt"]
  );
}

/**
 * Import public key from SPKI Base64 string
 */
export async function importPublicKey(
  publicKeyBase64: string
): Promise<CryptoKey> {
  const crypto = getSubtleCrypto();
  if (!crypto) throw new Error("SubtleCrypto not available");
  const binaryDer = base64ToBuffer(publicKeyBase64);
  return await crypto.importKey(
    "spki",
    binaryDer as ArrayBuffer,
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    true,
    ["encrypt"]
  );
}

/**
 * Export private key to PKCS8 format
 */
export async function exportPrivateKey(
  privateKey: CryptoKey
): Promise<ArrayBuffer> {
  const crypto = getSubtleCrypto();
  if (!crypto) throw new Error("SubtleCrypto not available");
  return await crypto.exportKey("pkcs8", privateKey);
}

/**
 * Import private key from PKCS8
 */
export async function importPrivateKeyFromPKCS8(
  pkcs8: ArrayBuffer
): Promise<CryptoKey> {
  const crypto = getSubtleCrypto();
  if (!crypto) throw new Error("SubtleCrypto not available");
  return await crypto.importKey(
    "pkcs8",
    pkcs8,
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    true,
    ["decrypt"]
  );
}

/**
 * Export private key to JWK for JSON serialization (per-tab persistence)
 */
export async function exportPrivateKeyJWK(
  privateKey: CryptoKey
): Promise<JsonWebKey> {
  const crypto = getSubtleCrypto();
  if (!crypto) throw new Error("SubtleCrypto not available");
  return (await crypto.exportKey("jwk", privateKey)) as JsonWebKey;
}

/**
 * Import private key from JWK
 */
export async function importPrivateKeyFromJWK(
  jwk: JsonWebKey
): Promise<CryptoKey> {
  const crypto = getSubtleCrypto();
  if (!crypto) throw new Error("SubtleCrypto not available");
  return await crypto.importKey(
    "jwk",
    jwk,
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    true,
    ["decrypt"]
  );
}

// ============================================================================
// PASSWORD-BASED KEY DERIVATION
// ============================================================================

/**
 * Generate a cryptographic salt (16 bytes / 128-bit as per API guide)
 */
export function generateSalt(): Uint8Array {
  if (typeof window === "undefined") return new Uint8Array(16);
  return window.crypto.getRandomValues(new Uint8Array(16));
}

/**
 * Derive a key from a password using PBKDF2
 * Uses 600,000 iterations for security
 */
export async function deriveKeyFromPassword(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const crypto = getSubtleCrypto();
  if (!crypto) throw new Error("SubtleCrypto not available");
  
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);

  const baseKey = await crypto.importKey(
    "raw",
    passwordBuffer,
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"]
  );

  return await crypto.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: 600000,
      hash: "SHA-256",
    } as Pbkdf2Params,
    baseKey,
    {
      name: "AES-GCM",
      length: 256,
    },
    true,
    ["encrypt", "decrypt"]
  );
}

// ============================================================================
// KEY WRAPPING AND UNWRAPPING (for storage)
// ============================================================================

/**
 * Wrap a private key using AES-KW with a derived key
 * Returns Base64-encoded wrapped key and salt
 */
export async function wrapPrivateKey(
  privateKey: CryptoKey,
  password: string
): Promise<WrappedPrivateKey> {
  const crypto = getSubtleCrypto();
  if (!crypto) throw new Error("SubtleCrypto not available");

  const salt = generateSalt();
  const iv = generateIV();
  const wrappingKey = await deriveKeyFromPassword(password, salt);

  try {
    // 1. Export the key to PKCS#8 bytes
    const pkcs8Binary = await crypto.exportKey("pkcs8", privateKey);
    
    // 2. Encrypt using AES-GCM
    const encryptedBuffer = await crypto.encrypt(
      {
        name: "AES-GCM",
        iv: iv as BufferSource
      },
      wrappingKey,
      pkcs8Binary
    );

    // 3. Concatenate IV + Ciphertext for storage in a single field
    const combined = new Uint8Array(iv.length + encryptedBuffer.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encryptedBuffer), iv.length);

    return {
      wrappedKey: bufferToBase64(combined.buffer as ArrayBuffer),
      salt: bufferToBase64(salt.buffer as ArrayBuffer),
      algorithm: "AES-GCM-256",
    };
  } catch (err) {
    throw new Error("Failed to secure private key. Please try again.");
  }
}

/**
 * Unwrap a private key using password and salt
 */
export async function unwrapPrivateKey(
  wrappedKey: string,
  password: string,
  salt: string
): Promise<CryptoKey> {
  const crypto = getSubtleCrypto();
  if (!crypto) throw new Error("SubtleCrypto not available");

  const combinedBuffer = base64ToBuffer(wrappedKey);
  const combinedArray = new Uint8Array(combinedBuffer);
  
  const saltArrayBuffer = base64ToBuffer(salt);
  const saltBuffer = new Uint8Array(saltArrayBuffer);

  const wrappingKey = await deriveKeyFromPassword(password, saltBuffer);

  try {
    // 1. Extract IV (first 12 bytes) and ciphertext
    if (combinedArray.length < 12) {
      throw new Error("Invalid wrapped key format");
    }
    
    const iv = combinedArray.slice(0, 12);
    const ciphertext = combinedArray.slice(12);
    
    // 2. Decrypt using AES-GCM
    const decryptedBuffer = await crypto.decrypt(
      {
        name: "AES-GCM",
        iv: iv as BufferSource
      },
      wrappingKey,
      ciphertext
    );

    // 3. Import back as a proper RSA-OAEP private key
    return await crypto.importKey(
      "pkcs8",
      decryptedBuffer,
      {
        name: "RSA-OAEP",
        hash: "SHA-256",
      },
      true,
      ["decrypt"]
    );
  } catch (err) {
    throw new Error("Failed to unlock private key. Check your password.");
  }
}

// ============================================================================
// MESSAGE ENCRYPTION (AES-GCM)
// ============================================================================

/**
 * Generate an AES-GCM 256-bit key
 * This is ephemeral per message - not stored
 */
export async function generateAESKey(): Promise<CryptoKey> {
  const crypto = getSubtleCrypto();
  if (!crypto) throw new Error("SubtleCrypto not available");

  return await crypto.generateKey(
    {
      name: "AES-GCM",
      length: 256,
    },
    true, // extractable for wrapping
    ["encrypt", "decrypt"]
  );
}

/**
 * Generate a random IV (12 bytes for GCM)
 */
export function generateIV(): Uint8Array {
  if (typeof window === "undefined") return new Uint8Array(12);
  return window.crypto.getRandomValues(new Uint8Array(12));
}

/**
 * Encrypt a message using AES-GCM
 */
export async function encryptMessage(
  message: string,
  aesKey: CryptoKey,
  iv: Uint8Array
): Promise<ArrayBuffer> {
  const crypto = getSubtleCrypto();
  if (!crypto) throw new Error("SubtleCrypto not available");

  const encoder = new TextEncoder();
  const messageBuffer = encoder.encode(message);

  return await crypto.encrypt(
    {
      name: "AES-GCM",
      iv: iv as BufferSource,
    },
    aesKey,
    messageBuffer
  );
}

/**
 * Decrypt a message using AES-GCM
 */
export async function decryptMessage(
  ciphertext: ArrayBuffer,
  aesKey: CryptoKey,
  iv: Uint8Array
): Promise<string> {
  const crypto = getSubtleCrypto();
  if (!crypto) throw new Error("SubtleCrypto not available");

  const decryptedBuffer = await crypto.decrypt(
    {
      name: "AES-GCM",
      iv: iv as BufferSource,
    },
    aesKey,
    ciphertext
  );

  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}

// ============================================================================
// ASYMMETRIC ENCRYPTION (RSA-OAEP)
// ============================================================================

/**
 * Encrypt AES key using recipient's public RSA key
 */
export async function encryptAESKey(
  aesKey: CryptoKey,
  recipientPublicKey: CryptoKey
): Promise<ArrayBuffer> {
  const crypto = getSubtleCrypto();
  if (!crypto) throw new Error("SubtleCrypto not available");

  const exportedKey = await crypto.exportKey("raw", aesKey);

  return await crypto.encrypt(
    {
      name: "RSA-OAEP",
    },
    recipientPublicKey,
    exportedKey
  );
}

/**
 * Decrypt AES key using private RSA key
 */
export async function decryptAESKey(
  encryptedKey: ArrayBuffer,
  privateKey: CryptoKey
): Promise<CryptoKey> {
  const crypto = getSubtleCrypto();
  if (!crypto) throw new Error("SubtleCrypto not available");

  const decryptedKeyBuffer = await crypto.decrypt(
    {
      name: "RSA-OAEP",
    },
    privateKey,
    encryptedKey
  );

  return await crypto.importKey(
    "raw",
    decryptedKeyBuffer,
    {
      name: "AES-GCM",
      length: 256,
    },
    true,
    ["encrypt", "decrypt"]
  );
}

// ============================================================================
// END-TO-END ENCRYPTION FLOW (convenience functions)
// ============================================================================

/**
 * Complete message encryption flow:
 * 1. Generate ephemeral AES key + IV
 * 2. Encrypt message with AES-GCM
 * 3. Encrypt AES key with recipient's public RSA key
 * 4. Encrypt AES key with sender's public RSA key (for self)
 * Returns packed EncryptedMessage object
 */
export async function encryptMessageComplete(
  plaintext: string,
  recipientPublicKey: CryptoKey,
  senderPublicKey: CryptoKey
): Promise<EncryptedMessage> {
  // Generate ephemeral AES key
  const aesKey = await generateAESKey();
  const iv = generateIV();

  // Encrypt message
  const ciphertextBuffer = await encryptMessage(plaintext, aesKey, iv);

  // Encrypt AES key with recipient's public key
  const encryptedKeyBuffer = await encryptAESKey(aesKey, recipientPublicKey);

  // Encrypt AES key with sender's public key (to allow sender to decrypt their own message)
  const encryptedKeyForSelfBuffer = await encryptAESKey(aesKey, senderPublicKey);

  return {
    ciphertext: bufferToBase64(ciphertextBuffer),
    encryptedKey: bufferToBase64(encryptedKeyBuffer),
    encryptedKeyForSelf: bufferToBase64(encryptedKeyForSelfBuffer),
    iv: bufferToBase64(iv.buffer as ArrayBuffer),
    algorithm: "AES-GCM-256+RSA-OAEP-2048",
  };
}

/**
 * Complete message decryption flow:
 * 1. Decrypt AES key using private RSA key
 * 2. Decrypt message using AES key + IV
 * Returns plaintext
 */
export async function decryptMessageComplete(
  encrypted: EncryptedMessage,
  privateKey: CryptoKey,
  isOutgoing: boolean = false
): Promise<string> {
  // Decrypt AES key
  const base64Key = isOutgoing && encrypted.encryptedKeyForSelf 
    ? encrypted.encryptedKeyForSelf 
    : encrypted.encryptedKey;
    
  const encryptedKeyBuffer = base64ToBuffer(base64Key);
  const aesKey = await decryptAESKey(encryptedKeyBuffer, privateKey);

  // Decrypt message
  const ciphertextBuffer = base64ToBuffer(encrypted.ciphertext);
  const ivBuffer = base64ToBuffer(encrypted.iv);
  const iv = new Uint8Array(ivBuffer);

  return await decryptMessage(ciphertextBuffer, aesKey, iv);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Convert ArrayBuffer to Base64 string
 */
export function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert Base64 string to ArrayBuffer
 */
export function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Convert public key to PEM format (for display/sharing)
 */
export async function publicKeyToPEM(publicKey: CryptoKey): Promise<string> {
  const exported = await exportPublicKey(publicKey);
  const base64 = bufferToBase64(exported);
  
  // Insert line breaks every 64 characters
  let pemString = "";
  for (let i = 0; i < base64.length; i += 64) {
    pemString += base64.substr(i, 64) + "\n";
  }

  return `-----BEGIN PUBLIC KEY-----\n${pemString}-----END PUBLIC KEY-----`;
}
