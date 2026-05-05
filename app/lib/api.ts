/**
 * Whisperbox API Integration
 * 
 * Handles all communication with the backend Whisperbox API.
 * All messages sent to the backend are already encrypted on the client.
 * The server only sees ciphertext and encrypted keys.
 */

const API_BASE_URL = "https://whisperbox.koyeb.app";

// Type definitions for API responses
export interface RegisterResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: {
    id: string;
    username: string;
    display_name: string;
    public_key: string; // Base64
    wrapped_private_key: string; // Base64
    pbkdf2_salt: string; // Base64
    created_at: string;
  };
}

export interface LoginResponse extends RegisterResponse {}

export interface UserInfo {
  id: string;
  username: string;
  display_name: string;
  public_key?: string; // Only returned on specific detail endpoints
}

export interface MessagePayload {
  to: string; // recipientId
  payload: {
    ciphertext: string;
    iv: string;
    encryptedKey: string;
    encryptedKeyForSelf: string;
  };
}

export interface ReceivedMessage {
  id: string;
  from_user_id: string;
  to_user_id: string;
  payload: {
    ciphertext: string;
    iv: string;
    encryptedKey: string;
    encryptedKeyForSelf: string;
  };
  created_at: string;
  decryptedText?: string;
  decryptError?: string;
}

export interface SentMessage extends ReceivedMessage {}

export interface ConversationPreview {
  conversationId: string;
  participantId: string;
  participantUsername: string;
  lastMessage: string; // Encrypted, cannot read on server
  lastMessageTime: string;
  unreadCount: number;
}

export interface AuthError {
  error: string;
  message: string;
}

// ============================================================================
// AUTHENTICATION ENDPOINTS
// ============================================================================

/**
 * Register a new user
 * Public key is sent in JWK format
 * Private key stays on client (wrapped and stored in IndexedDB)
 */
export async function registerUser(
  username: string,
  display_name: string,
  password: string,
  publicKey: string,
  wrappedPrivateKey: string,
  pbkdf2Salt: string
): Promise<RegisterResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      username,
      display_name,
      password,
      public_key: publicKey,
      wrapped_private_key: wrappedPrivateKey,
      pbkdf2_salt: pbkdf2Salt,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Registration failed");
  }

  return await response.json();
}

/**
 * Login with username and password
 * Returns user info and JWT token
 */
export async function loginUser(
  username: string,
  password: string
): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      username,
      password,
    }),
  });

  if (!response.ok) {
    let errorMessage = "Login failed";
    try {
      const errorData = await response.json();
      errorMessage = errorData.detail || errorData.message || errorMessage;
    } catch (e) {
      // If response is not JSON, use status text or generic message
      errorMessage = `Login failed (${response.status}: ${response.statusText})`;
    }
    throw new Error(errorMessage);
  }

  try {
    return await response.json();
  } catch (e) {
    throw new Error("Invalid response from server");
  }
}

/**
 * Refresh access token
 */
export async function refreshToken(refreshToken: string): Promise<{ access_token: string, expires_in: number }> {
  const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Refresh failed");
  }

  return await response.json();
}

/**
 * Verify JWT token validity
 */
export async function verifyToken(token: string): Promise<{ valid: boolean }> {
  const response = await fetch(`${API_BASE_URL}/auth/verify`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error("Token verification failed");
  }

  return await response.json();
}

// ============================================================================
// USER ENDPOINTS
// ============================================================================

/**
 * Get user's public key by ID
 */
export async function getUserPublicKey(
  userId: string,
  token: string
): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/users/${userId}/public-key`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch user's public key");
  }

  const data = await response.json();
  return data.public_key;
}

/**
 * Search for users by username or display name
 */
export async function searchUsers(
  query: string,
  token: string
): Promise<UserInfo[]> {
  const response = await fetch(`${API_BASE_URL}/users/search?q=${encodeURIComponent(query)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to search users");
  }

  return await response.json();
}

/**
 * Get user information by ID
 */
export async function getOtherUserInfo(
  userId: string,
  token: string
): Promise<UserInfo> {
  const response = await fetch(`${API_BASE_URL}/users/${userId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch user info");
  }

  return await response.json();
}

/**
 * Get current authenticated user
 */
export async function getCurrentUser(token: string): Promise<UserInfo> {
  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch current user");
  }

  return await response.json();
}

// ============================================================================
// MESSAGING ENDPOINTS
// ============================================================================

/**
 * Send an encrypted message (REST fallback)
 * The payload is already encrypted on the client
 */
export async function sendMessage(
  payload: MessagePayload,
  token: string
): Promise<SentMessage> {
  const response = await fetch(`${API_BASE_URL}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Failed to send message");
  }

  return await response.json();
}

/**
 * Get conversation history with pagination
 */
export async function getConversation(
  userId: string,
  token: string,
  limit: number = 50,
  before?: string
): Promise<ReceivedMessage[]> {
  let url = `${API_BASE_URL}/conversations/${userId}/messages?limit=${limit}`;
  if (before) {
    url += `&before=${before}`;
  }

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch conversation");
  }

  return await response.json();
}

/**
 * Get all conversations
 */
export async function getConversations(
  token: string
): Promise<any[]> {
  const response = await fetch(`${API_BASE_URL}/conversations`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch conversations");
  }

  return await response.json();
}

/**
 * Logout and revoke token
 */
export async function logoutUser(
  token: string,
  refreshToken: string
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/auth/logout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!response.ok) {
    throw new Error("Logout failed");
  }
}

// ============================================================================
// WEBSOCKET CONNECTION
// ============================================================================

export interface WebSocketMessage {
  event: "message.receive" | "user.online" | "user.offline" | "error" | "heartbeat";
  id?: string;
  from_user_id?: string;
  to_user_id?: string;
  payload?: {
    ciphertext: string;
    iv: string;
    encryptedKey: string;
    encryptedKeyForSelf: string;
  };
  created_at?: string;
  user_id?: string;
  detail?: string;
}

/**
 * Create WebSocket connection
 */
export function createWebSocketConnection(
  token: string
): WebSocket | null {
  try {
    // WhisperBox expects the token in the query parameter specifically named 'token'
    // Note: We use the raw token here as JWTs are generally URL-safe, 
    // but we can add encoding back if the backend requires it.
    const wsUrl = `wss://whisperbox.koyeb.app/ws?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {};
    ws.onerror = () => {};
    ws.onclose = () => {};
    return ws;
  } catch (error) {
    return null;
  }
}

/**
 * Parse WebSocket message
 */
export function parseWebSocketMessage(event: MessageEvent): WebSocketMessage {
  try {
    return JSON.parse(event.data);
  } catch (error) {
    return {
      event: "error",
      detail: "Failed to parse message",
    };
  }
}

/**
 * Send typing indicator via WebSocket
 */
export function sendTypingIndicator(ws: WebSocket, recipientId: string): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({
        event: "heartbeat", // Using heartbeat for presence/typing as a placeholder
      })
    );
  }
}
