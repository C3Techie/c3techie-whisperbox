'use client';

import { useState } from 'react';
import { searchUsers, UserInfo } from '@/app/lib/api';

interface UserSearchProps {
  token: string;
  onSelectUser: (user: UserInfo) => void;
  currentUserId: string;
}

export function UserSearch({
  token,
  onSelectUser,
  currentUserId,
}: UserSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!query.trim()) {
      setResults([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const users = await searchUsers(query, token);
      // Filter out current user
      const filtered = users.filter((u: UserInfo) => u.id !== currentUserId);
      setResults(filtered);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Search failed';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4 bg-white sticky top-0 z-10">
      <form onSubmit={handleSearch} className="relative">
        <div className="relative group">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for users..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-100 border-none rounded-2xl text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500/20 transition-all duration-200"
          />
          <div className="absolute left-3.5 top-3 text-slate-400 group-focus-within:text-indigo-500 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          {isLoading && (
            <div className="absolute right-3 top-3">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-indigo-500 border-t-transparent"></div>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-2 p-2 bg-red-50 text-[11px] font-bold text-red-600 rounded-lg text-center uppercase tracking-tight">
            {error}
          </div>
        )}

        {results.length > 0 && (
          <div className="absolute left-0 right-0 mt-2 bg-white border border-slate-100 rounded-2xl shadow-xl z-50 max-h-64 overflow-y-auto overflow-x-hidden p-1">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest p-3 pb-1">Search Results</p>
            {results.map((user) => (
              <button
                key={user.id}
                onClick={() => {
                  onSelectUser(user);
                  setQuery('');
                  setResults([]);
                }}
                className="w-full text-left px-3 py-2.5 hover:bg-slate-50 rounded-xl transition-all duration-200 flex items-center space-x-3"
              >
                <div className="h-9 w-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-sm shrink-0">
                  {user.display_name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-slate-900 text-sm truncate">{user.display_name}</p>
                  <p className="text-xs text-slate-500 truncate">@{user.username}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {!isLoading && query && results.length === 0 && !error && (
          <div className="absolute left-0 right-0 mt-2 bg-white border border-slate-100 rounded-2xl shadow-xl z-50 p-6 text-center">
            <p className="text-sm font-bold text-slate-900">No users found</p>
            <p className="text-xs text-slate-500 mt-1">Try a different name</p>
          </div>
        )}
      </form>
    </div>
  );
}
