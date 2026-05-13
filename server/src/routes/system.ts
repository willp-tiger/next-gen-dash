import { Router } from 'express';
import type { Request, Response } from 'express';
import { ONBOARDING_SYSTEM_PROMPT } from '../prompts/onboarding.js';
import { buildInterpretPrompt } from '../prompts/interpret.js';
import { buildDashboardChatPrompt } from '../prompts/dashboardChat.js';
import { buildRefinementPrompt } from '../prompts/refine.js';
import { buildKpiStudioPrompt } from '../prompts/kpiStudio.js';

const router = Router();

const MODEL = 'claude-sonnet-4-20250514';

export interface AgentMeta {
  id: 'onboarding' | 'interpret' | 'chat' | 'refinement' | 'studio';
  name: string;
  tagline: string;
  trigger: string;
  model: string;
  inputs: string[];
  outputs: { label: string; when: string }[];
  systemPrompt: string;
  promptSourceFile: string;
  nextAgents: string[];
}

router.get('/agents', async (_req: Request, res: Response) => {
  try {
    const studioPrompt = await buildKpiStudioPrompt();

    const agents: AgentMeta[] = [
      {
        id: 'onboarding',
        name: 'Onboarding',
        tagline: 'Holds a short conversation to understand what the user oversees and cares about.',
        trigger: 'User signs in and has no saved dashboard.',
        model: MODEL,
        inputs: [
          'Multi-turn user messages (free text).',
          'Conversation history kept in-memory per user.',
        ],
        outputs: [
          { label: 'reply (1–3 sentences)', when: 'still gathering context' },
          { label: 'READY_TO_BUILD sentinel + summary JSON', when: 'enough info gathered (≤5 turns)' },
        ],
        systemPrompt: ONBOARDING_SYSTEM_PROMPT,
        promptSourceFile: 'server/src/prompts/onboarding.ts',
        nextAgents: ['interpret'],
      },
      {
        id: 'interpret',
        name: 'Interpret',
        tagline: 'One-shot: turns the onboarding transcript into a structured DashboardConfig.',
        trigger: 'Onboarding emits READY_TO_BUILD.',
        model: MODEL,
        inputs: [
          'Full onboarding transcript (as one user message).',
          'Live metric catalog (id / label / unit).',
        ],
        outputs: [
          { label: 'summary + priorities', when: 'always' },
          { label: 'metrics[] (id, chartType, thresholds, size, position, optional pivot/funnel/topN/calendar config)', when: 'always' },
          { label: 'layout (columns, sections)', when: 'always' },
          { label: 'fallback canonical config', when: 'JSON parse or validation fails' },
        ],
        systemPrompt: buildInterpretPrompt(),
        promptSourceFile: 'server/src/prompts/interpret.ts',
        nextAgents: ['chat', 'refinement'],
      },
      {
        id: 'chat',
        name: 'Dashboard Chat',
        tagline: 'Runtime mutator. Adds, edits, filters, interprets, or routes the user to the Studio.',
        trigger: 'User types in the dashboard chat panel.',
        model: MODEL,
        inputs: [
          'User message.',
          'Current dashboard state: real values, computed health (GREEN/YELLOW/RED), trend tails, comparisons vs prior period/year.',
          'Active annotations overlapping the filter window.',
          'Available metric catalog + Studio-authored list.',
        ],
        outputs: [
          { label: 'action: "add"', when: 'user requests a new tile (12 chart types supported)' },
          { label: 'action: "remove"', when: 'user removes a tile' },
          { label: 'action: "edit"', when: 'user changes threshold, chart type, label, size' },
          { label: 'action: "filter"', when: 'user filters by region/warehouse/segment/category/tier/date or compareTo' },
          { label: 'action: "author"', when: 'user asks for a metric not in catalog → routes to Studio' },
          { label: 'no action, message only', when: 'interpretation / explanation / Q&A grounded in dashboard state' },
        ],
        systemPrompt: buildDashboardChatPrompt(),
        promptSourceFile: 'server/src/prompts/dashboardChat.ts',
        nextAgents: ['studio'],
      },
      {
        id: 'refinement',
        name: 'Refinement',
        tagline: 'Observes interaction patterns and suggests one adjustment to the dashboard.',
        trigger: 'User asks for suggestions (or background poll over interaction log).',
        model: MODEL,
        inputs: [
          'Recent InteractionEvent log per user (clicks, hovers, dwell).',
          'Current metric config (ids, positions, sizes).',
          'List of available metrics not on dashboard.',
        ],
        outputs: [
          { label: 'add_metric', when: 'user shows interest in a metric they don\'t have' },
          { label: 'promote_metric', when: 'a frequently-touched metric deserves more real estate' },
          { label: 'adjust_threshold', when: 'usage suggests thresholds are mis-tuned' },
          { label: 'remove_metric', when: 'a metric has near-zero interactions' },
        ],
        systemPrompt: buildRefinementPrompt([], []),
        promptSourceFile: 'server/src/prompts/refine.ts',
        nextAgents: [],
      },
      {
        id: 'studio',
        name: 'KPI Studio',
        tagline: 'Authors brand-new KPIs against the Unity Catalog — clarifying, then proposing SQL.',
        trigger: 'User opens KPI Studio, or Dashboard Chat routes an unknown-metric request here.',
        model: MODEL,
        inputs: [
          'Multi-turn user messages.',
          'Unity Catalog schema (tables, columns, types).',
          'Existing kpiId list (to avoid collisions).',
        ],
        outputs: [
          { label: 'action: "reply" — clarifying question', when: 'user intent is not specific enough yet' },
          { label: 'action: "propose" — candidate KPI (displayName, kpiId, unit, direction, SQL, grain, dimensions, thresholds)', when: 'enough specificity to draft' },
        ],
        systemPrompt: studioPrompt,
        promptSourceFile: 'server/src/prompts/kpiStudio.ts',
        nextAgents: [],
      },
    ];

    res.json({ agents });
  } catch (err) {
    console.error('Failed to build agent metadata:', err);
    res.status(500).json({ error: 'Failed to load agent metadata' });
  }
});

export default router;
