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
