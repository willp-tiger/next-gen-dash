import { useState, useRef, useEffect } from 'react';
import { lookerChat } from '../../api/client';

interface LookerBuilderProps {
  userId: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  toolCalls?: { name: string; input: any; result: string }[];
  dashboardUrl?: string | null;
}

const TOOL_LABELS: Record<string, string> = {
  get_models: 'Discovering data models',
  get_explore_fields: 'Reading explore fields',
  run_query: 'Previewing data',
  create_dashboard: 'Creating dashboard',
  add_dashboard_element: 'Adding tile',
  add_dashboard_filter: 'Adding filter',
  get_dashboard_url: 'Getting dashboard link',
  list_dashboards: 'Listing dashboards',
};

const TOOL_ICONS: Record<string, string> = {
  get_models: '🔍',
  get_explore_fields: '📊',
  run_query: '⚡',
  create_dashboard: '📋',
  add_dashboard_element: '➕',
  add_dashboard_filter: '🔧',
  get_dashboard_url: '🔗',
  list_dashboards: '📂',
};

export function LookerBuilder({ userId }: LookerBuilderProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      text: "I can build a Looker dashboard for you. Tell me what you'd like to monitor and I'll discover the available data, create the dashboard, and add the right tiles and filters.",
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isLoading]);

  useEffect(() => {
    if (!isLoading) inputRef.current?.focus();
  }, [isLoading]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: trimmed }]);
    setIsLoading(true);

    try {
      const res = await lookerChat(userId, trimmed);
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          text: res.message,
          toolCalls: res.toolCalls.length > 0 ? res.toolCalls : undefined,
          dashboardUrl: res.dashboardUrl,
        },
      ]);
    } catch (err: any) {
      const errorMsg = err?.message?.includes('503')
        ? 'Looker is not configured. Set LOOKER_BASE_URL, LOOKER_CLIENT_ID, and LOOKER_CLIENT_SECRET in your .env file.'
        : 'Something went wrong. Please try again.';
      setMessages(prev => [...prev, { role: 'assistant', text: errorMsg }]);
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

  return (
    <div className="mx-auto flex max-w-4xl flex-col" style={{ height: 'calc(100vh - 140px)' }}>
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-gray-900">Looker Dashboard Builder</h2>
        <p className="mt-1 text-sm text-gray-500">
          Describe what you need and I'll build it in Looker — discovering data, creating tiles, and adding filters automatically.
        </p>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 space-y-4 overflow-y-auto rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200"
      >
        {messages.map((msg, i) => (
          <div key={i}>
            <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                {msg.text}
              </div>
            </div>

            {/* Tool execution log */}
            {msg.toolCalls && msg.toolCalls.length > 0 && (
              <div className="ml-4 mt-2 space-y-1">
                {msg.toolCalls.map((tc, j) => {
                  const hasError = tc.result.includes('"error"');
                  return (
                    <details key={j} className="group">
                      <summary className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-xs ${
                        hasError ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'
                      } hover:bg-blue-100`}>
                        <span>{TOOL_ICONS[tc.name] || '🔧'}</span>
                        <span className="font-medium">{TOOL_LABELS[tc.name] || tc.name}</span>
                        {tc.name === 'add_dashboard_element' && tc.input?.title && (
                          <span className="text-blue-500">— {tc.input.title}</span>
                        )}
                        {tc.name === 'add_dashboard_filter' && tc.input?.title && (
                          <span className="text-blue-500">— {tc.input.title}</span>
                        )}
                        <span className="ml-auto text-gray-400 group-open:hidden">▶</span>
                        <span className="ml-auto hidden text-gray-400 group-open:inline">▼</span>
                      </summary>
                      <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-gray-900 p-2 text-xs text-gray-300">
                        {JSON.stringify(JSON.parse(tc.result), null, 2).slice(0, 1000)}
                      </pre>
                    </details>
                  );
                })}
              </div>
            )}

            {/* Dashboard link */}
            {msg.dashboardUrl && (
              <div className="ml-4 mt-2">
                <a
                  href={msg.dashboardUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-100 px-4 py-2 text-sm font-medium text-emerald-800 transition hover:bg-emerald-200"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  Open Dashboard in Looker
                </a>
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center gap-3 pl-2">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
            <span className="text-sm text-gray-500">Building in Looker...</span>
          </div>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          placeholder="e.g., Build me a dashboard showing vehicle throughput by make with date filters"
          className="flex-1 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:bg-gray-50"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
          className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
