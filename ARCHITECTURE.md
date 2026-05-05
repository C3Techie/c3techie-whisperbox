# WhisperBox - Architecture & System Design

## System Architecture Overview

### High-Level Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER BROWSER                              │
│                      (Client-Side Only)                          │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    React UI Layer                           │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │ │
│  │  │  Register    │  │    Login     │  │   Chat Interface │ │ │
│  │  │  Form        │  │    Form      │  │   (Messages +    │ │ │
│  │  │              │  │              │  │    Input)        │ │ │
│  │  └──────────────┘  └──────────────┘  └──────────────────┘ │ │
│  │         │                  │                   │            │ │
│  │         └──────────────────┴───────────────────┘            │ │
│  │                    │                                         │ │
│  │                    ▼                                         │ │
│  │  ┌────────────────────────────────────────────────────────┐ │ │
│  │  │        React Context (AuthContext)                     │ │ │
│  │  │  • session: SessionData                                │ │ │
│  │  │  • user: AuthUser                                      │ │ │
│  │  │  • privateKey: CryptoKey (MEMORY ONLY)               │ │ │
│  │  └────────────────────────────────────────────────────────┘ │ │
│  │                    │                                         │ │
│  │                    ▼                                         │ │
│  │  ┌────────────────────────────────────────────────────────┐ │ │
│  │  │     Web Crypto API (crypto.ts)                         │ │ │
│  │  │  ┌─────────────────────────────────────────────────┐  │ │ │
│  │  │  │ RSA-OAEP  │  AES-GCM  │  PBKDF2  │  AES-KW    │  │ │ │
│  │  │  │ 2048-bit  │  256-bit  │ SHA-256  │  256-bit   │  │ │ │
│  │  │  └─────────────────────────────────────────────────┘  │ │ │
│  │  └────────────────────────────────────────────────────────┘ │ │
│  │         │                │                │                 │ │
│  │         ▼                ▼                ▼                 │ │
│  │  ┌────────────┐  ┌──────────────┐  ┌────────────────────┐ │ │
│  │  │  crypto.ts │  │  auth.ts     │  │  storage.ts (IDB)  │ │ │
│  │  │            │  │              │  │                    │ │ │
│  │  │ Encrypt    │  │ Register     │  │ Store wrapped keys │ │ │
│  │  │ Decrypt    │  │ Login        │  │ Retrieve wrapped   │ │ │
│  │  │ Key wrap   │  │ Key mgmt     │  │ User public keys   │ │ │
│  │  └────────────┘  └──────────────┘  └────────────────────┘ │ │
│  └────────────────────────────────────────────────────────────┘ │
│                           │                                      │
│  ┌────────────────────────┴─────────────────────────────────┐  │
│  │        Local Storage Layers                              │  │
│  │  • IndexedDB: {wrappedKey, salt, userInfo}             │  │
│  │  • sessionStorage: {token, session metadata}           │  │
│  │  • Memory: {privateKey, decrypted messages}            │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
           │                                │
           │ HTTPS                          │ WSS
           │                                │
           ▼                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                   WHISPERBOX BACKEND SERVER                      │
│                  (Cannot Decrypt Messages)                       │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │          Authentication Endpoints                          │ │
│  │  • POST /auth/register                                    │ │
│  │    Request:  {username, password, publicKey}             │ │
│  │    Response: {userId, token, publicKeyJWK}               │ │
│  │  • POST /auth/login                                      │ │
│  │    Request:  {username, password}                        │ │
│  │    Response: {userId, token, publicKeyJWK}               │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │          Messaging Endpoints                               │ │
│  │  • POST /messages/send                                    │ │
│  │    Request:  {recipientId, ciphertext, encryptedKey, iv} │ │
│  │    Response: {messageId, sentTime}                        │ │
│  │  • GET /messages/conversation/{participantId}            │ │
│  │    Response: [{messageId, ciphertext, encryptedKey, iv}] │ │
│  │  • WSS /ws (WebSocket)                                    │ │
│  │    Sends:    {messageId, ciphertext, encryptedKey, iv}   │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │          Database (Can't decrypt)                          │ │
│  │  • users:     {id, username, password_hash, public_key}  │ │
│  │  • messages:  {id, sender, recipient, ciphertext, ...}   │ │
│  │  ❌ NO private keys                                        │ │
│  │  ❌ NO plaintext messages                                 │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow Architecture

### Registration Flow (Client to Server)

```
User enters:
┌──────────┐    ┌──────────┐
│ Username │    │ Password │
└────┬─────┘    └────┬─────┘
     │               │
     └───────┬───────┘
             │
             ▼
    ┌────────────────────┐
    │ React Registration │
    │     Component      │
    └────────┬───────────┘
             │
             ▼
    ┌────────────────────────────────────────┐
    │ generateRSAKeyPair()                   │
    │ • Generates RSA-2048 keypair           │
    │ • Returns {publicKey, privateKey}      │
    └────────┬───────────────────────────────┘
             │
         ┌───┴────────────────────┐
         │                        │
         ▼                        ▼
    Public Key            Private Key
         │                        │
         │                        ▼
         │              ┌────────────────────┐
         │              │ wrapPrivateKey()   │
         │              │ • PBKDF2 derivation│
         │              │ • AES-KW wrapping  │
         │              └────────┬───────────┘
         │                       │
         │          ┌────────────┴──────────┐
         │          │                       │
         │          ▼                       ▼
         │      wrapped Key            salt
         │          │                   │
         │          └─────────┬─────────┘
         │                    │
         │          ┌─────────▼──────────┐
         │          │    IndexedDB       │
         │          │ Store wrapped key  │
         │          └─────────┬──────────┘
         │                    │
         ▼                    ▼
    ┌─────────────────────────────────┐
    │ registerUser(username, password,│
    │            publicKey)           │
    │                                 │
    │ POST /auth/register             │
    │ {                               │
    │   username: "alice",            │
    │   password: "pass123",          │
    │   publicKey: {...JWK...}        │
    │ }                               │
    └────────────┬────────────────────┘
                 │
                 ▼  HTTPS
        Whisperbox Backend
                 │
    ┌────────────▼──────────────┐
    │ Store in Database:        │
    │ • username: "alice"       │
    │ • password_hash: "..."    │
    │ • public_key: {...}       │
    │ ✅ NO private key        │
    └────────────┬──────────────┘
                 │
                 ▼
    ┌─────────────────────────┐
    │ Return to Client:       │
    │ • userId: "alice_123"   │
    │ • token: "jwt_token"    │
    │ • publicKeyJWK: {...}   │
    └────────────┬────────────┘
                 │
                 ▼
    ┌──────────────────────────┐
    │ Client-Side Session:     │
    │ • Load privateKey to     │
    │   memory (React Context) │
    │ • Ready for messaging    │
    └──────────────────────────┘
```

### Message Encryption & Sending Flow

```
User types: "Hello Alice!"
     │
     ▼
┌───────────────────────────────────┐
│ React Input Component             │
│ handleSendMessage(text)           │
└──────────────┬────────────────────┘
               │
               ▼
┌───────────────────────────────────────────┐
│ 1. Get recipient's public key             │
│    importPublicKeyFromJWK(                │
│      recipientInfo.publicKeyJWK)          │
└──────────────┬────────────────────────────┘
               │
               ▼
┌───────────────────────────────────────────┐
│ 2. Call encryptMessageComplete(           │
│      plaintext,                           │
│      recipientPublicKey)                  │
└──────────────┬────────────────────────────┘
               │
         ┌─────┴─────────────┐
         │                   │
         ▼                   ▼
    generateAESKey()    generateIV()
         │                   │
         └─────┬─────────────┘
               │
               ▼
    ┌──────────────────────┐
    │ encryptMessage()     │
    │ AES-GCM encrypt      │
    │                      │
    │ Plaintext: "Hello"   │
    │ AES Key: <random>    │
    │ IV: <12 random bytes>│
    │                      │
    │ Output: ciphertext   │
    └──────┬───────────────┘
           │
           ▼
    ┌──────────────────────┐
    │ encryptAESKey()      │
    │ RSA-OAEP encrypt     │
    │                      │
    │ Input: AES key       │
    │ With: Alice's        │
    │       public key     │
    │                      │
    │ Output: encryptedKey │
    └──────┬───────────────┘
           │
           ▼
    ┌────────────────────────────────────┐
    │ Return EncryptedMessage:           │
    │ {                                  │
    │   ciphertext: "base64...",         │
    │   encryptedKey: "base64...",       │
    │   iv: "base64...",                 │
    │   algorithm: "AES-GCM+RSA-OAEP"    │
    │ }                                  │
    └────────┬─────────────────────────┘
             │
             ▼
    ┌──────────────────────┐
    │ sendMessage()        │
    │ POST /messages/send  │
    │                      │
    │ HTTPS Body:          │
    │ {                    │
    │   recipientId: "id", │
    │   ciphertext: "...", │
    │   encryptedKey: "...",│
    │   iv: "..."          │
    │ }                    │
    │                      │
    │ ✅ NO PLAINTEXT    │
    └──────┬───────────────┘
           │
           ▼  HTTPS
    Whisperbox Backend
           │
    ┌──────▼──────────────────┐
    │ Store in Database:       │
    │ {                        │
    │   sender: "bob_123",     │
    │   recipient: "alice_123",│
    │   ciphertext: "...",     │
    │   encryptedKey: "...",   │
    │   iv: "...",             │
    │   timestamp: "..."       │
    │ }                        │
    │                          │
    │ ❌ Can't read ciphertext│
    └──────────────────────────┘
```

### Message Reception & Decryption Flow

```
Backend sends via WebSocket:
┌────────────────────────────┐
│ {                          │
│   messageId: "msg_456",    │
│   senderId: "bob_123",     │
│   ciphertext: "base64...", │
│   encryptedKey: "base64...",│
│   iv: "base64...",         │
│   createdAt: "2025-05-03"  │
│ }                          │
└──────────┬─────────────────┘
           │
           ▼
    useWebSocket Hook
           │
           ▼
    ChatBox Component
           │
    ┌──────▼─────────────────┐
    │ 1. Get private key from │
    │    React Context        │
    │    session.privateKey   │
    └──────┬──────────────────┘
           │
           ▼
    ┌─────────────────────────┐
    │ 2. Call                 │
    │    decryptMessageComplete(│
    │      {ciphertext,       │
    │       encryptedKey,     │
    │       iv},              │
    │      privateKey)        │
    └──────┬──────────────────┘
           │
         ┌─┴──────────────────┐
         │                    │
         ▼                    ▼
    decryptAESKey()    (parallel)
    RSA-OAEP decrypt
         │
         │ Output: AES key
         │
         ▼
    decryptMessage()
    AES-GCM decrypt
         │
         │ Input:  ciphertext + IV
         │ Key:    AES key
         │ Output: plaintext
         │
         ▼
    "Hello Alice!"
         │
         ▼
    ┌──────────────────────┐
    │ Update React State   │
    │ Add message to       │
    │ messages array       │
    └──────┬───────────────┘
           │
           ▼
    ┌──────────────────────┐
    │ Display in ChatBox   │
    │ "Hello Alice!" 🔒    │
    │ (with timestamp)     │
    └──────────────────────┘
```

## Component Architecture

### React Component Tree

```
App (Root)
│
├─ AuthProvider (Context)
│  ├─ useAuth() hook available to all children
│  └─ Manages: session, user, logout
│
├─ page.tsx (Home)
│  └─ Redirects based on auth status
│
├─ auth/
│  ├─ register/page.tsx
│  │  ├─ Form inputs
│  │  ├─ Calls registerWithE2EE()
│  │  └─ Redirects to chat on success
│  │
│  └─ login/page.tsx
│     ├─ Form inputs
│     ├─ Calls loginWithE2EE()
│     └─ Redirects to chat on success
│
└─ chat/page.tsx (Main App)
   ├─ useAuth() to get session
   ├─ useWebSocket() for real-time
   │
   ├─ Sidebar
   │  └─ UserSearch (find recipients)
   │
   └─ Main Chat Area
      ├─ ChatBox (displays messages)
      │  ├─ Maps ReceivedMessage[]
      │  ├─ Auto-decrypts each message
      │  ├─ Shows MessageBubble for each
      │  └─ Auto-scrolls to bottom
      │
      ├─ MessageBubble (individual message)
      │  ├─ Sender vs receiver styling
      │  ├─ Timestamp formatting
      │  └─ Encryption indicator (🔒)
      │
      └─ InputBox (send message)
         ├─ Text input
         ├─ Send button
         └─ Calls handleSendMessage()
```

### State Management Flow

```
┌─────────────────────────────┐
│    AuthContext              │
│                             │
│  ┌─────────────────────────┐│
│  │ session: SessionData    ││
│  │ ├─ user: AuthUser       ││
│  │ │ ├─ userId            ││
│  │ │ ├─ username          ││
│  │ │ └─ token             ││
│  │ ├─ privateKey          ││ ← IN MEMORY ONLY
│  │ ├─ wrappedPrivateKey   ││
│  │ └─ expiresAt           ││
│  └─────────────────────────┘│
│                             │
│  ┌─────────────────────────┐│
│  │ Methods:                ││
│  │ ├─ setSession()         ││
│  │ ├─ logout()             ││
│  │ ├─ hasPrivateKey()      ││
│  │ └─ getPrivateKey()      ││
│  └─────────────────────────┘│
└──────────────┬──────────────┘
               │
      Provided to all components via useAuth()
               │
        ┌──────┴──────────┬─────────────┐
        │                 │             │
        ▼                 ▼             ▼
    chat/page.tsx   AuthContext   ChatBox
    ├─ Gets session  consumers    ├─ Gets privateKey
    ├─ Gets user              │   ├─ Decrypts msgs
    ├─ Checks auth            │   └─ Displays
    └─ Logs out           ChatBox
                          UserSearch
```

### Data Flow Through Components

```
User Types Message
       │
       ▼
   InputBox (handleSendMessage)
       │
       ├─ Get session from useAuth()
       ├─ Get privateKey from session
       │
       ▼
   encryptMessageComplete()
   (in crypto.ts)
       │
       ├─ Generate AES key
       ├─ Generate IV
       ├─ Encrypt message (AES-GCM)
       ├─ Encrypt AES key (RSA-OAEP)
       │
       ▼
   sendMessage() (api.ts)
   POST /messages/send
       │
       ▼
   Whisperbox Backend
   (stores only encrypted blob)
       │
       ▼
   WebSocket sends encrypted
   message back to sender
   + to recipient
       │
       ▼
   useWebSocket Hook
   onMessageReceived callback
       │
       ▼
   chat/page.tsx
   Updates messages state
       │
       ▼
   ChatBox component
   Maps over messages
       │
       ├─ For each message:
       │  ├─ Get privateKey from context
       │  ├─ Call decryptMessageComplete()
       │  ├─ Update message.decryptedText
       │  │
       │  ▼
       │  MessageBubble
       │  ├─ Display plaintext
       │  ├─ Show timestamp
       │  ├─ Sender/receiver styling
       │  └─ Encryption indicator
       │
       └─ Auto-scroll to latest
```

## Storage Architecture

### IndexedDB Structure

```
Database: "WhisperBoxE2EE"
Version: 1

┌─────────────────────────────────────────────────────┐
│ Object Store: "wrappedKeys"                         │
│ Key Path: "userId"                                  │
│ Index: "username"                                   │
│                                                     │
│ Record Structure:                                   │
│ {                                                   │
│   userId: "alice_123",         (Primary Key)        │
│   username: "alice",                                │
│   wrappedKey: "base64...",     (AES-KW encrypted)   │
│   salt: "base64...",           (32 bytes random)    │
│   algorithm: "AES-KW",                              │
│   createdAt: 1725000000,       (timestamp)          │
│   updatedAt: 1725000000        (timestamp)          │
│ }                                                   │
│                                                     │
│ ✅ Never contains plaintext private key            │
│ ✅ Salt needed to unwrap                           │
│ ✅ Persists across browser restarts                │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ Object Store: "users"                               │
│ Key Path: "userId"                                  │
│ Index: "username"                                   │
│                                                     │
│ Record Structure:                                   │
│ {                                                   │
│   userId: "bob_456",          (Primary Key)         │
│   username: "bob",                                  │
│   publicKeyJWK: {...},        (User's public key)   │
│   createdAt: 1725000100       (timestamp)           │
│ }                                                   │
│                                                     │
│ ✅ Caches contact's public keys                    │
│ ✅ Used for message encryption                     │
│ ✅ Can be cleared without data loss                │
└─────────────────────────────────────────────────────┘
```

### Session Storage Structure

```
sessionStorage Key: "whisperbox_session"

Value (JSON):
{
  user: {
    userId: "alice_123",
    username: "alice",
    publicKeyJWK: {...},
    token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  },
  privateKey: [CryptoKey Object],    ← NOT serializable
  wrappedPrivateKey: {
    wrappedKey: "base64...",
    salt: "base64...",
    algorithm: "AES-KW"
  },
  expiresAt: 1725086400

  ✅ Cleared when browser closes
  ✅ privateKey stored as CryptoKey (not JSON)
  ✅ Short expiration (24 hours)
}
```

### Memory Storage

```
During Session:
┌───────────────────────────────────────────┐
│ React Context (AuthContext)               │
│                                           │
│ privateKey: CryptoKey                     │
│ ├─ Type: RSA-OAEP 2048-bit               │
│ ├─ Algorithm: RSA-OAEP                   │
│ ├─ Usage: ["decrypt"]                    │
│ ├─ Extractable: false                    │
│ └─ Used for message decryption only      │
│                                           │
│ Current Message:                          │
│ ├─ Plaintext (temporary display)         │
│ ├─ User input (being typed)              │
│ └─ Decrypted message content             │
│                                           │
│ ✅ All cleared on logout                │
│ ✅ Not persisted anywhere               │
│ ✅ Only available during active session │
└───────────────────────────────────────────┘
```

## Security Boundaries

```
┌─────────────────────────────────────────────────────────────┐
│                    TRUSTED BOUNDARY                          │
│                  (Client-Side - Browser)                     │
│                                                               │
│  ✅ Private keys                                             │
│  ✅ Message plaintext                                        │
│  ✅ Passwords (used for unwrapping only)                    │
│  ✅ User input                                               │
│  ✅ Decryption operations                                    │
│                                                               │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS + WSS Encryption
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                  UNTRUSTED BOUNDARY                          │
│              (Server-Side - Backend API)                     │
│                                                               │
│  ❌ Private keys (NEVER sent)                               │
│  ❌ Message plaintext (only ciphertext)                     │
│  ❌ User passwords (only hashes)                            │
│  ❌ Cannot decrypt messages                                 │
│                                                               │
│  ✅ Public keys (safe to know)                              │
│  ✅ Message routing                                          │
│  ✅ User metadata                                            │
│  ✅ Authentication                                           │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Encryption Pipeline

```
MESSAGE ENCRYPTION:

User Input "Hello!"
    │
    ▼
┌──────────────────────────────────┐
│ encryptMessageComplete()         │
└──────────────┬───────────────────┘
               │
        ┌──────┴─────────┐
        │                │
        ▼                ▼
   generateAESKey() generateIV()
   AES-256 key     12 bytes
        │                │
        └──────┬─────────┘
               │
               ▼
        encryptMessage()
        AES-GCM encrypt
               │
        ┌──────┴─────────────┐
        │                    │
        ▼                    ▼
     ciphertext         (uses AES key + IV)
               │
               ▼
        encryptAESKey()
        RSA-OAEP encrypt
               │
        ┌──────┴─────────────┐
        │                    │
        ▼                    ▼
   encryptedKey        (with recipient's public key)
               │
               ▼
        ┌──────────────────────────┐
        │ Return EncryptedMessage  │
        │ {                        │
        │   ciphertext: "blob",    │
        │   encryptedKey: "blob",  │
        │   iv: "blob"             │
        │ }                        │
        └──────┬───────────────────┘
               │
               ▼
        Send to Server (HTTPS)
               │
               ▼
        Server stores binary blobs


MESSAGE DECRYPTION:

Receive {ciphertext, encryptedKey, iv}
               │
               ▼
        decryptMessageComplete()
               │
        ┌──────┴──────────┐
        │                 │
        ▼                 ▼
   decryptAESKey()   Get IV from message
   RSA-OAEP decrypt
   with private key
        │
        ├─ Output: AES key
        │
        └──────┬──────────┐
               │          │
               ▼          ▼
           decryptMessage()
           AES-GCM decrypt
               │
               ├─ Input: ciphertext + IV
               ├─ Key: AES key
               ├─ Verify auth tag
               │
               ▼
            plaintext: "Hello!"
               │
               ▼
           Display in UI
```

## Error Handling Flow

```
Operation Fails
       │
       ▼
Try-Catch Block
       │
    ┌──┴─────────────────────┐
    │                        │
    ▼                        ▼
CryptoError           NetworkError
    │                        │
    ├─ Decryption failed    ├─ Request timeout
    ├─ Invalid key          ├─ 4xx/5xx response
    ├─ Bad ciphertext       └─ Connection lost
    │
    ▼
Catch Error
    │
    ├─ Log to console
    │  console.error("Error:", error)
    │
    ├─ Show user message
    │  "Failed to decrypt message"
    │  "Connection lost, retrying..."
    │
    ├─ Set error state
    │  setError(humanReadableMessage)
    │
    └─ Graceful degradation
       ├─ Don't crash app
       ├─ Don't expose keys
       ├─ Keep UI functional
       └─ Allow retry
```

## Performance Optimization

```
Critical Path:
┌──────────┐
│ Register │ ~500ms (PBKDF2 + RSA key gen)
└──────────┘

┌───────┐
│ Login │ ~150ms (PBKDF2 unwrapping)
└───────┘

┌──────────────────┐
│ Send Message     │ ~10ms  (AES-GCM + RSA-OAEP)
├─ Encryption     │
├─ Network        │ ~50-100ms (HTTPS roundtrip)
└─ Total          │ ~60-110ms

┌─────────────────┐
│ Receive Message │ ~20ms (RSA-OAEP + AES-GCM)
├─ WebSocket recv │ <1ms
├─ Decryption     │ ~20ms
└─ UI update      │ <5ms

Total UI Latency: ~25ms after message arrives
```

---

This architecture ensures true End-to-End Encryption where:
- **Only clients can encrypt/decrypt messages**
- **Server stores only binary ciphertext**
- **Private keys never leave the client**
- **Even server compromise doesn't expose messages**
