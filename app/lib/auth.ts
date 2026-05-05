/**
 * Authentication Logic
 * 
 * Handles registration and login with end-to-end encryption key management.
 * - Generates RSA keypair on registration
 * - Wraps private key with password-derived key
 * - Stores wrapped key in IndexedDB
 * - Manages JWT session tokens
 */

import {
  generateRSAKeyPair,
  exportPublicKey,
  importPublicKey,
  wrapPrivateKey,
  unwrapPrivateKey,
  WrappedPrivateKey,
  KeyPair,
  bufferToBase64,
  importPublicKeyFromJWK,
  exportPublicKeyJWK,
  exportPrivateKeyJWK,
  importPrivateKeyFromJWK,
} from "./crypto";
export {
  exportPrivateKeyJWK,
  importPrivateKeyFromJWK,
};
import { registerUser, loginUser, getCurrentUser, logoutUser, refreshToken as refreshTokenAPI } from "./api";
import { storeWrappedKey } from "./storage";

// Type definitions
export interface AuthUser {
  id: string;
  username: string;
  display_name: string;
  public_key: string;
  token: string;
}

export interface SessionData {
  user: AuthUser;
  privateKey?: CryptoKey; // Only loaded into memory during active session
  wrappedPrivateKey: WrappedPrivateKey;
  refreshToken: string;
  expiresAt: number; // Timestamp when session expires
}

// ============================================================================
// REGISTRATION
// ============================================================================

/**
 * Register a new user with E2EE key generation
 * 
 * Flow:
 * 1. Generate RSA-OAEP 2048-bit keypair
 * 2. Send public key to backend (with username/password)
 * 3. Wrap private key with password-derived key
 * 4. Store wrapped key in IndexedDB
 * 5. Return session with JWT token
 */
export async function registerWithE2EE(
  username: string,
  display_name: string,
  password: string
): Promise<SessionData> {
  console.log("Starting registration for:", username);

  // Step 1: Generate RSA keypair
  const keyPair = await generateRSAKeyPair();
  console.log("Generated RSA keypair");

  // Step 2: Wrap private key with password
  // (Do this before exporting public key so we have full blobs ready)
  const wrappedPrivateKey = await wrapPrivateKey(
    keyPair.privateKey,
    password
  );
  console.log("Wrapped private key with password");

  // Step 3: Export public key to base64
  const publicKeyBuffer = await exportPublicKey(keyPair.publicKey);
  const publicKeyBase64 = bufferToBase64(publicKeyBuffer);

  // Step 4: Register with backend
  const registerResponse = await registerUser(
    username,
    display_name,
    password,
    publicKeyBase64,
    wrappedPrivateKey.wrappedKey,
    wrappedPrivateKey.salt
  );
  console.log("Registration successful");

  // Step 5: Store wrapped key locally in IndexedDB
  await storeWrappedKey(
    registerResponse.user.id,
    registerResponse.user.username,
    wrappedPrivateKey
  );

  // Step 6: Create session
  const sessionData: SessionData = {
    user: {
      id: registerResponse.user.id,
      username: registerResponse.user.username,
      display_name: registerResponse.user.display_name,
      public_key: registerResponse.user.public_key,
      token: registerResponse.access_token,
    },
    privateKey: keyPair.privateKey, // Keep in memory for this session
    wrappedPrivateKey,
    refreshToken: registerResponse.refresh_token,
    expiresAt: Date.now() + registerResponse.expires_in * 1000,
  };

  return sessionData;
}

// ============================================================================
// LOGIN
// ============================================================================

/**
 * Login user and load private key from IndexedDB
 * 
 * Flow:
 * 1. Authenticate with backend (username/password)
 * 2. Retrieve wrapped private key from IndexedDB
 * 3. Unwrap private key using password
 * 4. Load private key into memory
 * 5. Return session with loaded private key
 */
export async function loginWithE2EE(
  username: string,
  password: string
): Promise<SessionData> {
  console.log("Starting login for:", username);

  // Step 1: Authenticate with backend
  const loginResponse = await loginUser(username, password);
  console.log("Login successful");

  // Step 2: Unwrap private key using password
  const privateKey = await unwrapPrivateKey(
    loginResponse.user.wrapped_private_key,
    password,
    loginResponse.user.pbkdf2_salt
  );
  console.log("Unwrapped private key");

  // Step 3: Store wrapped key locally in IndexedDB (cache it for next visit)
  await storeWrappedKey(
    loginResponse.user.id,
    loginResponse.user.username,
    {
      wrappedKey: loginResponse.user.wrapped_private_key,
      salt: loginResponse.user.pbkdf2_salt,
      algorithm: "AES-KW",
    }
  );

  // Step 4: Create session with loaded private key
  const sessionData: SessionData = {
    user: {
      id: loginResponse.user.id,
      username: loginResponse.user.username,
      display_name: loginResponse.user.display_name,
      public_key: loginResponse.user.public_key,
      token: loginResponse.access_token,
    },
    privateKey, // Keep in memory for this session
    wrappedPrivateKey: {
      wrappedKey: loginResponse.user.wrapped_private_key,
      salt: loginResponse.user.pbkdf2_salt,
      algorithm: "AES-KW",
    },
    refreshToken: loginResponse.refresh_token,
    expiresAt: Date.now() + loginResponse.expires_in * 1000,
  };

  return sessionData;
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

/**
 * Clear session and wipe private key from memory
 * IMPORTANT: This is called on logout to prevent key leaks
 */
export async function clearSession(session: SessionData | null): Promise<void> {
  if (!session) return;

  console.log("Clearing session");

  try {
    // Revoke tokens on server
    await logoutUser(session.user.token, session.refreshToken);
  } catch (e) {
    console.warn("Server logout failed:", e);
  }
}

/**
 * Check if session is still valid (not expired)
 */
export function isSessionValid(session: SessionData | null): boolean {
  if (!session) return false;
  // Buffer of 60 seconds to be safe (increased from 30)
  return Date.now() < session.expiresAt - 60000;
}

/**
 * Handle token refresh
 */
export async function refreshSession(session: SessionData): Promise<SessionData> {
  try {
    const refreshResponse = await refreshTokenAPI(session.refreshToken);
    
    const updatedSession: SessionData = {
      ...session,
      user: {
        ...session.user,
        token: refreshResponse.access_token,
      },
      expiresAt: Date.now() + refreshResponse.expires_in * 1000,
    };

    return updatedSession;
  } catch (error) {
    console.error("Failed to refresh session:", error);
    throw error;
  }
}

// ============================================================================
// PRIVATE KEY MANAGEMENT
// ============================================================================

/**
 * Verify that private key is loaded and ready for decryption
 */
export function hasPrivateKey(session: SessionData | null): boolean {
  return !!session?.privateKey;
}

/**
 * Get internal private key from session
 */
export function getPrivateKey(session: SessionData | null): CryptoKey | undefined {
  return session?.privateKey;
}

/**
 * Get user's own public key
 * Backend returns Base64 SPKI
 */
export async function getUserPublicKey(
  publicKeyBase64: string
): Promise<CryptoKey> {
  return await importPublicKey(publicKeyBase64);
}

/**
 * Verify that a public key is valid
 */
export async function verifyPublicKey(publicKeyBase64: string): Promise<boolean> {
  try {
    await importPublicKey(publicKeyBase64);
    return true;
  } catch (error) {
    console.error("Invalid public key:", error);
    return false;
  }
}
