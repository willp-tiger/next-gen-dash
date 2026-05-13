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

const TEASER_DISMISSED_KEY = 'ngd:chat-teaser-dismissed';

export function DashboardChat({ userId, onConfigUpdate, onAuthorKpi }: DashboardChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', text: 'How can I help you modify your dashboard? You can ask me to add, remove, or edit metrics.' },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  // One-time teaser callout next to the FAB. Persists dismissal in localStorage so it doesn't
  // re-fire on every page load — chat discoverability matters once per user, not forever.
  const [showTeaser, setShowTeaser] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Toggle a body class while the chat is open so the dashboard layout can reserve right-side
  // gutter space and stop placing hero KPI tiles behind the chat panel.
  useEffect(() => {
    const cls = isOpen ? (isExpanded ? 'chat-open chat-open--wide' : 'chat-open') : '';
    document.body.classList.remove('chat-open', 'chat-open--wide');
    if (cls) cls.split(' ').forEach(c => document.body.classList.add(c));
    return () => {
      document.body.classList.remove('chat-open', 'chat-open--wide');
    };
  }, [isOpen, isExpanded]);

  useEffect(() => {
    if (isOpen && !isLoading) {
      inputRef.current?.focus();
    }
  }, [isOpen, isLoading]);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(TEASER_DISMISSED_KEY)) return;
    } catch {
      return;
    }
    const timer = window.setTimeout(() => setShowTeaser(true), 1200);
    return () => window.clearTimeout(timer);
  }, []);

  const dismissTeaser = () => {
    setShowTeaser(false);
    try { window.localStorage.setItem(TEASER_DISMISSED_KEY, '1'); } catch { /* ignore */ }
  };

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

  const handleQuickAction = (text: string) => {
    setInput(text);
    setTimeout(() => {
      setInput('');
      setMessages(prev => [...prev, { role: 'user', text }]);
      setIsLoading(true);
      dashboardChat(userId, text).then(res => {
        setMessages(prev => [...prev, {
          role: 'assistant',
          text: res.message,
          action: res.action,
          authorPhrase: res.authorPhrase ?? null,
        }]);
        if (res.config) onConfigUpdate(res.config);
      }).catch(() => {
        setMessages(prev => [...prev, { role: 'assistant', text: 'Sorry, something went wrong. Try again.' }]);
      }).finally(() => setIsLoading(false));
    }, 100);
  };

  const QUICK_ACTIONS = [
    'Break down OTIF by destination region',
    'Show me exception rate as a trend',
    'Remove the least important metric',
    'Filter dashboard to EMEA only',
  ];

  const showQuickActions = messages.length === 1 && messages[0].role === 'assistant';

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
      {/* First-load teaser callout — points to the FAB so users discover that the chat is also
          the primary mutator after onboarding. */}
      {!isOpen && showTeaser && (
        <div className="fixed bottom-24 right-6 z-50 max-w-xs animate-fade-in">
          <div className="relative rounded-2xl bg-navy-700 px-4 py-3 text-white shadow-xl shadow-navy-700/30 ring-1 ring-white/10">
            <button
              onClick={dismissTeaser}
              className="absolute right-2 top-2 text-navy-300 hover:text-white"
              aria-label="Dismiss"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div className="flex items-start gap-2 pr-5">
              <svg className="h-4 w-4 mt-0.5 text-accent-light flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
              <div className="text-xs leading-relaxed">
                <p className="font-semibold">Ask Claude anything about this dashboard</p>
                <p className="mt-0.5 text-navy-200">Try: <span className="italic">"Break down OTIF by region"</span> or <span className="italic">"add a customer pipeline tile"</span></p>
              </div>
            </div>
            <div className="absolute -bottom-2 right-7 h-3 w-3 rotate-45 bg-navy-700" />
          </div>
        </div>
      )}

      {/* Toggle button with persistent label. On phones the text label collapses to icon-only
          to preserve thumb-zone real estate; the label re-emerges at sm:+ breakpoints. */}
      <button
        onClick={() => { setIsOpen(!isOpen); dismissTeaser(); }}
        className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-navy-700 text-white shadow-lg shadow-navy-700/25 transition-all duration-200 hover:bg-navy-800 hover:shadow-xl hover:shadow-navy-700/30 focus:outline-none focus:ring-2 focus:ring-accent/50 ${
          isOpen ? 'h-14 w-14 justify-center' : 'h-14 w-14 sm:w-auto sm:pl-4 sm:pr-5 justify-center'
        }`}
        title={isOpen ? 'Close chat' : 'Ask Claude to modify the dashboard'}
        aria-label={isOpen ? 'Close chat' : 'Open dashboard chat'}
      >
        {isOpen ? (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <>
            <svg className="h-5 w-5 text-accent-light" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
            <span className="hidden sm:inline text-sm font-semibold">Ask Claude</span>
          </>
        )}
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div className={`fixed z-50 flex flex-col rounded-2xl bg-white shadow-2xl shadow-slate-900/10 border border-slate-200/60 transition-all duration-300 ${
          isExpanded
            ? 'bottom-6 right-6 w-[calc(100vw-3rem)] sm:w-[640px]'
            : 'bottom-24 right-6 w-[calc(100vw-3rem)] sm:w-[400px]'
        }`} style={{ height: isExpanded ? 'min(700px, calc(100vh - 3rem))' : 'min(500px, calc(100vh - 8rem))' }}>
          {/* Header */}
          <div className="flex items-center justify-between rounded-t-2xl px-5 py-3.5" style={{ background: 'linear-gradient(135deg, hsl(210, 50%, 16%) 0%, hsl(210, 55%, 12%) 100%)' }}>
            <div>
              <h3 className="text-sm font-bold text-white">Dashboard Assistant</h3>
              <p className="text-[11px] text-navy-300">Add, edit, or remove metrics</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={async () => {
                  if (!window.confirm('Clear this conversation? Your dashboard changes will stay.')) return;
                  await resetDashboardChat(userId).catch(() => {});
                  setMessages([{ role: 'assistant', text: 'Conversation cleared. How can I help?' }]);
                }}
                className="text-[11px] font-medium text-navy-300 hover:text-white transition"
                title="Clear conversation (dashboard changes stay)"
              >
                Clear
              </button>
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="text-navy-300 hover:text-white transition hidden sm:block"
                title={isExpanded ? 'Minimize' : 'Expand'}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  {isExpanded ? (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                  )}
                </svg>
              </button>
              <button onClick={() => { setIsOpen(false); setIsExpanded(false); }} className="text-navy-300 hover:text-white transition">
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
            {showQuickActions && !isLoading && (
              <div className="space-y-1.5 px-1">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Quick actions</p>
                {QUICK_ACTIONS.map(action => (
                  <button
                    key={action}
                    onClick={() => handleQuickAction(action)}
                    className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs text-slate-600 transition hover:border-navy-300 hover:bg-accent/5 hover:text-accent-dark"
                  >
                    {action}
                  </button>
                ))}
              </div>
            )}
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
                placeholder="e.g., Break down OTIF by destination region"
                aria-label="Dashboard modification request"
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
