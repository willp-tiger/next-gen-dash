import { useState, useRef, useEffect } from 'react';
import type { DashboardConfig } from 'shared/types';
import { chatMessage, interpretPrompt } from '../../api/client';

interface OnboardingFlowProps {
  userId: string;
  onComplete: (config: DashboardConfig) => void;
}

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

  return (
    <div className="mx-auto flex max-w-2xl flex-col" style={{ height: 'calc(100vh - 140px)' }}>
      {/* Chat header */}
      <div className="mb-4 text-center">
        <h2 className="text-xl font-semibold text-gray-900">
          Let&apos;s build your dashboard
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
