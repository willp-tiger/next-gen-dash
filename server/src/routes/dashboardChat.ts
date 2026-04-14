import { Router } from 'express';
import type { Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { DASHBOARD_CHAT_SYSTEM_PROMPT } from '../prompts/dashboardChat.js';
import { getConfig, setConfig } from '../services/configStore.js';
import type { DashboardConfig, MetricConfig } from '../../../shared/types.js';

const router = Router();
const client = new Anthropic();
const MODEL = 'claude-sonnet-4-20250514';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Conversation history per user for multi-turn context
const chatHistories = new Map<string, ChatMessage[]>();

function extractJSON(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  // Walk the string to find the first balanced {...} block, respecting strings.
  const s = text;
  const start = s.indexOf('{');
  if (start === -1) return s.trim();
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return s.trim();
}

router.post('/:userId', async (req: Request<{ userId: string }>, res: Response) => {
  try {
    const { userId } = req.params;
    const { message } = req.body as { message: string };

    if (!message) {
      res.status(400).json({ error: 'Missing message' });
      return;
    }

    const config = getConfig(userId);
    if (!config) {
      res.status(404).json({ error: 'No dashboard config found' });
      return;
    }

    // Build context about current dashboard
    const currentMetrics = config.metrics
      .filter(m => m.visible)
      .map(m => `- ${m.label} (${m.id}): ${m.chartType}, size=${m.size}, thresholds green=${m.thresholds.green.max} yellow=${m.thresholds.yellow.max} ${m.thresholds.direction}`)
      .join('\n');

    const contextMessage = `Current dashboard metrics:\n${currentMetrics}\n\nUser request: ${message}`;

    // Get or create chat history
    const history = chatHistories.get(userId) || [];
    history.push({ role: 'user', content: contextMessage });

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: DASHBOARD_CHAT_SYSTEM_PROMPT,
      messages: history,
    });

    const textBlock = response.content.find(b => b.type === 'text');
    const rawReply = textBlock?.type === 'text' ? textBlock.text : '';

    history.push({ role: 'assistant', content: rawReply });
    // Keep only last 10 exchanges to prevent context bloat
    if (history.length > 20) {
      chatHistories.set(userId, history.slice(-20));
    } else {
      chatHistories.set(userId, history);
    }

    // Parse the response
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let parsed: any;
    try {
      parsed = JSON.parse(extractJSON(rawReply));
    } catch (parseErr) {
      console.error('Dashboard chat JSON parse failed. Raw reply:', rawReply);
      console.error('Parse error:', parseErr);
      res.json({
        message: "I couldn't quite parse that. Could you rephrase — for example, \"filter to Q1 2004\" or \"show only Classic Cars\"?",
        action: null,
        config: null,
      });
      return;
    }
    const replyMessage: string = parsed.message || 'Done.';
    const action: string | undefined = parsed.action;
    let updatedConfig: DashboardConfig | null = null;

    if (action === 'add' && parsed.metric) {
      const newMetric: MetricConfig = {
        ...parsed.metric,
        position: config.metrics.length,
        visible: true,
      };
      // For breakdown charts, allow multiple (different breakdownBy dimensions)
      const isDuplicate = newMetric.chartType === 'breakdown'
        ? config.metrics.find(m => m.id === newMetric.id && m.breakdownBy === newMetric.breakdownBy)
        : config.metrics.find(m => m.id === newMetric.id && m.chartType !== 'breakdown');
      if (!isDuplicate) {
        config.metrics.push(newMetric);
        config.updatedAt = new Date().toISOString();
        setConfig(userId, config);
        updatedConfig = config;
      }
    } else if (action === 'filter') {
      if (parsed.clear) {
        config.globalFilters = {};
        for (const metric of config.metrics) {
          if (metric.chartType === 'breakdown') metric.filterBy = {};
        }
      } else if (parsed.filterBy) {
        // Drop null/undefined keys so we only merge explicit values
        const incoming: Record<string, string> = {};
        for (const [k, v] of Object.entries(parsed.filterBy)) {
          if (v !== null && v !== undefined && v !== '') incoming[k] = String(v);
        }
        config.globalFilters = { ...config.globalFilters, ...incoming };
        for (const metric of config.metrics) {
          if (metric.chartType === 'breakdown') {
            metric.filterBy = { ...metric.filterBy, ...incoming };
          }
        }
      }
      config.updatedAt = new Date().toISOString();
      setConfig(userId, config);
      updatedConfig = config;
    } else if (action === 'remove' && parsed.metricId) {
      const idx = config.metrics.findIndex(m => m.id === parsed.metricId);
      if (idx !== -1) {
        config.metrics.splice(idx, 1);
        // Reindex positions
        config.metrics.forEach((m, i) => { m.position = i; });
        config.updatedAt = new Date().toISOString();
        setConfig(userId, config);
        updatedConfig = config;
      }
    } else if (action === 'edit' && parsed.metricId && parsed.changes) {
      const metric = config.metrics.find(m => m.id === parsed.metricId);
      if (metric) {
        if (parsed.changes.label) metric.label = parsed.changes.label;
        if (parsed.changes.chartType) metric.chartType = parsed.changes.chartType;
        if (parsed.changes.size) metric.size = parsed.changes.size;
        if (parsed.changes.thresholds) {
          metric.thresholds = { ...metric.thresholds, ...parsed.changes.thresholds };
        }
        config.updatedAt = new Date().toISOString();
        setConfig(userId, config);
        updatedConfig = config;
      }
    }

    res.json({
      message: replyMessage,
      action: action || null,
      config: updatedConfig,
    });
  } catch (err) {
    console.error('Dashboard chat error:', err);
    res.status(500).json({ error: 'Dashboard chat failed' });
  }
});

// Reset chat history
router.delete('/:userId', (req: Request<{ userId: string }>, res: Response) => {
  chatHistories.delete(req.params.userId);
  res.json({ ok: true });
});

export default router;
