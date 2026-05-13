import { Router } from 'express';
import type { Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { buildDashboardChatPrompt } from '../prompts/dashboardChat.js';
import { getConfig, setConfig } from '../services/configStore.js';
import { classifyLLMError } from '../services/llmErrors.js';
import { getPublishedKpis } from '../services/kpiStore.js';
import { buildChatSnapshot } from '../services/chatSnapshot.js';
import { CHAT_TOOLS, executeChatTool } from '../services/chatTools.js';
import { recordChatMentions } from './refinement.js';
import type { DashboardConfig, FilterState, MetricConfig, ToolEvidence } from '../../../shared/types.js';

const router = Router();
const client = new Anthropic();
const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOOL_ITERATIONS = 6;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Conversation history per user for multi-turn context. We persist only the user-visible
// turns (the user's contextMessage and the assistant's final text), not the intermediate
// tool_use/tool_result round-trips — those would balloon the context budget on every turn.
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

/**
 * Run one chat turn with tool-use enabled. Loops over tool_use round-trips up to
 * MAX_TOOL_ITERATIONS, collecting evidence as it goes. Returns the assistant's final text
 * block and the ordered evidence list. Tool execution failures are converted to tool_result
 * error payloads so the model can adapt rather than crashing the turn.
 */
async function runChatTurn(
  userMessage: string,
  history: ChatMessage[],
  globalFilters: FilterState | undefined,
): Promise<{ finalText: string; evidence: ToolEvidence[] }> {
  const evidence: ToolEvidence[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [
    ...history.map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: userMessage },
  ];

  let finalText = '';

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: buildDashboardChatPrompt(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: CHAT_TOOLS as any,
      messages,
    });

    if (response.stop_reason === 'tool_use') {
      // Persist the assistant's tool_use turn into the loop history so subsequent calls see it.
      messages.push({ role: 'assistant', content: response.content });

      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
      const toolResults = await Promise.all(toolUseBlocks.map(async (block) => {
        if (block.type !== 'tool_use') return null;
        try {
          const { result, summary } = await executeChatTool(block.name, block.input, globalFilters);
          evidence.push({
            toolName: block.name,
            toolInput: block.input as Record<string, unknown>,
            toolResult: result,
            summary,
          });
          return {
            type: 'tool_result' as const,
            tool_use_id: block.id,
            content: JSON.stringify(result),
          };
        } catch (toolErr) {
          const errMsg = toolErr instanceof Error ? toolErr.message : String(toolErr);
          console.error(`Tool ${block.name} failed:`, toolErr);
          evidence.push({
            toolName: block.name,
            toolInput: block.input as Record<string, unknown>,
            toolResult: { error: errMsg },
            summary: `error: ${errMsg.slice(0, 80)}`,
          });
          return {
            type: 'tool_result' as const,
            tool_use_id: block.id,
            content: JSON.stringify({ error: errMsg }),
            is_error: true,
          };
        }
      }));

      messages.push({ role: 'user', content: toolResults.filter(Boolean) });
      continue;
    }

    // No more tool_use — extract the final text block.
    const textBlock = response.content.find(b => b.type === 'text');
    finalText = textBlock && textBlock.type === 'text' ? textBlock.text : '';
    break;
  }

  return { finalText, evidence };
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

    // Build context about current dashboard — config shape (for mutation intents) plus a grounded
    // snapshot of current values + active annotations (for interpretation intents).
    const currentMetrics = config.metrics
      .filter(m => m.visible)
      .map(m => `- ${m.label} (${m.id}): ${m.chartType}, size=${m.size}, thresholds green=${m.thresholds.green.max} yellow=${m.thresholds.yellow.max} ${m.thresholds.direction}`)
      .join('\n');

    const published = getPublishedKpis();
    const publishedSection = published.length > 0
      ? `\n\nAdditional KPIs the user has authored in the Studio (also addable via "add" action):\n${published.map(k => `- ${k.displayName} (${k.kpiId}) — ${k.unit}, ${k.direction}. ${k.description}`).join('\n')}`
      : '';

    // Grounded snapshot — current values, threshold status, recent trend, comparison, and
    // active annotations intersecting the filter window. Failures are non-fatal; the chat
    // still works for mutation intents without it.
    let snapshotBlock = '';
    try {
      snapshotBlock = `\n\n${await buildChatSnapshot(config)}`;
    } catch (snapErr) {
      console.warn('buildChatSnapshot failed; continuing without grounded snapshot:', snapErr);
    }

    const contextMessage = `Current dashboard metrics (config shape):\n${currentMetrics}${publishedSection}${snapshotBlock}\n\nUser request: ${message}`;

    const history = chatHistories.get(userId) || [];
    const { finalText, evidence } = await runChatTurn(contextMessage, history, config.globalFilters);

    history.push({ role: 'user', content: contextMessage });
    history.push({ role: 'assistant', content: finalText });
    // Keep only the last 10 exchanges to prevent context bloat.
    if (history.length > 20) {
      chatHistories.set(userId, history.slice(-20));
    } else {
      chatHistories.set(userId, history);
    }

    // Parse the final assistant text. Mutation intents respond with JSON containing an "action";
    // interpretation intents may respond with prose. Be lenient — only treat the response as
    // a structured action when JSON parse succeeds AND it has an "action" or "message" field.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let parsed: any = null;
    try {
      parsed = JSON.parse(extractJSON(finalText));
      if (typeof parsed !== 'object' || parsed === null) parsed = null;
    } catch {
      parsed = null;
    }
    const isStructured = parsed !== null && ('action' in parsed || 'message' in parsed);

    const replyMessage: string = isStructured
      ? (parsed.message || finalText.trim() || 'Done.')
      : finalText.trim() || 'Done.';
    const action: string | undefined = isStructured ? parsed.action : undefined;
    let updatedConfig: DashboardConfig | null = null;
    let authorPhrase: string | null = null;

    if (action === 'add' && parsed.metric) {
      const newMetric: MetricConfig = {
        ...parsed.metric,
        position: config.metrics.length,
        visible: true,
      };
      // For widgets that can be added multiple times with different configurations, key the duplicate
      // check on the discriminating field (breakdownBy, pivot dims, etc.) so users can add several variants.
      const isDuplicate = (() => {
        if (newMetric.chartType === 'breakdown') {
          return config.metrics.find(m => m.id === newMetric.id && m.chartType === 'breakdown' && m.breakdownBy === newMetric.breakdownBy);
        }
        if (newMetric.chartType === 'pivot') {
          return config.metrics.find(m => m.id === newMetric.id && m.chartType === 'pivot'
            && m.pivot?.rowDim === newMetric.pivot?.rowDim && m.pivot?.colDim === newMetric.pivot?.colDim);
        }
        if (newMetric.chartType === 'funnel') {
          return config.metrics.find(m => m.chartType === 'funnel' && m.funnel?.source === newMetric.funnel?.source);
        }
        if (newMetric.chartType === 'waterfall') {
          return config.metrics.find(m => m.chartType === 'waterfall' && m.waterfall?.source === newMetric.waterfall?.source);
        }
        if (newMetric.chartType === 'top_n') {
          return config.metrics.find(m => m.id === newMetric.id && m.chartType === 'top_n'
            && m.topN?.dimension === newMetric.topN?.dimension && m.topN?.ascending === newMetric.topN?.ascending);
        }
        if (newMetric.chartType === 'calendar_heatmap') {
          return config.metrics.find(m => m.chartType === 'calendar_heatmap' && m.calendar?.source === newMetric.calendar?.source);
        }
        if (newMetric.chartType === 'annotated_line') {
          return config.metrics.find(m => m.id === newMetric.id && m.chartType === 'annotated_line');
        }
        return config.metrics.find(m => m.id === newMetric.id
          && m.chartType === newMetric.chartType
          && !['breakdown', 'pivot', 'funnel', 'annotated_line', 'waterfall', 'top_n', 'calendar_heatmap'].includes(m.chartType));
      })();
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
    } else if (action === 'author') {
      const phrase = typeof parsed.authorPhrase === 'string' && parsed.authorPhrase.trim().length > 0
        ? parsed.authorPhrase.trim()
        : message.trim();
      authorPhrase = phrase;
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

    // Record off-dashboard metric mentions for refinement signal. We use the post-action
    // config snapshot so a metric the user just asked to ADD doesn't get flagged as "off
    // dashboard" on its own turn. Only fires for non-add/non-author intents — those have
    // already produced an action so a "want me to add it?" suggestion would be redundant.
    if (action !== 'add' && action !== 'author') {
      const currentIds = new Set((updatedConfig ?? config).metrics.map(m => m.id));
      recordChatMentions(userId, message, currentIds);
    }

    res.json({
      message: replyMessage,
      action: action || null,
      config: updatedConfig,
      authorPhrase,
      evidence,
    });
  } catch (err) {
    console.error('Dashboard chat error:', err);
    const classified = classifyLLMError(err);
    if (classified) {
      res.status(503).json(classified);
      return;
    }
    res.status(500).json({ error: 'Dashboard chat failed' });
  }
});

// Reset chat history
router.delete('/:userId', (req: Request<{ userId: string }>, res: Response) => {
  chatHistories.delete(req.params.userId);
  res.json({ ok: true });
});

export default router;
