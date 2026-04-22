import { useState, useRef, useEffect } from 'react';
import type { DashboardConfig } from 'shared/types';
import { dashboardChat, resetDashboardChat, ApiError } from '../../api/client';

interface DashboardChatProps {
  userId: string;
  onConfigUpdate: (config: DashboardConfig) => void;
  onAuthorKpi?: (phrase: string) => void;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  action?: string | null;
  authorPhrase?: string | null;
}

export function DashboardChat({ userId, onConfigUpdate, onAuthorKpi }: DashboardChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', text: 'How can I help you modify your dashboard? You can ask me to add, remove, or edit metrics.' },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (isOpen && !isLoading) {
      inputRef.current?.focus();
    }
  }, [isOpen, isLoading]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: trimmed }]);
    setIsLoading(true);

    try {
      const res = await dashboardChat(userId, trimmed);
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: res.message,
        action: res.action,
        authorPhrase: res.authorPhrase ?? null,
      }]);
      if (res.config) {
        onConfigUpdate(res.config);
      }
    } catch (err) {
      let text = 'Sorry, something went wrong. Try again.';
      if (err instanceof ApiError && err.status === 503) {
        const body = err.body as { message?: string } | null;
        if (body?.message) text = body.message;
      }
      setMessages(prev => [...prev, { role: 'assistant', text }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const actionBadge = (action: string | null | undefined) => {
    if (!action) return null;
    const colors: Record<string, string> = {
      add: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/10',
      remove: 'bg-red-50 text-red-700 ring-1 ring-red-600/10',
      edit: 'bg-amber-50 text-amber-700 ring-1 ring-amber-600/10',
      filter: 'bg-blue-50 text-blue-700 ring-1 ring-blue-600/10',
      author: 'bg-accent/10 text-accent-dark ring-1 ring-accent/15',
    };
    return (
      <span className={`ml-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${colors[action] || 'bg-slate-100 text-slate-700'}`}>
        {action}
      </span>
    );
  };

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-navy-700 text-white shadow-lg shadow-navy-700/25 transition-all duration-200 hover:bg-navy-800 hover:shadow-xl hover:shadow-navy-700/30 focus:outline-none focus:ring-2 focus:ring-accent/50"
        title="Modify dashboard"
      >
        {isOpen ? (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        )}
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 flex w-[400px] flex-col rounded-2xl bg-white shadow-2xl shadow-slate-900/10 border border-slate-200/60" style={{ height: '500px' }}>
          {/* Header */}
          <div className="flex items-center justify-between rounded-t-2xl px-5 py-3.5" style={{ background: 'linear-gradient(135deg, hsl(210, 50%, 16%) 0%, hsl(210, 55%, 12%) 100%)' }}>
            <div>
              <h3 className="text-sm font-bold text-white">Dashboard Assistant</h3>
              <p className="text-[11px] text-navy-300">Add, edit, or remove metrics</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={async () => {
                  await resetDashboardChat(userId).catch(() => {});
                  setMessages([{ role: 'assistant', text: 'Conversation reset. How can I help?' }]);
                }}
                className="text-[11px] font-medium text-navy-300 hover:text-white transition"
                title="Reset conversation"
              >
                Reset
              </button>
              <button onClick={() => setIsOpen(false)} className="text-navy-300 hover:text-white transition">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-navy-600 text-white'
                    : 'bg-slate-50 text-slate-800 ring-1 ring-slate-200/60'
                }`}>
                  {msg.text}
                  {msg.role === 'assistant' && actionBadge(msg.action)}
                  {msg.role === 'assistant' && msg.action === 'author' && msg.authorPhrase && onAuthorKpi && (
                    <div className="mt-2">
                      <button
                        onClick={() => onAuthorKpi(msg.authorPhrase as string)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-navy-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-navy-700"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                        </svg>
                        Open in Studio
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-slate-50 px-4 py-2.5 ring-1 ring-slate-200/60">
                  <span className="inline-flex gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '0ms' }} />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '150ms' }} />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '300ms' }} />
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-slate-100 p-3">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                placeholder="e.g., Add a revenue breakdown by territory"
                className="flex-1 rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm placeholder-slate-400 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/10 disabled:bg-slate-50 transition"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className="rounded-xl bg-navy-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-700 disabled:opacity-40"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
