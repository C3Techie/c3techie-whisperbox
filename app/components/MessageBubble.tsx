'use client';

interface MessageBubbleProps {
  text: string;
  isSender: boolean;
  timestamp: string;
  isEncrypted?: boolean;
  isDecrypting?: boolean;
}

export function MessageBubble({
  text,
  isSender,
  timestamp,
  isEncrypted = true,
  isDecrypting = false,
}: MessageBubbleProps) {
  const formatTime = (iso: string) => {
    try {
      const date = new Date(iso);
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return 'Unknown';
    }
  };

  return (
    <div
      className={`flex ${isSender ? 'justify-end' : 'justify-start'} mb-3 px-2`}
    >
      <div
        className={`relative max-w-[90%] sm:max-w-[75%] px-3.5 sm:px-4 py-2 sm:py-2.5 shadow-sm transition-all hover:shadow-md ${
          isSender
            ? 'bg-linear-to-br from-indigo-500 to-indigo-700 text-white rounded-2xl rounded-tr-none'
            : 'bg-white border border-slate-200 text-slate-800 rounded-2xl rounded-tl-none'
        }`}
      >
        {isDecrypting ? (
          <div className="flex items-center space-x-2 py-1">
            <div className="animate-spin rounded-full h-3 w-3 border-2 border-current border-t-transparent"></div>
            <span className="text-xs font-medium">Securing message...</span>
          </div>
        ) : (
          <>
            <div className="flex flex-col">
              <p className="text-[14px] leading-relaxed wrap-break-word whitespace-pre-wrap">
                {text}
              </p>
              <div className={`flex items-center justify-end mt-1.5 space-x-1.5 select-none`}>
                {isEncrypted && (
                  <svg className={`w-3 h-3 ${isSender ? 'text-indigo-200' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                )}
                <span className={`text-[10px] font-medium tracking-tight ${isSender ? 'text-indigo-100' : 'text-slate-400'}`}>
                  {formatTime(timestamp)}
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
