import { Router } from 'express';
import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { InteractionEvent, RefinementSuggestion } from '../../../shared/types.js';
import { getConfig } from '../services/configStore.js';
import { AVAILABLE_METRICS } from '../../../shared/types.js';
import { buildRefinementPrompt } from '../prompts/refine.js';
import { generateRefinementSuggestion } from '../services/claude.js';

const router = Router();

// In-memory interaction log per user
const interactionLogs = new Map<string, InteractionEvent[]>();

// Track dismissed/accepted suggestion keys so they don't reappear
// Key format: `${userId}:${type}:${metricId}`
const resolvedSuggestions = new Map<string, 'accepted' | 'dismissed'>();

function suggestionKey(userId: string, type: string, metricId: string): string {
  return `${userId}:${type}:${metricId}`;
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
  const suggestions: RefinementSuggestion[] = [];

  // Count interactions per metric
  const counts: Record<string, number> = {};
  for (const event of log) {
    counts[event.metricId] = (counts[event.metricId] || 0) + 1;
  }

  const totalInteractions = log.length;

  // Rule: if user clicked a non-dashboard metric more than 3 times, suggest adding it
  for (const metricId of AVAILABLE_METRICS) {
    if (!dashboardMetricIds.has(metricId) && (counts[metricId] || 0) > 3) {
      suggestions.push({
        id: uuidv4(),
        userId,
        type: 'add_metric',
        metricId,
        reason: `You have interacted with "${metricId}" ${counts[metricId]} times but it is not on your dashboard.`,
        suggestedChange: {
          id: metricId,
          visible: true,
          size: 'md',
        },
        status: 'pending',
      });
    }
  }

  // Rule: if a dashboard metric was never interacted with after 10+ total interactions, suggest removing
  if (totalInteractions >= 10) {
    for (const metricId of dashboardMetricIds) {
      if (!counts[metricId] || counts[metricId] === 0) {
        suggestions.push({
          id: uuidv4(),
          userId,
          type: 'remove_metric',
          metricId,
          reason: `"${metricId}" has had no interactions across ${totalInteractions} total events. Consider removing it to reduce clutter.`,
          suggestedChange: {
            id: metricId,
            visible: false,
          },
          status: 'pending',
        });
      }
    }
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
