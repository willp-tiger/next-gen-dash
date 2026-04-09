import { Router } from 'express';
import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { InteractionEvent, RefinementSuggestion } from '../../../shared/types.js';
import { getConfig } from '../services/configStore.js';
import { AVAILABLE_METRICS } from '../../../shared/types.js';

const router = Router();

// In-memory interaction log per user
const interactionLogs = new Map<string, InteractionEvent[]>();

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

router.get('/suggestions/:userId', (req: Request<{ userId: string }>, res: Response) => {
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

  res.json({ suggestions, totalInteractions });
});

export default router;
