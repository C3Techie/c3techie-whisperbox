'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/app/contexts/AuthContext';
import {
  getConversation,
  sendMessage as sendMessageAPI,
  getUserPublicKey,
  UserInfo,
  ReceivedMessage,
} from '@/app/lib/api';
import {
  encryptMessageComplete,
  decryptMessageComplete,
  importPublicKey,
} from '@/app/lib/crypto';
import { getPrivateKey } from '@/app/lib/auth';
import { ChatBox } from '@/app/components/ChatBox';
import { InputBox } from '@/app/components/InputBox';
import { UserSearch } from '@/app/components/UserSearch';
import { useWebSocket } from '@/app/hooks/useWebSocket';
import { ConversationsList } from '@/app/components/ConversationsList';

interface ActiveChat {
  user: UserInfo;
  messages: ReceivedMessage[];
}

export default function ChatPage() {
  const router = useRouter();
  const { session, user, logout, refreshTokenIfNeeded, isLoading: authLoading } = useAuth();
  
  const [activeChat, setActiveChat] = useState<ActiveChat | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [messages, setMessages] = useState<ReceivedMessage[]>([]);
  const [lastMessageAt, setLastMessageAt] = useState<string>(new Date().toISOString());
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const activeChatRef = useRef(activeChat);
  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

  // WebSocket for real-time messages
  const handleWebSocketMessage = async (message: ReceivedMessage) => {
    const currentActiveChat = activeChatRef.current;
    
    // Always trigger sidebar refresh regardless of which chat is active
    // We do this in a way that doesn't block the main thread
    setTimeout(() => setLastMessageAt(new Date().toISOString()), 0);

    if (currentActiveChat && (message.from_user_id === currentActiveChat.user.id || message.to_user_id === currentActiveChat.user.id)) {
      let decryptedText: string | undefined;
      const privateKey = getPrivateKey(session);
      
      if (privateKey) {
        try {
          const encrypted = {
            ciphertext: message.payload.ciphertext,
            iv: message.payload.iv,
            encryptedKey: message.payload.encryptedKey,
            encryptedKeyForSelf: message.payload.encryptedKeyForSelf,
            algorithm: 'AES-GCM-256+RSA-OAEP-2048' as const,
          };
          
          decryptedText = await decryptMessageComplete(
            encrypted,
            privateKey,
            String(message.from_user_id) === String(session?.user.id)
          );
        } catch (e) {
          // Silent failure
        }
      }

      const messageWithDecrypted = { ...message, decryptedText };

      setMessages((prev) => {
        const exists = prev.some((m) => m.id === message.id);
        if (exists) return prev;
        
        const next = [...prev, messageWithDecrypted];
        return next.sort((a, b) => 
          new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
        );
      });
    }
  };

  const { isConnected: wsIsConnected, sendMessage: wsSendMessage } = useWebSocket({
    token: session?.user.token || '',
    onMessageReceived: handleWebSocketMessage,
    onUserPresence: (userId, online) => {
      setOnlineUsers((prev) => {
        const next = new Set(prev);
        if (online) next.add(userId);
        else next.delete(userId);
        return next;
      });
    },
    onError: (err) => {
      console.warn('WebSocket error:', err);
      setWsConnected(false);
    },
    onRefreshTokenNeeded: async () => {
      await refreshTokenIfNeeded();
    },
    enabled: !!session?.user.token,
  });

  useEffect(() => {
    setWsConnected(wsIsConnected);
  }, [wsIsConnected]);

  // Redirect if not authenticated (wait for loading to finish)
  useEffect(() => {
    if (!authLoading && (!session || !user || !session.privateKey)) {
      router.push('/auth/login');
    }
  }, [session, user, router, authLoading]);

  // Load conversation when user is selected
  useEffect(() => {
    if (!activeChat || !session?.user.token) {
      setMessages([]); // Clear messages when no chat is active
      return;
    }

    // On mobile, hide sidebar when a chat is selected
    setShowSidebar(false);
    setMessages([]); // Clear previous messages immediately for isolation

    const loadConversation = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const msgs = await getConversation(
          activeChat.user.id,
          session.user.token,
          50,
        );

        // Decrypt all messages immediately
        const privateKey = getPrivateKey(session);
        const decryptedMsgs = await Promise.all(msgs.map(async (msg) => {
          if (!privateKey) return msg;
          try {
            const encrypted = {
              ciphertext: msg.payload.ciphertext,
              iv: msg.payload.iv,
              encryptedKey: msg.payload.encryptedKey,
              encryptedKeyForSelf: msg.payload.encryptedKeyForSelf,
              algorithm: 'AES-GCM-256+RSA-OAEP-2048' as const,
            };
            const decryptedText = await decryptMessageComplete(
              encrypted,
              privateKey,
              String(msg.from_user_id) === String(session.user.id)
            );
            return { ...msg, decryptedText };
          } catch (e) {
            console.error('History Decryption failure:', e, 'Message ID:', msg.id);
            return { ...msg, decryptError: 'Failed to decrypt' };
          }
        }));

        // Reverse to show oldest first (chronological order)
        setMessages([...decryptedMsgs].reverse());
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load conversation';
        console.error('Load error:', message);
        setError(message);
      } finally {
        setIsLoading(false);
      }
    };

    loadConversation();
  }, [activeChat, session]);

  const handleSendMessage = async (text: string) => {
    if (!activeChat || !session?.user.token || !session?.privateKey) {
      setError('Session lost. Please reload.');
      return;
    }

    if (!text.trim()) return;

    setIsSending(true);
    setError(null);

    try {
      const publicKeyBase64 = await getUserPublicKey(
        activeChat.user.id,
        session.user.token
      );

      const recipientPublicKey = await importPublicKey(publicKeyBase64);
      const senderPublicKey = await importPublicKey(session.user.public_key);

      const encrypted = await encryptMessageComplete(
        text,
        recipientPublicKey,
        senderPublicKey
      );

      const payload = {
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        encryptedKey: encrypted.encryptedKey,
        encryptedKeyForSelf: encrypted.encryptedKeyForSelf || '',
      };

      // Try sending via WebSocket first
      let sentMessageId = `temp-${Date.now()}`;
      let created_at = new Date().toISOString();
      const wsSent = wsSendMessage(activeChat.user.id, payload);

      if (!wsSent) {
        const sentMessage = await sendMessageAPI(
          {
            to: activeChat.user.id,
            payload,
          },
          session.user.token
        );
        sentMessageId = sentMessage.id;
        created_at = sentMessage.created_at;
      }

      const newMessage: ReceivedMessage = {
        id: sentMessageId,
        from_user_id: session.user.id,
        to_user_id: activeChat.user.id,
        payload,
        created_at,
        decryptedText: text,
      };

      // Trigger sidebar refresh to show latest message/new conversation
      setLastMessageAt(new Date().toISOString());

      setMessages((prev) => {
        const exists = prev.some((m) => m.id === newMessage.id);
        if (exists) return prev;
        
        const next = [...prev, newMessage];
        return next.sort((a, b) => 
          new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
        );
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send message';
      console.error('Send error:', message);
      setError(message);
    } finally {
      setIsSending(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push('/auth/login');
  };

  if (!session || !user) {
    return (
      <div className="min-h-screen bg-linear-to-br from-slate-900 to-slate-800 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mx-auto mb-4"></div>
          <p className="text-white text-lg">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-slate-50 flex flex-col overflow-hidden">
      {/* Top Navigation */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-2.5 sm:py-3 flex justify-between items-center z-20 shadow-sm">
        <div className="flex items-center space-x-3 sm:space-x-4">
          <div className="flex items-center space-x-1.5 sm:space-x-2">
            <div className="h-9 w-9 sm:h-11 sm:w-11 rounded-lg overflow-hidden flex items-center justify-center">
              <img src="/apple-icon.png" alt="WhisperBox Logo" className="w-full h-full object-contain scale-110" />
            </div>
            <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">WhisperBox</h1>
          </div>
          <div className="h-4 w-px bg-slate-200 mx-1 sm:mx-2" />
          <div className="flex items-center space-x-1.5 sm:space-x-2">
            <div className={`h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full ${wsConnected ? 'bg-green-500 animate-pulse' : 'bg-amber-400'}`} />
            <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-widest">
              {wsConnected ? 'Live' : 'Connecting'}
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-2 sm:space-x-4">
          <div className="hidden sm:block text-right mr-1 sm:mr-2">
            <p className="text-xs sm:text-sm font-bold text-slate-900 truncate max-w-25 sm:max-w-none">{user.display_name || user.username}</p>
            <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400 uppercase tracking-tighter">Secure</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center space-x-1 sm:space-x-2 bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-600 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-bold transition-all duration-200"
          >
            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span className="hidden xs:inline">Logout</span>
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-hidden flex relative">
        {/* Sidebar */}
        <aside className={`
          absolute inset-y-0 left-0 z-30 w-full sm:w-80 md:w-96 border-r border-slate-200 flex flex-col bg-white transition-transform duration-300 ease-in-out
          ${showSidebar ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          md:static md:translate-x-0
        `}>
          <UserSearch
            token={session.user.token}
            onSelectUser={(selectedUser) => {
              setActiveChat({ user: selectedUser, messages: [] });
              setMessages([]);
              setError(null);
            }}
            currentUserId={session.user.id}
          />
          
          <ConversationsList 
            token={session.user.token}
            activeUserId={activeChat?.user.id}
            lastMessageAt={lastMessageAt}
            onSelectUser={(selectedUser) => {
              setActiveChat({ user: selectedUser, messages: [] });
              setMessages([]);
              setError(null);
            }}
          />
          
          <div className="p-4 bg-slate-50 border-t border-slate-200">
            <div className="flex items-center space-x-3">
              <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold">
                {user.username.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-900 truncate">{user.username}</p>
                <div className="flex items-center space-x-1">
                  <svg className="w-3 h-3 text-indigo-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M2.166 4.9L10 1.55l7.834 3.35a1 1 0 01.566.908v5.127c0 4.148-2.616 7.822-6.52 9.293L10 21l-1.88-1.072C4.216 18.457 1.6 14.783 1.6 10.635V5.808a1 1 0 01.566-.908zM10 3.303L4 5.88v4.755c0 3.253 1.956 6.136 4.912 7.39L10 18.667l1.088-.642c2.956-1.254 4.912-4.137 4.912-7.39V5.88l-6-2.577z" clipRule="evenodd" />
                  </svg>
                  <span className="text-[10px] text-indigo-600 font-bold uppercase tracking-tight">E2EE</span>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Chat Area */}
        <main className={`
          flex-1 flex flex-col bg-slate-50 relative h-full transition-all duration-300
          ${!showSidebar ? 'w-full' : 'hidden md:flex md:w-auto'}
        `}>
          {activeChat ? (
            <>
              <ChatBox
                recipientUsername={activeChat.user.username}
                messages={messages}
                currentUserId={user.id}
                isLoading={isLoading}
                isRecipientOnline={onlineUsers.has(activeChat.user.id)}
                onBack={() => setShowSidebar(true)}
              />
              
              {error && (
                <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-red-500 text-white px-6 py-2 rounded-full shadow-lg z-30 flex items-center space-x-2 animate-bounce">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm font-bold">{error}</span>
                </div>
              )}

              <div className="p-3 sm:p-4 bg-white border-t border-slate-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                <InputBox
                  onSend={handleSendMessage}
                  isLoading={isSending}
                  placeholder={`Type a secure message...`}
                />
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full bg-slate-50">
              <div className="text-center max-w-sm px-6">
                <div className="h-28 w-28 sm:h-36 sm:w-36 flex items-center justify-center mx-auto mb-4 sm:mb-6">
                  <img src="/apple-icon.png" alt="Secure Messaging" className="w-full h-full object-contain opacity-90 scale-110" />
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-slate-900 mb-2">Private & Secure</h3>
                <p className="text-slate-500 text-xs sm:text-sm leading-relaxed px-4">
                  Select a contact to start a conversation. 
                  All messages are encrypted end-to-end.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
