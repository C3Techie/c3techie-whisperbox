"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/contexts/AuthContext";
import { loginWithE2EE } from "@/app/lib/auth";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const { setSession } = useAuth();
  
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!username.trim()) {
      setError("Username is required");
      return;
    }

    if (!password) {
      setError("Password is required");
      return;
    }

    setIsLoading(true);

    try {
      const sessionData = await loginWithE2EE(username, password);

      // Set session in context
      setSession(sessionData);

      // Redirect to chat
      router.push("/chat");
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-4xl shadow-[0_20px_50px_rgba(0,0,0,0.05)] p-6 sm:p-10 border border-slate-100">
          <div className="mb-8 sm:mb-10 text-center">
            <div className="h-24 w-24 sm:h-32 sm:w-32 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <img src="/apple-icon.png" alt="WhisperBox" className="w-full h-full object-contain scale-125" />
            </div>
            <p className="text-slate-500 font-bold text-sm tracking-wide uppercase">
              Secure E2EE Messaging
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label htmlFor="username" className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                className="w-full px-5 py-3.5 bg-slate-50 border-none rounded-2xl text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500/20 transition-all duration-200"
                disabled={isLoading}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full px-5 py-3.5 bg-slate-50 border-none rounded-2xl text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500/20 transition-all duration-200"
                disabled={isLoading}
              />
            </div>

            {error && (
              <div className="p-4 bg-red-50 text-red-600 rounded-2xl flex items-center space-x-3 animate-shake">
                <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs font-bold uppercase tracking-tight">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-indigo-600 text-white font-bold py-4 rounded-2xl hover:bg-indigo-700 shadow-lg shadow-indigo-100 hover:shadow-indigo-200 disabled:bg-slate-300 disabled:shadow-none transition-all duration-200"
            >
              {isLoading ? (
                <div className="flex items-center justify-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                  <span>Securing Access...</span>
                </div>
              ) : "Sign In"}
            </button>
          </form>

          <p className="text-center text-slate-500 text-sm mt-8 font-medium">
            New to WhisperBox?{" "}
            <Link href="/auth/register" className="text-indigo-600 hover:text-indigo-700 font-bold decoration-2 underline-offset-4 hover:underline transition-all">
              Create account
            </Link>
          </p>

          <div className="mt-10 p-5 bg-indigo-50/50 rounded-2xl border border-indigo-100/50">
            <div className="flex items-start space-x-3">
              <svg className="w-5 h-5 text-indigo-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <p className="text-[11px] text-indigo-700/80 font-medium leading-relaxed">
                Your password remains private. It locally decrypts your encryption keys 
                so only you can read your messages. The server never sees your plaintext.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
