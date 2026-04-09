import { useState, useRef, useEffect, useCallback } from 'react';
import type { DashboardConfig } from 'shared/types';
import { interpretPrompt } from '../../api/client';

interface OnboardingFlowProps {
  userId: string;
  onComplete: (config: DashboardConfig) => void;
}

interface Message {
  role: 'assistant' | 'user';
  text: string;
}

const QUESTIONS = [
  "Tell me about your role. What does your day-to-day look like managing queues?",
  "When you think about queue health, what worries you the most? What's the first thing you check?",
  "Do you have specific numbers in mind? For example, 'wait times over 5 minutes are bad' or 'we need 90% SLA compliance'.",
];

export function OnboardingFlow({ userId, onComplete }: OnboardingFlowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [questionIndex, setQuestionIndex] = useState(0);
  const [isTyping, setIsTyping] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [answers, setAnswers] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  // Show first question on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      setMessages([{ role: 'assistant', text: QUESTIONS[0] }]);
      setIsTyping(false);
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, scrollToBottom]);

  useEffect(() => {
    if (!isTyping && !isLoading) {
      inputRef.current?.focus();
    }
  }, [isTyping, isLoading]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isTyping || isLoading) return;

    const newAnswers = [...answers, trimmed];
    setAnswers(newAnswers);
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text: trimmed }]);

    const nextIndex = questionIndex + 1;

    if (nextIndex < QUESTIONS.length) {
      setIsTyping(true);
      setQuestionIndex(nextIndex);
      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', text: QUESTIONS[nextIndex] },
        ]);
        setIsTyping(false);
      }, 300);
    } else {
      // All questions answered - build dashboard
      setIsLoading(true);
      try {
        const fullPrompt = newAnswers
          .map((a, i) => `Q: ${QUESTIONS[i]}\nA: ${a}`)
          .join('\n\n');
        const response = await interpretPrompt(userId, fullPrompt);
        onComplete(response.config);
      } catch (err) {
        setIsLoading(false);
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: 'Something went wrong building your dashboard. Please try again.',
          },
        ]);
      }
    }
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
          Answer a few questions so we can personalize your view
        </p>
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

        {isLoading && (
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
            <p className="text-sm font-medium text-gray-600">
              Building your dashboard...
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
          disabled={isTyping || isLoading}
          placeholder={isLoading ? 'Building...' : 'Type your answer...'}
          className="flex-1 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:bg-gray-50"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || isTyping || isLoading}
          className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
