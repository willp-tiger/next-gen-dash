import { Router } from 'express';
import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { InteractionEvent, RefinementSuggestion } from '../../../shared/types.js';
import { getConfig } from '../services/configStore.js';
import { AVAILABLE_METRICS } from '../../../shared/types.js';
import { buildRefinementPrompt } from '../prompts/refine.js';
import { generateRefinementSuggestion } from '../services/claude.js';

const router = Router();

// In-memory interaction log per user. Persists for the life of the server process — fine for
// demo, would need a real store for production refinement.
const interactionLogs = new Map<string, InteractionEvent[]>();

// Track dismissed/accepted suggestion keys so they don't reappear
// Key format: `${userId}:${type}:${metricId}`
const resolvedSuggestions = new Map<string, 'accepted' | 'dismissed'>();

function suggestionKey(userId: string, type: string, metricId: string): string {
  return `${userId}:${type}:${metricId}`;
}

/**
 * Extract metric ids referenced in a free-text chat message. Matches both the canonical id
 * (e.g. "supplier_otd") and a humanized form ("supplier otd"). Substring-only — no synonym
 * expansion, since false positives would defeat the point. Returns each id once.
 */
export function extractMetricMentions(message: string, candidates: readonly string[]): string[] {
  const lower = message.toLowerCase();
  const out = new Set<string>();
  for (const id of candidates) {
    const human = id.replace(/_/g, ' ');
    if (lower.includes(id) || lower.includes(human)) {
      out.add(id);
    }
  }
  return [...out];
}

/**
 * Record metric mentions from a chat message as 'mention' interaction events. Skips ids
 * already on the user's dashboard (no point flagging "you mentioned a tile you have"). Called
 * from the dashboardChat route after the chat response is generated.
 */
export function recordChatMentions(
  userId: string,
  message: string,
  dashboardMetricIds: Set<string>,
): void {
  const mentions = extractMetricMentions(message, AVAILABLE_METRICS);
  if (mentions.length === 0) return;
  const log = interactionLogs.get(userId) || [];
  const now = new Date().toISOString();
  for (const metricId of mentions) {
    if (dashboardMetricIds.has(metricId)) continue;
    log.push({ userId, metricId, action: 'mention', timestamp: now });
  }
  interactionLogs.set(userId, log);
}

router.post('/log', (req: Request, res: Response) => {
  const event = req.body as InteractionEvent;

  if (!event.userId || !event.metricId || !event.action) {
    res.status(400).json({ error: 'Missing required fields: userId, metricId, action' });
    return;
  }

  const normalized: InteractionEvent = {
    userId: event.userId,
    metricId: event.metricId,
    action: event.action,
    timestamp: event.timestamp || new Date().toISOString(),
    durationMs: event.durationMs,
  };

  const log = interactionLogs.get(event.userId) || [];
  log.push(normalized);
  interactionLogs.set(event.userId, log);

  res.json({ ok: true, totalEvents: log.length });
});

router.get('/suggestions/:userId', async (req: Request<{ userId: string }>, res: Response) => {
  const userId = req.params.userId as string;
  const log = interactionLogs.get(userId) || [];
  const config = getConfig(userId);

  const dashboardMetricIds = new Set(config?.metrics.map((m: { id: string }) => m.id) || []);
  const humanize = (id: string) => id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const suggestions: RefinementSuggestion[] = [];

  const totalInteractions = log.length;

  // === Real signals only ===
  //
  // The previous rule-based set was demo theater: "you haven't clicked X in 5 events"
  // mass-fired for every glanceable scorecard that nobody needs to drill into. Removed.
  // What's here now requires a human-validated signal (a pinned note, a chat mention) or
  // sustained engagement before surfacing — closer to "the system noticed something real"
  // than "the system is pretending to be smart."

  // Rule 1 — Promote: notes-as-importance.
  // If a user pinned 3+ notes on a tile, they care about it. Suggest giving it more visual
  // real estate (size: 'lg'). Skips tiles already 'lg'. Strongest signal we have because
  // notes are deliberate, costly actions — not passive scrolling.
  if (config) {
    for (const metric of config.metrics) {
      if (!metric.visible) continue;
      if (metric.size === 'lg') continue;
      const noteCount = metric.notes?.length ?? 0;
      if (noteCount >= 3) {
        suggestions.push({
          id: uuidv4(),
          userId,
          type: 'promote_metric',
          metricId: metric.id,
          reason: `You've pinned ${noteCount} notes on ${metric.label}. Want me to give it a bigger tile?`,
          suggestedChange: { id: metric.id, size: 'lg' },
          status: 'pending',
        });
      }
    }
  }

  // Rule 2 — Add: chat-mentions of off-dashboard metrics.
  // Counts 'mention' events recorded by recordChatMentions when the user references a
  // metric id in dashboard chat without explicitly adding it. 2+ mentions = the user is
  // thinking about it; offer to add. Real signal because mentions come from natural-
  // language conversation, not random clicks.
  const mentionCounts: Record<string, number> = {};
  for (const event of log) {
    if (event.action === 'mention') {
      mentionCounts[event.metricId] = (mentionCounts[event.metricId] || 0) + 1;
    }
  }
  for (const [metricId, count] of Object.entries(mentionCounts)) {
    if (dashboardMetricIds.has(metricId)) continue;
    if (count < 2) continue;
    suggestions.push({
      id: uuidv4(),
      userId,
      type: 'add_metric',
      metricId,
      reason: `You've mentioned ${humanize(metricId)} ${count} times in chat. Want me to add it to your dashboard?`,
      suggestedChange: {
        id: metricId,
        visible: true,
        size: 'md',
      },
      status: 'pending',
    });
  }

  // Rule 3 — Add: clicked off-dashboard metric (KPI Catalog browsing).
  // Currently dormant: logInteraction only fires from dashboard tiles, so off-dashboard
  // clicks don't exist yet. When KpiCatalog wires up logInteraction, this lights up.
  const clickCounts: Record<string, number> = {};
  for (const event of log) {
    if (event.action === 'click') {
      clickCounts[event.metricId] = (clickCounts[event.metricId] || 0) + 1;
    }
  }
  for (const metricId of AVAILABLE_METRICS) {
    if (dashboardMetricIds.has(metricId)) continue;
    if ((clickCounts[metricId] || 0) < 3) continue;
    suggestions.push({
      id: uuidv4(),
      userId,
      type: 'add_metric',
      metricId,
      reason: `You've opened ${humanize(metricId)} ${clickCounts[metricId]} times from the catalog. Add it to your dashboard?`,
      suggestedChange: { id: metricId, visible: true, size: 'md' },
      status: 'pending',
    });
  }

  // Filter out previously resolved suggestions
  const filtered = suggestions.filter(
    (s) => !resolvedSuggestions.has(suggestionKey(userId, s.type, s.metricId))
  );

  // If rule-based produced nothing but we have enough interactions, try AI
  if (filtered.length === 0 && totalInteractions >= 5 && config) {
    try {
      const prompt = buildRefinementPrompt(log, config.metrics);
      const aiResult = await generateRefinementSuggestion(prompt, 'Generate a suggestion based on the interaction data above.');
      if (aiResult && aiResult.type && aiResult.metricId) {
        const aiSuggestion: RefinementSuggestion = {
          id: uuidv4(),
          userId,
          type: aiResult.type as RefinementSuggestion['type'],
          metricId: aiResult.metricId as string,
          reason: (aiResult.reason as string) || 'AI-generated suggestion based on your usage patterns.',
          suggestedChange: (aiResult.suggestedChange as Record<string, unknown>) || {},
          status: 'pending',
        };
        const key = suggestionKey(userId, aiSuggestion.type, aiSuggestion.metricId);
        if (!resolvedSuggestions.has(key)) {
          filtered.push(aiSuggestion);
        }
      }
    } catch {
      // AI suggestion failed, continue with empty list
    }
  }

  res.json({ suggestions: filtered, totalInteractions });
});

// Accept or dismiss a suggestion
router.put('/suggestions/:id', (req: Request<{ id: string }>, res: Response) => {
  const { status } = req.body as { status: 'accepted' | 'dismissed' };

  if (!status || !['accepted', 'dismissed'].includes(status)) {
    res.status(400).json({ error: 'status must be "accepted" or "dismissed"' });
    return;
  }

  // Find the suggestion details from the request body
  const { userId, type, metricId } = req.body as {
    userId?: string;
    type?: string;
    metricId?: string;
    status: string;
  };

  if (userId && type && metricId) {
    resolvedSuggestions.set(suggestionKey(userId, type, metricId), status);
  }

  res.json({ id: req.params.id, status });
});

export default router;
