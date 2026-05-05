'use client';

import { useState } from 'react';

interface InputBoxProps {
  onSend: (message: string) => Promise<void>;
  isLoading?: boolean;
  placeholder?: string;
}

export function InputBox({
  onSend,
  isLoading = false,
  placeholder = 'Type a message...',
}: InputBoxProps) {
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!message.trim() || isLoading) return;

    try {
      await onSend(message);
      setMessage('');
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-transparent">
      <div className="flex items-center space-x-3">
        <div className="flex-1 relative group">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isLoading}
            rows={1}
            className="w-full px-4 sm:px-5 py-3 bg-slate-100 border-none rounded-2xl resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:bg-white transition-all duration-200 text-sm"
            style={{ maxHeight: '120px' }}
          />
        </div>
        <button
          type="submit"
          disabled={isLoading || !message.trim()}
          className="h-11 w-11 flex items-center justify-center rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white shadow-md hover:shadow-indigo-200 transition-all duration-200 shrink-0"
        >
          {isLoading ? (
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
          ) : (
            <svg className="w-5 h-5 rotate-45 -translate-x-0.5 translate-y-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          )}
        </button>
      </div>
    </form>
  );
}
