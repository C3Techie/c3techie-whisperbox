'use client';

import { useEffect, useRef } from 'react';
import { ReceivedMessage } from '@/app/lib/api';
import { MessageBubble } from './MessageBubble';

interface ChatBoxProps {
  recipientUsername: string;
  messages: ReceivedMessage[];
  currentUserId: string;
  isLoading?: boolean;
  isRecipientOnline?: boolean;
  onBack?: () => void;
}

export function ChatBox({
  recipientUsername,
  messages,
  currentUserId,
  isLoading = false,
  isRecipientOnline = false,
  onBack,
}: ChatBoxProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="border-b border-slate-200 p-3 sm:p-4 bg-white/80 backdrop-blur-md sticky top-0 z-10 flex items-center justify-between">
        <div className="flex items-center space-x-2 sm:space-x-3">
          {onBack && (
            <button 
              onClick={onBack}
              className="md:hidden p-2 -ml-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors"
              aria-label="Go back"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <div className="relative">
            <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-linear-to-tr from-indigo-500 to-indigo-600 flex items-center justify-center text-white font-bold text-base sm:text-lg">
              {recipientUsername.charAt(0).toUpperCase()}
            </div>
            <div 
              className={`absolute bottom-0 right-0 h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-full border-2 border-white ${
                isRecipientOnline ? 'bg-green-500' : 'bg-slate-300'
              }`}
              title={isRecipientOnline ? 'Online' : 'Offline'}
            />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-slate-900 leading-tight truncate max-w-30 sm:max-w-none">{recipientUsername}</h2>
            <div className="flex items-center space-x-1">
              <svg className="w-2.5 h-2.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <span className="text-[9px] sm:text-[10px] uppercase tracking-wider font-bold text-green-600">
                Encrypted
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-slate-500 text-sm">No messages yet</p>
              <p className="text-slate-400 text-xs mt-1">
                Start a conversation with {recipientUsername}
              </p>
            </div>
          </div>
        ) : (
          <>
            {isLoading && (
              <div className="flex justify-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-indigo-500 border-t-transparent"></div>
              </div>
            )}
            {messages.map((msg: any) => (
              <MessageBubble
                key={msg.id}
                text={
                  msg.decryptedText ||
                  msg.decryptError ||
                  '🔒 Encrypted'
                }
                isSender={msg.from_user_id === currentUserId}
                timestamp={msg.created_at}
                isEncrypted={true}
              />
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>
    </div>
  );
}
