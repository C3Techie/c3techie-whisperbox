'use client';

import { useEffect, useState } from 'react';
import { getConversations, UserInfo } from '@/app/lib/api';

interface Conversation {
  user_id: string;
  username: string;
  display_name: string;
  last_message_at: string;
}

interface ConversationsListProps {
  token: string;
  activeUserId?: string;
  onSelectUser: (user: UserInfo) => void;
  lastMessageAt?: string; // New prop to trigger refreshes
}

export function ConversationsList({
  token,
  activeUserId,
  onSelectUser,
  lastMessageAt,
}: ConversationsListProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConversations = async () => {
    try {
      const data = await getConversations(token);
      setConversations(data);
    } catch (err) {
      setError('Could not load chats');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchConversations();
    }
  }, [token, lastMessageAt]); // Re-fetch when token or a new message arrives

  const formatTime = (iso: string) => {
    const date = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 86400000) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  if (isLoading && conversations.length === 0) {
    return (
      <div className="flex flex-col space-y-4 p-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center space-x-3 animate-pulse">
            <div className="h-12 w-12 bg-slate-200 rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-slate-200 rounded w-1/2" />
              <div className="h-3 bg-slate-200 rounded w-3/4" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-4 py-2">
        <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-2 mb-2">
          Recent Conversations
        </h3>
        {conversations.length === 0 ? (
          <div className="text-center py-8 px-4">
            <p className="text-sm text-slate-400">No active chats yet.</p>
            <p className="text-xs text-slate-400 mt-1">Search for a user to start messaging.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {conversations.map((conv) => (
              <button
                key={conv.user_id}
                onClick={() => onSelectUser({
                  id: conv.user_id,
                  username: conv.username,
                  display_name: conv.display_name
                })}
                className={`w-full flex items-center space-x-3 p-3 rounded-xl transition-all ${
                  activeUserId === conv.user_id
                    ? 'bg-indigo-50 border border-indigo-100 shadow-sm'
                    : 'hover:bg-slate-50 border border-transparent'
                }`}
              >
                <div className="h-12 w-12 rounded-full bg-linear-to-tr from-slate-200 to-slate-300 flex items-center justify-center text-slate-600 font-bold text-lg shrink-0">
                  {conv.display_name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex justify-between items-baseline">
                    <p className={`text-sm font-bold truncate ${activeUserId === conv.user_id ? 'text-indigo-700' : 'text-slate-900'}`}>
                      {conv.display_name}
                    </p>
                    <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap ml-2">
                      {formatTime(conv.last_message_at)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 truncate">
                    @{conv.username}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
