import { useState, useRef, useEffect } from 'react';
import type { DashboardConfig } from 'shared/types';
import { chatMessage, interpretPrompt, getPersonaConfigs, updateDashboardConfig } from '../../api/client';

interface OnboardingFlowProps {
  userId: string;
  onComplete: (config: DashboardConfig) => void;
}

const PERSONA_CARDS = [
  {
    key: 'sales-rep',
    title: 'Sales Rep',
    description: 'Revenue, orders, deal sizes, and units sold',
    icon: 'M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z',
    metrics: '6 metrics',
    color: 'indigo',
  },
  {
    key: 'director',
    title: 'Sales Director',
    description: 'Fulfillment rates, territory balance, and customer value',
    icon: 'M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6',
    metrics: '6 metrics',
    color: 'violet',
  },
  {
    key: 'executive',
    title: 'Executive',
    description: 'Revenue growth, pricing efficiency, and customer economics',
    icon: 'M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941',
    metrics: '5 metrics',
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
    "I'm a sales rep -- I care about revenue and deal sizes",
    "I'm a sales director focused on fulfillment rates and territory performance",
    "I'm an executive tracking revenue growth and order trends",
  ];

  const PROGRESS_STEPS = [
    { label: 'Understanding your role', threshold: 0 },
    { label: 'Gathering priorities', threshold: 1 },
    { label: 'Refining details', threshold: 2 },
    { label: 'Almost ready', threshold: 3 },
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
      setError('Something went wrong. Please try again.');
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: 'Sorry, something went wrong. Could you try that again?' },
      ]);
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
      }).catch(() => {
        setIsTyping(false);
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', text: 'Sorry, something went wrong. Could you try that again?' },
        ]);
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
      indigo: { bg: 'bg-indigo-50', border: 'border-indigo-200 hover:border-indigo-400', icon: 'bg-indigo-100 text-indigo-600', ring: 'ring-indigo-500' },
      violet: { bg: 'bg-violet-50', border: 'border-violet-200 hover:border-violet-400', icon: 'bg-violet-100 text-violet-600', ring: 'ring-violet-500' },
      emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200 hover:border-emerald-400', icon: 'bg-emerald-100 text-emerald-600', ring: 'ring-emerald-500' },
    };

    return (
      <div className="mx-auto max-w-3xl py-8">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-gray-900">Choose a dashboard</h2>
          <p className="mt-2 text-sm text-gray-500">Pick a pre-built view for your role, or build a custom one with AI</p>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-8">
          {PERSONA_CARDS.map(card => {
            const c = colorMap[card.color];
            const isLoading = loadingPersona === card.key;
            return (
              <button
                key={card.key}
                onClick={() => handlePersonaPick(card.key)}
                disabled={loadingPersona !== null}
                className={`relative rounded-xl border-2 ${c.border} ${c.bg} p-5 text-left transition hover:shadow-lg disabled:opacity-60 ${isLoading ? `ring-2 ${c.ring}` : ''}`}
              >
                {isLoading && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/60">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
                  </div>
                )}
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${c.icon} mb-3`}>
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d={card.icon} />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold text-gray-900">{card.title}</h3>
                <p className="mt-1 text-xs text-gray-500">{card.description}</p>
                <div className="mt-3 flex items-center gap-2">
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-gray-500 ring-1 ring-gray-200">{card.metrics}</span>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-gray-500 ring-1 ring-gray-200">Real data</span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-4 mb-8">
          <div className="flex-1 border-t border-gray-200" />
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">or</span>
          <div className="flex-1 border-t border-gray-200" />
        </div>

        <div className="text-center">
          <button
            onClick={() => setMode('chat')}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-6 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 hover:border-gray-400"
          >
            <svg className="h-4 w-4 text-indigo-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
            Build a custom dashboard with AI
          </button>
          <p className="mt-2 text-xs text-gray-400">Describe your role and priorities in a conversation with Claude</p>
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
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
          >
            &larr; Back to dashboard picker
          </button>
        </div>
        <h2 className="text-xl font-semibold text-gray-900">
          Build a custom dashboard
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Tell me what you need to monitor and I&apos;ll personalize your view
        </p>

        {/* Progress indicator */}
        {(() => {
          const userMsgCount = messages.filter(m => m.role === 'user').length;
          const stepIndex = Math.min(userMsgCount, PROGRESS_STEPS.length - 1);
          const progress = isBuilding ? 100 : Math.min(((userMsgCount + 1) / 5) * 100, 95);
          const stepLabel = isBuilding ? 'Building dashboard...' : PROGRESS_STEPS[stepIndex].label;

          return (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span>{stepLabel}</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-indigo-500 transition-all duration-700 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          );
        })()}
      </div>

      {/* Messages area */}
      <div
        ref={scrollRef}
        className="flex-1 space-y-4 overflow-y-auto rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200"
      >
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-gray-100 px-4 py-2.5">
              <span className="inline-flex gap-1">
                <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: '0ms' }} />
                <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: '150ms' }} />
                <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: '300ms' }} />
              </span>
            </div>
          </div>
        )}

        {showExamples && !isTyping && messages.length > 0 && (
          <div className="space-y-2 px-2">
            <p className="text-xs font-medium text-gray-400">Try an example:</p>
            <div className="flex flex-col gap-2">
              {EXAMPLE_PROMPTS.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => handleExampleClick(prompt)}
                  className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-left text-sm text-indigo-700 transition hover:border-indigo-300 hover:bg-indigo-100"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {isBuilding && (
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
            <p className="text-sm font-medium text-gray-600">
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
          className="flex-1 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:bg-gray-50"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || isTyping || isBuilding}
          className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
