import { useState, useRef, useEffect } from 'react';
import type { DashboardConfig } from 'shared/types';
import { chatMessage, interpretPrompt, getPersonaConfigs, updateDashboardConfig, ApiError } from '../../api/client';

interface OnboardingFlowProps {
  userId: string;
  onComplete: (config: DashboardConfig) => void;
}

const PERSONA_CARDS = [
  {
    key: 'csco',
    title: 'Chief Supply Chain Officer',
    description: 'OTIF, working capital, and operational health across the network',
    icon: 'M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941',
    metrics: '6 metrics',
    color: 'indigo',
  },
  {
    key: 'warehouse-director',
    title: 'Warehouse Director',
    description: 'Pick & pack throughput, order accuracy, and capacity headroom',
    icon: 'M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m4.5-6h1.5m-1.5 3h1.5m-1.5 3h1.5M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21',
    metrics: '6 metrics',
    color: 'violet',
  },
  {
    key: 'procurement-lead',
    title: 'Procurement Lead',
    description: 'Supplier reliability, lead times, and inbound quality',
    icon: 'M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6',
    metrics: '6 metrics',
    color: 'emerald',
  },
];

interface Message {
  role: 'assistant' | 'user';
  text: string;
}

export function OnboardingFlow({ userId, onComplete }: OnboardingFlowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showExamples, setShowExamples] = useState(true);
  const [mode, setMode] = useState<'pick' | 'chat'>('pick');
  const [personas, setPersonas] = useState<Record<string, DashboardConfig> | null>(null);
  const [loadingPersona, setLoadingPersona] = useState<string | null>(null);

  // Load persona configs on mount
  useEffect(() => {
    getPersonaConfigs().then(setPersonas).catch(() => {});
  }, []);

  const handlePersonaPick = async (key: string) => {
    if (!personas?.[key]) return;
    setLoadingPersona(key);
    // Adopt the persona config under the current user's id so dashboard-chat
    // and other per-user endpoints can find a config for this session.
    const now = new Date().toISOString();
    const adopted: DashboardConfig = {
      ...personas[key],
      userId,
      createdAt: now,
      updatedAt: now,
    };
    try {
      const saved = await updateDashboardConfig(userId, adopted);
      onComplete(saved);
    } catch {
      // If the save fails, fall back to using the persona config locally.
      // The chat will still 404 but the dashboard will render.
      onComplete(adopted);
    }
  };

  const EXAMPLE_PROMPTS = [
    "I'm a CSCO — I care about OTIF, inventory turns, and exception rates across the network",
    "I'm a warehouse director focused on pick throughput, line fill, and capacity utilization",
    "I'm a procurement lead tracking supplier OTD, lead times, and quality holds",
  ];

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const initialized = useRef(false);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping, isBuilding]);

  // Focus input when ready
  useEffect(() => {
    if (!isTyping && !isBuilding) {
      inputRef.current?.focus();
    }
  }, [isTyping, isBuilding]);

  // Kick off the conversation with the LLM's first question
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    setIsTyping(true);
    chatMessage(userId, '[START]').then((res) => {
      setMessages([{ role: 'assistant', text: res.reply }]);
      setIsTyping(false);
    }).catch(() => {
      setMessages([{ role: 'assistant', text: "Hi! Tell me about your role and what you need to monitor." }]);
      setIsTyping(false);
    });
  }, [userId]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isTyping || isBuilding) return;

    setInput('');
    setError(null);
    setShowExamples(false);
    setMessages((prev) => [...prev, { role: 'user', text: trimmed }]);
    setIsTyping(true);

    try {
      const res = await chatMessage(userId, trimmed);

      if (res.reply) {
        setMessages((prev) => [...prev, { role: 'assistant', text: res.reply }]);
      }
      setIsTyping(false);

      if (res.isReady && res.transcript) {
        // LLM says it has enough info - build the dashboard
        setIsBuilding(true);
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', text: "Great, I have everything I need. Let me build your dashboard..." },
        ]);

        const response = await interpretPrompt(userId, res.transcript);
        onComplete(response.config);
      }
    } catch (err) {
      setIsTyping(false);
      setIsBuilding(false);
      let text = 'Sorry, something went wrong. Could you try that again?';
      if (err instanceof ApiError && err.status === 503) {
        const body = err.body as { message?: string } | null;
        if (body?.message) text = body.message;
      }
      setError(text);
      setMessages((prev) => [...prev, { role: 'assistant', text }]);
    }
  };

  const handleExampleClick = (text: string) => {
    setInput(text);
    // Auto-send after a brief moment so user sees what was selected
    setTimeout(() => {
      setInput('');
      setShowExamples(false);
      setMessages((prev) => [...prev, { role: 'user', text }]);
      setIsTyping(true);
      chatMessage(userId, text).then((res) => {
        if (res.reply) {
          setMessages((prev) => [...prev, { role: 'assistant', text: res.reply }]);
        }
        setIsTyping(false);
        if (res.isReady && res.transcript) {
          setIsBuilding(true);
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', text: "Great, I have everything I need. Let me build your dashboard..." },
          ]);
          interpretPrompt(userId, res.transcript).then((response) => {
            onComplete(response.config);
          }).catch(() => {
            setIsBuilding(false);
            setError('Something went wrong building the dashboard.');
          });
        }
      }).catch((err) => {
        setIsTyping(false);
        let fallback = 'Sorry, something went wrong. Could you try that again?';
        if (err instanceof ApiError && err.status === 503) {
          const body = err.body as { message?: string } | null;
          if (body?.message) fallback = body.message;
        }
        setMessages((prev) => [...prev, { role: 'assistant', text: fallback }]);
      });
    }, 100);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (mode === 'pick') {
    const colorMap: Record<string, { bg: string; border: string; icon: string; ring: string }> = {
      indigo: { bg: 'bg-accent/10', border: 'border-navy-200 hover:border-navy-400', icon: 'bg-accent/10 text-accent', ring: 'ring-accent' },
      violet: { bg: 'bg-violet-50', border: 'border-violet-200 hover:border-violet-400', icon: 'bg-violet-100 text-violet-600', ring: 'ring-violet-500' },
      emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200 hover:border-emerald-400', icon: 'bg-emerald-100 text-emerald-600', ring: 'ring-emerald-500' },
    };

    return (
      <div className="mx-auto max-w-5xl py-8">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-slate-900">How do you want to start?</h2>
          <p className="mt-2 text-sm text-slate-500">Describe what you need in your own words, or pick a template for your role.</p>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          {/* AI builder — equal-weight column */}
          <button
            onClick={() => setMode('chat')}
            disabled={loadingPersona !== null}
            className="group relative flex flex-col items-start rounded-2xl border-2 border-navy-300 bg-gradient-to-br from-accent/10 via-white to-accent/5 p-6 text-left shadow-sm transition hover:border-accent hover:shadow-lg disabled:opacity-60"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent text-white shadow-sm">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
            <h3 className="mt-4 text-base font-semibold text-slate-900">Build with AI</h3>
            <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
              Tell Claude your role and what matters most. It will choose metrics, set thresholds, and lay out a dashboard for you in about a minute.
            </p>
            <ul className="mt-4 space-y-1.5 text-xs text-slate-500">
              <li className="flex items-start gap-2">
                <svg className="h-3.5 w-3.5 mt-0.5 text-accent flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                <span>Natural-language input — no menus to configure</span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="h-3.5 w-3.5 mt-0.5 text-accent flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                <span>Review the interpretation before anything is saved</span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="h-3.5 w-3.5 mt-0.5 text-accent flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                <span>Keep refining later via dashboard chat</span>
              </li>
            </ul>
            <span className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-navy-700 px-4 py-2 text-xs font-semibold text-white group-hover:bg-navy-800 transition">
              Start a conversation
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </span>
          </button>

          {/* Templates column */}
          <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
              </svg>
            </div>
            <h3 className="mt-4 text-base font-semibold text-slate-900">Start from a template</h3>
            <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
              Pre-built views for common supply-chain roles. You can still ask Claude to modify it after.
            </p>
            <div className="mt-4 space-y-2.5">
              {PERSONA_CARDS.map(card => {
                const c = colorMap[card.color];
                const isLoading = loadingPersona === card.key;
                return (
                  <button
                    key={card.key}
                    onClick={() => handlePersonaPick(card.key)}
                    disabled={loadingPersona !== null}
                    className={`group relative flex w-full items-center gap-3 rounded-xl border ${c.border} ${c.bg} p-3 text-left transition disabled:opacity-60 ${isLoading ? `ring-2 ${c.ring}` : 'hover:shadow-sm'}`}
                  >
                    {isLoading && (
                      <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/60">
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-navy-200 border-t-navy-600" />
                      </div>
                    )}
                    <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${c.icon}`}>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d={card.icon} />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold text-slate-900 leading-tight">{card.title}</h4>
                      <p className="mt-0.5 text-xs text-slate-500 leading-snug">{card.description}</p>
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{card.metrics}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col" style={{ height: 'calc(100vh - 140px)' }}>
      {/* Chat header */}
      <div className="mb-4 text-center">
        <div className="flex items-center justify-center gap-3 mb-1">
          <button
            onClick={() => setMode('pick')}
            className="text-xs text-accent hover:text-accent-dark font-medium"
          >
            &larr; Back to dashboard picker
          </button>
        </div>
        <h2 className="text-xl font-semibold text-slate-900">
          Build a custom dashboard
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {isBuilding
            ? 'Building your personalized dashboard…'
            : 'Claude will ask a few questions about your role and priorities.'}
        </p>
      </div>

      {/* Messages area */}
      <div
        ref={scrollRef}
        className="flex-1 space-y-4 overflow-y-auto rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200/60"
      >
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-navy-600 text-white'
                  : 'bg-slate-50 text-slate-800'
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-slate-50 px-4 py-2.5">
              <span className="inline-flex gap-1">
                <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '0ms' }} />
                <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '150ms' }} />
                <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '300ms' }} />
              </span>
            </div>
          </div>
        )}

        {showExamples && !isTyping && messages.length > 0 && (
          <div className="space-y-2 px-2">
            <p className="text-xs font-medium text-slate-400">Try an example:</p>
            <div className="flex flex-col gap-2">
              {EXAMPLE_PROMPTS.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => handleExampleClick(prompt)}
                  className="rounded-xl border border-navy-200 bg-accent/10 px-4 py-2.5 text-left text-sm text-accent-dark transition hover:border-navy-300 hover:bg-accent/15"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {isBuilding && (
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-navy-200 border-t-navy-600" />
            <p className="text-sm font-medium text-slate-600">
              Building your personalized dashboard...
            </p>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="mt-3 flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isTyping || isBuilding}
          placeholder={isBuilding ? 'Building your dashboard...' : 'Type your answer...'}
          className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 shadow-sm transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:bg-slate-50"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || isTyping || isBuilding}
          className="rounded-xl bg-navy-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-navy-700 focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
