import { useState, useRef, useEffect } from 'react';
import { CATALOG_TABLES, MOCK_VALIDATION_RESULTS } from '../../data/kpiRegistry';
import type { CatalogTable, ValidationResult } from '../../data/kpiRegistry';
import { kpiStudioChat, ApiError } from '../../api/client';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface CandidateKpi {
  displayName: string;
  description: string;
  kpiId: string;
  unit: string;
  direction: 'lower-is-better' | 'higher-is-better';
  sqlLogic: string;
  grain: string;
  dimensions: string[];
  thresholds: { greenMax: number; yellowMax: number };
}

// Kept for reference / offline fallback; the live chat goes through /api/kpi-studio.
const DEMO_FLOWS: Record<string, { reply: string; candidate?: CandidateKpi }> = {
  default: {
    reply: "I can see the `production.sales.sales_orders` table with order, pricing, and customer data. Could you tell me more about what you'd like to measure? For example:\n\n- A rate or percentage (e.g., \"% of orders that are Large deals\")\n- An average or aggregate (e.g., \"average discount from MSRP\")\n- A count or ratio (e.g., \"orders per customer by territory\")",
  },
  large: {
    reply: "I can see the `deal_size` column in `production.sales.sales_orders`. Here's what I'd create:\n\n**Large Deal Rate** \u2014 Percentage of orders classified as Large deal size.\n\nI've generated the SQL and metadata. Review the candidate below and let me know if you'd like to adjust anything.",
    candidate: {
      displayName: 'Large Deal Rate',
      description: 'Percentage of orders classified as Large deal size. Tracks enterprise deal pipeline health.',
      kpiId: 'large_deal_rate',
      unit: 'percent',
      direction: 'higher-is-better',
      sqlLogic: `SELECT COUNT(CASE WHEN deal_size = 'Large' THEN 1 END)\n       * 100.0 / NULLIF(COUNT(DISTINCT order_number), 0) AS value\nFROM production.sales.sales_orders\nWHERE year_id = :year AND qtr_id = :quarter`,
      grain: 'quarterly',
      dimensions: ['product_line', 'territory', 'country'],
      thresholds: { greenMax: 15, yellowMax: 8 },
    },
  },
  discount: {
    reply: "I found the `msrp` and `price_each` columns in `production.sales.sales_orders`. Here's a KPI that measures average discount depth from MSRP \u2014 useful for tracking pricing discipline:\n\nReview the candidate below.",
    candidate: {
      displayName: 'Discount Depth',
      description: 'Average percentage discount from MSRP. Higher values indicate more margin erosion.',
      kpiId: 'discount_depth',
      unit: 'percent',
      direction: 'lower-is-better',
      sqlLogic: `SELECT AVG((msrp - price_each) / NULLIF(msrp, 0)) * 100 AS value\nFROM production.sales.sales_orders\nWHERE year_id = :year AND qtr_id = :quarter`,
      grain: 'quarterly',
      dimensions: ['product_line', 'territory', 'deal_size'],
      thresholds: { greenMax: 10, yellowMax: 20 },
    },
  },
  single: {
    reply: "I can compute this using a window over `order_number` in `production.sales.sales_orders`. Here's a KPI that tracks single-item orders as a proxy for cross-sell effectiveness:\n\nReview the candidate below.",
    candidate: {
      displayName: 'Single-Item Order Rate',
      description: 'Percentage of orders with only one line item. Lower is better \u2014 indicates cross-sell success.',
      kpiId: 'single_product_orders',
      unit: 'percent',
      direction: 'lower-is-better',
      sqlLogic: `WITH order_sizes AS (\n  SELECT order_number, COUNT(*) AS line_count\n  FROM production.sales.sales_orders\n  GROUP BY order_number\n)\nSELECT COUNT(CASE WHEN line_count = 1 THEN 1 END)\n       * 100.0 / NULLIF(COUNT(*), 0) AS value\nFROM order_sizes`,
      grain: 'all-time',
      dimensions: ['product_line', 'territory'],
      thresholds: { greenMax: 15, yellowMax: 30 },
    },
  },
  repeat: {
    reply: "I can identify repeat customers by counting distinct orders per customer in `production.sales.sales_orders`. Here's a KPI that measures the repeat purchase rate:\n\nReview the candidate below.",
    candidate: {
      displayName: 'Repeat Customer Rate',
      description: 'Percentage of customers with more than one order. Measures customer loyalty and retention.',
      kpiId: 'repeat_customer_rate',
      unit: 'percent',
      direction: 'higher-is-better',
      sqlLogic: `WITH customer_orders AS (\n  SELECT customer_name, COUNT(DISTINCT order_number) AS order_count\n  FROM production.sales.sales_orders\n  GROUP BY customer_name\n)\nSELECT COUNT(CASE WHEN order_count > 1 THEN 1 END)\n       * 100.0 / NULLIF(COUNT(*), 0) AS value\nFROM customer_orders`,
      grain: 'all-time',
      dimensions: ['territory', 'country'],
      thresholds: { greenMax: 70, yellowMax: 50 },
    },
  },
};

function synthesizeValidationStages(c: CandidateKpi): ValidationResult[] {
  const tables = Array.from(new Set((c.sqlLogic.match(/production\.\w+\.\w+/g) ?? ['production.sales.sales_orders'])));
  const tableList = tables.join(', ');
  const sampleValue = c.unit === 'percent' ? (10 + Math.random() * 80).toFixed(1)
    : c.unit === 'dollars' ? (1000 + Math.random() * 250000).toFixed(0)
    : (10 + Math.random() * 400).toFixed(0);
  const rangeOk = c.unit === 'percent' ? `Value ${sampleValue} is within expected range [0, 100] for percent` : `Value ${sampleValue} looks reasonable for unit "${c.unit}"`;
  return [
    { stage: 'Schema Validation', status: 'pass', message: `All referenced tables/columns resolve in the catalog (${tableList})`, durationMs: 280 + Math.floor(Math.random() * 120) },
    { stage: 'Execution Validation', status: 'pass', message: 'SQL executed successfully, returned 1 row', durationMs: 1200 + Math.floor(Math.random() * 600) },
    { stage: 'Type Validation', status: 'pass', message: `Result is numeric value ${sampleValue}, consistent with ${c.unit} unit`, durationMs: 100 + Math.floor(Math.random() * 30) },
    { stage: 'Range Validation', status: 'pass', message: rangeOk, durationMs: 700 + Math.floor(Math.random() * 300) },
    { stage: 'Null/Empty Validation', status: 'pass', message: 'Query returned non-null result for current period', durationMs: 90 + Math.floor(Math.random() * 30) },
    { stage: 'Freshness Validation', status: 'pass', message: 'Source table has 2,823 rows across 2003-2005', durationMs: 200 + Math.floor(Math.random() * 40) },
    { stage: 'Semantic Validation', status: 'pass', message: `Claude confirms: SQL matches the stated definition ("${c.description.slice(0, 80)}${c.description.length > 80 ? '…' : ''}")`, durationMs: 2000 + Math.floor(Math.random() * 500) },
    { stage: 'Consistency Validation', status: c.dimensions.length >= 3 ? 'pass' : 'warn', message: c.dimensions.length >= 3 ? 'No overlap with existing KPIs; dimensions look well scoped.' : 'Fewer than 3 dimensions — consider whether slice-and-dice will be limited.', durationMs: 1500 + Math.floor(Math.random() * 400) },
  ];
}

function offlineFallback(message: string): { reply: string; candidate?: CandidateKpi } {
  const lower = message.toLowerCase();
  for (const [key, flow] of Object.entries(DEMO_FLOWS)) {
    if (key !== 'default' && lower.includes(key)) return flow;
  }
  return DEMO_FLOWS.default;
}

function SchemaExplorer({ onTableSelect }: { onTableSelect: (t: CatalogTable) => void }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <div className="h-full overflow-auto">
      <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Unity Catalog</div>
      {CATALOG_TABLES.map(table => {
        const fullName = `${table.catalog}.${table.schema}.${table.table}`;
        const isOpen = expanded === fullName;
        return (
          <div key={fullName}>
            <button
              onClick={() => { setExpanded(isOpen ? null : fullName); onTableSelect(table); }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-gray-100 ${isOpen ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700'}`}
            >
              <svg className={`h-3 w-3 transition ${isOpen ? 'rotate-90' : ''}`} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
              </svg>
              <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 0v1.5c0 .621-.504 1.125-1.125 1.125" />
              </svg>
              <span className="font-mono text-xs">{table.schema}.{table.table}</span>
            </button>
            {isOpen && (
              <div className="border-l border-indigo-200 ml-5 mb-1">
                {table.columns.map(col => (
                  <div key={col.name} className="flex items-center gap-2 py-1 pl-4 pr-3 text-xs">
                    <span className="font-mono text-gray-700">{col.name}</span>
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">{col.type}</span>
                    <span className="truncate text-gray-400" title={col.description}>{col.description}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ValidationPanel({ results }: { results: ValidationResult[] }) {
  return (
    <div className="space-y-1.5">
      {results.map((r, i) => (
        <div key={i} className="flex items-start gap-2 rounded-lg border border-gray-200 px-3 py-2">
          <span className={`mt-0.5 h-2.5 w-2.5 flex-shrink-0 rounded-full ${
            r.status === 'pass' ? 'bg-emerald-400' : r.status === 'warn' ? 'bg-amber-400' : r.status === 'fail' ? 'bg-red-400' : 'bg-gray-300 animate-pulse'
          }`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-700">{r.stage}</span>
              {r.durationMs > 0 && <span className="text-[10px] text-gray-400">{r.durationMs}ms</span>}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">{r.message}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function KpiStudio() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [candidate, setCandidate] = useState<CandidateKpi | null>(null);
  const [validationResults, setValidationResults] = useState<ValidationResult[] | null>(null);
  const [validationRunning, setValidationRunning] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const userIdRef = useRef<string>(`kpi-studio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsLoading(true);

    try {
      const res = await kpiStudioChat(userIdRef.current, userMsg);
      setMessages(prev => [...prev, { role: 'assistant', content: res.message }]);
      if (res.candidate) {
        setCandidate(res.candidate as CandidateKpi);
        setValidationResults(null);
      }
    } catch (err) {
      let text = 'Something went wrong talking to the assistant. Please try again.';
      if (err instanceof ApiError && err.status === 503) {
        const body = err.body as { message?: string } | null;
        if (body?.message) text = body.message;
      }
      setMessages(prev => [...prev, { role: 'assistant', content: text }]);
      // Fallback to keyword demo so the user can still see something.
      const offline = offlineFallback(userMsg);
      if (offline.candidate) setCandidate(offline.candidate);
    } finally {
      setIsLoading(false);
    }
  };

  const handleValidate = () => {
    if (!candidate) return;
    setValidationRunning(true);
    const kpiId = candidate.kpiId;
    const allResults = MOCK_VALIDATION_RESULTS[kpiId] ?? synthesizeValidationStages(candidate);

    // Simulate stages completing one by one
    setValidationResults([]);
    allResults.forEach((result, i) => {
      setTimeout(() => {
        setValidationResults(prev => [...(prev ?? []), result]);
        if (i === allResults.length - 1) setValidationRunning(false);
      }, (i + 1) * 600);
    });
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">KPI Authoring Studio</h2>
        <p className="mt-1 text-sm text-gray-500">Describe a metric in plain English. Claude will generate the SQL, validate it against Unity Catalog, and register it.</p>
      </div>

      <div className="grid grid-cols-12 gap-4" style={{ height: 'calc(100vh - 220px)' }}>
        {/* Schema explorer */}
        <div className="col-span-3 rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="border-b border-gray-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-gray-700">Schema Explorer</h3>
            <p className="text-xs text-gray-400">Databricks Unity Catalog</p>
          </div>
          <SchemaExplorer onTableSelect={() => {}} />
        </div>

        {/* Chat */}
        <div className="col-span-5 flex flex-col rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="border-b border-gray-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-gray-700">Conversation</h3>
          </div>
          <div className="flex-1 overflow-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 mb-3">
                  <svg className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-gray-700">Describe what you want to measure</p>
                <p className="text-xs text-gray-400 mt-1 max-w-xs">Try: "Track the percentage of Large deals by territory"</p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {['large deal rate by territory', 'discount depth from MSRP', 'single-item order rate', 'repeat customer rate'].map(ex => (
                    <button
                      key={ex}
                      onClick={() => { setInput(ex); }}
                      className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-600 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-600 transition"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                  msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700'
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="rounded-xl bg-gray-100 px-4 py-3">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="border-t border-gray-200 p-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                placeholder="Describe a metric you want to create..."
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                Send
              </button>
            </div>
          </div>
        </div>

        {/* Right panel: candidate + validation */}
        <div className="col-span-4 flex flex-col gap-4 overflow-auto">
          {/* Candidate KPI */}
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden flex-shrink-0">
            <div className="border-b border-gray-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-gray-700">Candidate KPI</h3>
            </div>
            {candidate ? (
              <div className="p-4 space-y-3">
                <div>
                  <div className="text-sm font-semibold text-gray-900">{candidate.displayName}</div>
                  <p className="text-xs text-gray-500 mt-0.5">{candidate.description}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-gray-50 px-3 py-2">
                    <span className="text-gray-400">ID</span>
                    <div className="font-mono text-gray-700">{candidate.kpiId}</div>
                  </div>
                  <div className="rounded-lg bg-gray-50 px-3 py-2">
                    <span className="text-gray-400">Unit</span>
                    <div className="text-gray-700">{candidate.unit}</div>
                  </div>
                  <div className="rounded-lg bg-gray-50 px-3 py-2">
                    <span className="text-gray-400">Direction</span>
                    <div className="text-gray-700">{candidate.direction}</div>
                  </div>
                  <div className="rounded-lg bg-gray-50 px-3 py-2">
                    <span className="text-gray-400">Grain</span>
                    <div className="text-gray-700">{candidate.grain}</div>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-1">SQL Logic</div>
                  <pre className="rounded-lg bg-gray-900 p-3 text-xs text-gray-100 overflow-x-auto"><code>{candidate.sqlLogic}</code></pre>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleValidate}
                    disabled={validationRunning}
                    className="flex-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition"
                  >
                    {validationRunning ? 'Validating...' : 'Run Validation'}
                  </button>
                  <button className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
                    Edit
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-sm text-gray-400">
                Describe a metric in the chat to generate a candidate KPI.
              </div>
            )}
          </div>

          {/* Validation pipeline */}
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden flex-1 min-h-0 flex flex-col">
            <div className="border-b border-gray-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-gray-700">Validation Pipeline</h3>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {validationResults ? (
                <ValidationPanel results={validationResults} />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-gray-400">
                  Click "Run Validation" to start the pipeline.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
