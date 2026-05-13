import { useEffect, useState } from 'react';
import { getAgents, type AgentMeta } from '../../api/client';

const AGENT_ORDER: AgentMeta['id'][] = ['onboarding', 'interpret', 'chat', 'refinement', 'studio'];

function AgentBadge({ index, name, active, onClick }: { index: number; name: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
        active
          ? 'bg-accent text-white shadow-sm'
          : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
      }`}
    >
      <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
        active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
      }`}>{index + 1}</span>
      {name}
    </button>
  );
}

function FlowStrip({ agents, focusedId, onFocus }: { agents: AgentMeta[]; focusedId: string | null; onFocus: (id: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-100/70 p-3 ring-1 ring-slate-200">
      {agents.map((a, i) => (
        <div key={a.id} className="flex items-center gap-2">
          <AgentBadge
            index={i}
            name={a.name}
            active={focusedId === a.id}
            onClick={() => onFocus(a.id)}
          />
          {i < agents.length - 1 && (
            <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          )}
        </div>
      ))}
    </div>
  );
}

function SemanticLayerHero() {
  return (
    <div className="overflow-hidden rounded-2xl ring-1 ring-navy-700/40 shadow-xl shadow-navy-900/10" style={{ background: 'linear-gradient(135deg, hsl(210, 55%, 12%) 0%, hsl(210, 50%, 16%) 60%, hsl(210, 55%, 14%) 100%)' }}>
      <div className="p-7 sm:p-8">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-accent/20 ring-1 ring-accent/30">
            <svg className="h-5 w-5 text-accent-light" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-accent-light">Featured capability</p>
            <h2 className="mt-1 text-xl font-bold leading-tight text-white sm:text-2xl">
              The semantic layer — Claude that understands your data
            </h2>
          </div>
        </div>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-navy-200">
          The chat doesn't just configure the dashboard anymore. It <span className="font-semibold text-white">interprets</span> what's on it (real values, health bands, trends, comparisons, active annotations) and <span className="font-semibold text-white">queries</span> the underlying data on demand via structured tool calls. Ask <em className="text-navy-100">"is OTIF healthy?"</em> and Claude answers from the live snapshot. Ask <em className="text-navy-100">"who are the worst suppliers by OTD?"</em> and Claude calls a tool against the same API the dashboard uses, then narrates the result with inspectable evidence.
        </p>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-white/5 p-4 ring-1 ring-white/10">
            <p className="text-[10px] font-bold uppercase tracking-wider text-accent-light">Interpretation</p>
            <p className="mt-1 text-sm font-semibold text-white">Grounded narrative</p>
            <p className="mt-1.5 text-xs leading-relaxed text-navy-200">
              Every chat turn ships a compact "current state" payload — values, GREEN/YELLOW/RED bands, recent trend tail, prior-period comparison, and annotations overlapping the filter window. Claude cites real numbers, never guesses.
            </p>
          </div>
          <div className="rounded-xl bg-white/5 p-4 ring-1 ring-white/10">
            <p className="text-[10px] font-bold uppercase tracking-wider text-accent-light">Ad-hoc querying</p>
            <p className="mt-1 text-sm font-semibold text-white">Tool-use loop</p>
            <p className="mt-1.5 text-xs leading-relaxed text-navy-200">
              Six curated tools (value, breakdown, top-N, drill, annotations, timeseries) map 1:1 to existing widgets/salesData services. The Anthropic SDK loops tool calls until Claude has enough; every call is captured as evidence.
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-xl bg-amber-500/5 p-4 ring-1 ring-amber-500/20">
          <div className="flex gap-2.5">
            <svg className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <p className="text-[12px] leading-relaxed text-amber-100">
              <span className="font-bold">Why no RAG, no vector store?</span> Dashboards are structured data. Vector similarity over rows is the wrong primitive — you want aggregations and joins, not "rows like this one." Tool-use grounds Claude in <em>computed</em> answers, not retrieved snippets. Stronger grounding, fewer moving parts.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function FlowStep({ tone, label, sublabel, mono = false }: {
  tone: 'input' | 'context' | 'model' | 'tool' | 'output';
  label: string;
  sublabel: string;
  mono?: boolean;
}) {
  const toneStyles: Record<string, string> = {
    input:   'bg-slate-100 text-slate-700 ring-slate-200',
    context: 'bg-blue-50 text-blue-800 ring-blue-200',
    model:   'bg-accent/10 text-accent-dark ring-accent/30',
    tool:    'bg-amber-50 text-amber-800 ring-amber-200',
    output:  'bg-emerald-50 text-emerald-800 ring-emerald-200',
  };
  return (
    <div className={`flex min-w-[8.5rem] max-w-[11rem] flex-col rounded-lg px-3 py-2 ring-1 ${toneStyles[tone]}`}>
      <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">{tone === 'model' ? 'Model' : tone}</span>
      <span className={`mt-0.5 text-[12px] font-semibold leading-tight ${mono ? 'font-mono' : ''}`}>{label}</span>
      <span className="mt-0.5 text-[10.5px] leading-snug opacity-80">{sublabel}</span>
    </div>
  );
}

function FlowArrow({ loop }: { loop?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-0.5 px-0.5">
      <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
      </svg>
      {loop && (
        <span className="text-[9px] font-semibold uppercase tracking-wider text-amber-700">↺ loop</span>
      )}
    </div>
  );
}

function ToolUseFlowDiagram() {
  return (
    <div className="border-t border-slate-100 bg-gradient-to-br from-slate-50/60 to-white px-5 py-5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">Tool-use loop</p>
      <div className="flex flex-wrap items-stretch gap-1.5">
        <FlowStep tone="input" label="User asks" sublabel='"why is OTIF down?"' />
        <FlowArrow />
        <FlowStep tone="context" label="Snapshot context" sublabel="values, bands, annotations" />
        <FlowArrow />
        <FlowStep tone="model" label="Claude" sublabel="claude-sonnet-4" />
        <FlowArrow loop />
        <FlowStep tone="tool" label="Tool call" sublabel="get_top_n, get_annotations…" mono />
        <FlowArrow />
        <FlowStep tone="output" label="Final answer" sublabel="narrative + evidence" />
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
        Claude calls one or more tools per turn (up to 6 iterations). Each tool merges its filter argument over the dashboard's active globalFilters server-side, then dispatches to the existing widgets/salesData services. Tool failures convert to <code className="rounded bg-slate-100 px-1 text-[10px]">is_error</code> results so the loop survives.
      </p>
    </div>
  );
}

function ExampleToolCard({ name, args, summary }: { name: string; args: string; summary: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2.5 py-1.5 ring-1 ring-slate-200/60">
      <div className="font-mono text-[10.5px] text-slate-700 truncate">
        <span className="font-semibold text-navy-700">{name}</span>
        <span className="text-slate-500">({args})</span>
      </div>
      <div className="text-[10px] text-slate-500 truncate">{summary}</div>
    </div>
  );
}

function ExampleConversation() {
  return (
    <div className="border-t border-slate-100 bg-white px-5 py-5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">Example exchange</p>
      <div className="space-y-3 rounded-xl bg-slate-50/50 p-4 ring-1 ring-slate-200/60">
        {/* User message */}
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-2xl bg-navy-600 px-4 py-2.5 text-sm text-white">
            Why is supplier OTD down this month? Any known issues?
          </div>
        </div>

        {/* Assistant message + evidence */}
        <div className="flex justify-start">
          <div className="max-w-[85%] flex-1">
            <div className="rounded-2xl bg-white px-4 py-2.5 text-sm leading-relaxed text-slate-800 ring-1 ring-slate-200/60">
              Supplier OTD is at <strong>82.1%</strong> — YELLOW (you set green ≥ 90). Two drivers stand out: the{' '}
              <strong>APAC port congestion</strong> window (2025-11-08 → 2025-11-22) sits inside your filter range, and{' '}
              <strong>SUP-0042</strong> is the worst performer at 61.2% — well below the next-worst supplier (SUP-0118 at 74.8%). Both are flagged in the active annotations.
            </div>
            <div className="mt-2 rounded-xl border border-slate-200/70 bg-white/60 text-[11px]">
              <div className="flex items-center justify-between px-3 py-1.5 text-slate-500">
                <span className="inline-flex items-center gap-1.5">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992.007.082.007.165 0 .255-.008.378.137.75.43.991l1.004.827c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124-.072.044-.146.087-.22.128-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991-.007-.085-.007-.17 0-.255.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                  </svg>
                  <span className="font-semibold">2 tool calls</span>
                  <span className="text-slate-400">— get_annotations, get_top_n</span>
                </span>
              </div>
              <div className="space-y-1.5 border-t border-slate-200/60 px-2 py-2">
                <ExampleToolCard
                  name="get_annotations"
                  args="metric_id=supplier_otd"
                  summary="2 annotations affecting supplier_otd"
                />
                <ExampleToolCard
                  name="get_top_n"
                  args="metric_id=supplier_otd, dimension=supplier, n=5, ascending=true"
                  summary="top 5 supplier by supplier_otd (ascending)"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-3 text-[11px] italic leading-relaxed text-slate-500">
        Illustrative — your actual conversations call the same tools and render the same evidence cards in the live chat panel.
      </p>
    </div>
  );
}

function AgentCard({ agent, index, expanded, onToggle }: {
  agent: AgentMeta;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div id={`agent-${agent.id}`} className="rounded-xl bg-white ring-1 ring-slate-200 shadow-sm scroll-mt-24">
      <div className="flex items-start gap-4 p-5">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-accent/10 text-sm font-bold text-accent">
          {index + 1}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="text-base font-bold text-slate-900">{agent.name}</h3>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              {agent.model}
            </span>
            <code className="text-[10px] text-slate-400">{agent.promptSourceFile}</code>
          </div>
          <p className="mt-1 text-sm text-slate-600">{agent.tagline}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-px bg-slate-100 lg:grid-cols-3">
        <div className="bg-white p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Trigger</p>
          <p className="text-sm text-slate-700">{agent.trigger}</p>
        </div>
        <div className="bg-white p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Inputs</p>
          <ul className="space-y-1.5">
            {agent.inputs.map((input, i) => (
              <li key={i} className="flex gap-2 text-sm text-slate-700">
                <span className="text-slate-300 flex-shrink-0">·</span>
                <span>{input}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-white p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Outputs</p>
          <ul className="space-y-2">
            {agent.outputs.map((output, i) => (
              <li key={i} className="text-sm">
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[12px] font-semibold text-slate-800">
                  {output.label}
                </code>
                <p className="mt-0.5 text-xs text-slate-500">{output.when}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {agent.tools && agent.tools.length > 0 && (
        <div className="border-t border-slate-100 bg-slate-50/40 px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
            Tools ({agent.tools.length})
          </p>
          <ul className="space-y-1.5">
            {agent.tools.map((tool) => (
              <li key={tool.name} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <code className="rounded bg-white px-1.5 py-0.5 text-[12px] font-semibold text-navy-700 ring-1 ring-slate-200">
                  {tool.name}
                </code>
                <span className="text-xs text-slate-600">{tool.description}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {agent.id === 'chat' && <ToolUseFlowDiagram />}
      {agent.id === 'chat' && <ExampleConversation />}

      <div className="border-t border-slate-100 px-5 py-3">
        <button
          onClick={onToggle}
          className="flex items-center gap-2 text-xs font-semibold text-accent hover:text-accent-dark"
        >
          <svg
            className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
          {expanded ? 'Hide system prompt' : 'View system prompt'}
          <span className="text-slate-400 font-normal">({agent.systemPrompt.length.toLocaleString()} chars, live from server)</span>
        </button>
        {expanded && (
          <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-slate-900 p-4 text-[11px] leading-relaxed text-slate-100 whitespace-pre-wrap font-mono">
            {agent.systemPrompt}
          </pre>
        )}
      </div>

      {agent.nextAgents.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          <span className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">Followed by</span>
          {agent.nextAgents.map((nextId) => (
            <a
              key={nextId}
              href={`#agent-${nextId}`}
              className="rounded-full bg-slate-100 px-2.5 py-0.5 font-medium text-slate-700 hover:bg-slate-200"
            >
              {nextId}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export function HowItWorks() {
  const [agents, setAgents] = useState<AgentMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [focused, setFocused] = useState<string | null>(null);

  useEffect(() => {
    getAgents()
      .then((data) => {
        const ordered = AGENT_ORDER
          .map((id) => data.agents.find((a) => a.id === id))
          .filter((a): a is AgentMeta => Boolean(a));
        setAgents(ordered);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load agents'))
      .finally(() => setLoading(false));
  }, []);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const focusAgent = (id: string) => {
    setFocused(id);
    setExpanded((prev) => new Set(prev).add(id));
    requestAnimationFrame(() => {
      document.getElementById(`agent-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  if (loading) {
    return <div className="py-12 text-center text-sm text-slate-500">Loading agent metadata…</div>;
  }

  if (error) {
    return (
      <div className="rounded-xl bg-rose-50 p-5 text-sm text-rose-700 ring-1 ring-rose-200">
        Failed to load agent metadata: {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SemanticLayerHero />

      <div className="rounded-xl bg-white p-6 ring-1 ring-slate-200">
        <h2 className="text-lg font-bold text-slate-900">Five Claude agents power this app.</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600 leading-relaxed">
          Each one has a specific job. They cascade: onboarding gathers what the user oversees,
          interpret turns the transcript into a structured dashboard config, the dashboard chat
          mutates that config at runtime, refinement watches for patterns, and the studio authors
          brand-new KPIs when the catalog falls short. The system prompts below are loaded live
          from the server, so what you see is exactly what Claude sees.
        </p>
        <div className="mt-4">
          <FlowStrip agents={agents} focusedId={focused} onFocus={focusAgent} />
        </div>
      </div>

      <div className="space-y-4">
        {agents.map((agent, i) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            index={i}
            expanded={expanded.has(agent.id)}
            onToggle={() => toggle(agent.id)}
          />
        ))}
      </div>
    </div>
  );
}
