/**
 * IndexedDB Storage
 * 
 * Secure storage for wrapped private keys.
 * Never stores plaintext private keys.
 * Keys are wrapped with PBKDF2-derived password-based encryption.
 */

import { WrappedPrivateKey } from "./crypto";

const DB_NAME = "WhisperBoxE2EE";
const DB_VERSION = 1;
const KEYS_STORE = "wrappedKeys";
const USERS_STORE = "users";

// Type definitions
export interface StoredKey {
  userId: string;
  username: string;
  wrappedKey: string; // Base64
  salt: string; // Base64
  algorithm: string;
  createdAt: number;
  updatedAt: number;
}

export interface StoredUser {
  userId: string;
  username: string;
  publicKeyJWK: JsonWebKey;
  createdAt: number;
}

// ============================================================================
// DATABASE INITIALIZATION
// ============================================================================

let dbInstance: IDBDatabase | null = null;

/**
 * Initialize IndexedDB connection
 * Creates object stores if they don't exist
 */
export async function initializeDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error("IndexedDB open error:", request.error);
      reject(new Error("Failed to open IndexedDB"));
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create object stores if they don't exist
      if (!db.objectStoreNames.contains(KEYS_STORE)) {
        const keysStore = db.createObjectStore(KEYS_STORE, { keyPath: "userId" });
        keysStore.createIndex("username", "username", { unique: true });
        console.log("Created wrappedKeys object store");
      }

      if (!db.objectStoreNames.contains(USERS_STORE)) {
        const usersStore = db.createObjectStore(USERS_STORE, {
          keyPath: "userId",
        });
        usersStore.createIndex("username", "username", { unique: true });
        console.log("Created users object store");
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      console.log("IndexedDB initialized");
      resolve(dbInstance);
    };
  });
}

/**
 * Close IndexedDB connection
 */
export function closeDB(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    console.log("IndexedDB closed");
  }
}

// ============================================================================
// WRAPPED KEY STORAGE
// ============================================================================

/**
 * Store wrapped private key in IndexedDB
 * IMPORTANT: Only the wrapped key is stored, never plaintext
 */
export async function storeWrappedKey(
  userId: string,
  username: string,
  wrappedKey: WrappedPrivateKey
): Promise<void> {
  const db = await initializeDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([KEYS_STORE], "readwrite");
    const store = transaction.objectStore(KEYS_STORE);

    const storedKey: StoredKey = {
      userId,
      username,
      wrappedKey: wrappedKey.wrappedKey,
      salt: wrappedKey.salt,
      algorithm: wrappedKey.algorithm,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const request = store.put(storedKey);

    request.onerror = () => {
      console.error("Failed to store wrapped key:", request.error);
      reject(new Error("Failed to store wrapped key"));
    };

    request.onsuccess = () => {
      console.log("Wrapped key stored for user:", username);
      resolve();
    };
  });
}

/**
 * Retrieve wrapped key from IndexedDB by userId
 */
export async function getWrappedKey(userId: string): Promise<WrappedPrivateKey | null> {
  const db = await initializeDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([KEYS_STORE], "readonly");
    const store = transaction.objectStore(KEYS_STORE);
    const request = store.get(userId);

    request.onerror = () => {
      console.error("Failed to retrieve wrapped key:", request.error);
      reject(new Error("Failed to retrieve wrapped key"));
    };

    request.onsuccess = () => {
      const storedKey = request.result as StoredKey | undefined;
      if (!storedKey) {
        console.log("No wrapped key found for userId:", userId);
        resolve(null);
        return;
      }

      const wrappedKey: WrappedPrivateKey = {
        wrappedKey: storedKey.wrappedKey,
        salt: storedKey.salt,
        algorithm: storedKey.algorithm,
      };

      resolve(wrappedKey);
    };
  });
}

/**
 * Retrieve wrapped key by username
 */
export async function getWrappedKeyByUsername(
  username: string
): Promise<WrappedPrivateKey | null> {
  const db = await initializeDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([KEYS_STORE], "readonly");
    const store = transaction.objectStore(KEYS_STORE);
    const index = store.index("username");
    const request = index.get(username);

    request.onerror = () => {
      console.error("Failed to retrieve wrapped key by username:", request.error);
      reject(new Error("Failed to retrieve wrapped key"));
    };

    request.onsuccess = () => {
      const storedKey = request.result as StoredKey | undefined;
      if (!storedKey) {
        console.log("No wrapped key found for username:", username);
        resolve(null);
        return;
      }

      const wrappedKey: WrappedPrivateKey = {
        wrappedKey: storedKey.wrappedKey,
        salt: storedKey.salt,
        algorithm: storedKey.algorithm,
      };

      resolve(wrappedKey);
    };
  });
}

/**
 * Check if a key exists for user
 */
export async function hasWrappedKey(userId: string): Promise<boolean> {
  const key = await getWrappedKey(userId);
  return key !== null;
}

/**
 * Delete wrapped key (on logout or account deletion)
 */
export async function deleteWrappedKey(userId: string): Promise<void> {
  const db = await initializeDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([KEYS_STORE], "readwrite");
    const store = transaction.objectStore(KEYS_STORE);
    const request = store.delete(userId);

    request.onerror = () => {
      console.error("Failed to delete wrapped key:", request.error);
      reject(new Error("Failed to delete wrapped key"));
    };

    request.onsuccess = () => {
      console.log("Wrapped key deleted for userId:", userId);
      resolve();
    };
  });
}

// ============================================================================
// USER INFO CACHING
// ============================================================================

/**
 * Store user info (public key, username) for contact lookup
 */
export async function storeUserInfo(user: StoredUser): Promise<void> {
  const db = await initializeDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([USERS_STORE], "readwrite");
    const store = transaction.objectStore(USERS_STORE);

    const storedUser: StoredUser = {
      ...user,
      createdAt: user.createdAt || Date.now(),
    };

    const request = store.put(storedUser);

    request.onerror = () => {
      console.error("Failed to store user info:", request.error);
      reject(new Error("Failed to store user info"));
    };

    request.onsuccess = () => {
      console.log("User info stored:", user.username);
      resolve();
    };
  });
}

/**
 * Retrieve user info by userId
 */
export async function getUserInfo(userId: string): Promise<StoredUser | null> {
  const db = await initializeDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([USERS_STORE], "readonly");
    const store = transaction.objectStore(USERS_STORE);
    const request = store.get(userId);

    request.onerror = () => {
      console.error("Failed to retrieve user info:", request.error);
      reject(new Error("Failed to retrieve user info"));
    };

    request.onsuccess = () => {
      resolve(request.result || null);
    };
  });
}

/**
 * Retrieve user info by username
 */
export async function getUserInfoByUsername(
  username: string
): Promise<StoredUser | null> {
  const db = await initializeDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([USERS_STORE], "readonly");
    const store = transaction.objectStore(USERS_STORE);
    const index = store.index("username");
    const request = index.get(username);

    request.onerror = () => {
      console.error("Failed to retrieve user info by username:", request.error);
      reject(new Error("Failed to retrieve user info"));
    };

    request.onsuccess = () => {
      resolve(request.result || null);
    };
  });
}

/**
 * Get all stored users
 */
export async function getAllUsers(): Promise<StoredUser[]> {
  const db = await initializeDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([USERS_STORE], "readonly");
    const store = transaction.objectStore(USERS_STORE);
    const request = store.getAll();

    request.onerror = () => {
      console.error("Failed to retrieve all users:", request.error);
      reject(new Error("Failed to retrieve users"));
    };

    request.onsuccess = () => {
      resolve(request.result || []);
    };
  });
}

/**
 * Delete user info
 */
export async function deleteUserInfo(userId: string): Promise<void> {
  const db = await initializeDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([USERS_STORE], "readwrite");
    const store = transaction.objectStore(USERS_STORE);
    const request = store.delete(userId);

    request.onerror = () => {
      console.error("Failed to delete user info:", request.error);
      reject(new Error("Failed to delete user info"));
    };

    request.onsuccess = () => {
      console.log("User info deleted for userId:", userId);
      resolve();
    };
  });
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Clear all data from IndexedDB
 * Used on logout or account deletion
 */
export async function clearAllData(): Promise<void> {
  const db = await initializeDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([KEYS_STORE, USERS_STORE], "readwrite");

    const keysStore = transaction.objectStore(KEYS_STORE);
    const usersStore = transaction.objectStore(USERS_STORE);

    const keysRequest = keysStore.clear();
    const usersRequest = usersStore.clear();

    keysRequest.onerror = () => {
      console.error("Failed to clear keys store:", keysRequest.error);
      reject(new Error("Failed to clear data"));
    };

    usersRequest.onerror = () => {
      console.error("Failed to clear users store:", usersRequest.error);
      reject(new Error("Failed to clear data"));
    };

    transaction.oncomplete = () => {
      console.log("All IndexedDB data cleared");
      resolve();
    };
  });
}

/**
 * Get database size info
 */
export async function getStorageInfo(): Promise<{ usage: number; quota: number }> {
  if (!navigator.storage || !navigator.storage.estimate) {
    return { usage: 0, quota: 0 };
  }

  try {
    const estimate = await navigator.storage.estimate();
    return {
      usage: estimate.usage || 0,
      quota: estimate.quota || 0,
    };
  } catch (error) {
    console.error("Failed to get storage info:", error);
    return { usage: 0, quota: 0 };
  }
}
