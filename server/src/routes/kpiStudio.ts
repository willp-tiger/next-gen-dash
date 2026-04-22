import { Router } from 'express';
import type { Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { KPI_STUDIO_SYSTEM_PROMPT } from '../prompts/kpiStudio.js';
import { classifyLLMError } from '../services/llmErrors.js';
import { publishKpi } from '../services/kpiStore.js';
import { validateKpiCandidate, VALIDATION_STAGES } from '../services/kpiValidation.js';
import type { CandidateKpi } from '../services/kpiValidation.js';

const router = Router();
const client = new Anthropic();
const MODEL = 'claude-sonnet-4-20250514';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const histories = new Map<string, ChatMessage[]>();

function extractJSON(text: string): string {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  const s = text;
  const start = s.indexOf('{');
  if (start === -1) return s.trim();
  let depth = 0, inStr = false, esc = false;
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
    const { message } = req.body as { message?: string };
    if (!message) {
      res.status(400).json({ error: 'Missing message' });
      return;
    }

    const history = histories.get(userId) || [];
    history.push({ role: 'user', content: message });

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: KPI_STUDIO_SYSTEM_PROMPT,
      messages: history,
    });

    const textBlock = response.content.find(b => b.type === 'text');
    const rawReply = textBlock?.type === 'text' ? textBlock.text : '';

    history.push({ role: 'assistant', content: rawReply });
    histories.set(userId, history.length > 20 ? history.slice(-20) : history);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let parsed: any;
    try {
      parsed = JSON.parse(extractJSON(rawReply));
    } catch (parseErr) {
      console.error('KPI studio JSON parse failed. Raw reply:', rawReply);
      console.error('Parse error:', parseErr);
      res.json({
        message: "I couldn't quite parse that. Could you rephrase what you'd like to measure?",
        candidate: null,
      });
      return;
    }

    const action: string | undefined = parsed.action;
    const replyMessage: string = parsed.message || (action === 'propose' ? 'Here is the candidate.' : '');
    const candidate = action === 'propose' && parsed.candidate ? parsed.candidate : null;

    res.json({ message: replyMessage, candidate });
  } catch (err) {
    console.error('KPI studio error:', err);
    const classified = classifyLLMError(err);
    if (classified) {
      res.status(503).json(classified);
      return;
    }
    res.status(500).json({ error: 'KPI studio chat failed' });
  }
});

router.delete('/:userId', (req: Request<{ userId: string }>, res: Response) => {
  histories.delete(req.params.userId);
  res.json({ ok: true });
});

interface PublishBody {
  kpiId: string;
  displayName: string;
  description: string;
  unit: string;
  direction: 'higher-is-better' | 'lower-is-better';
  sqlLogic: string;
  grain: string;
  dimensions: string[];
  thresholds: { greenMax: number; yellowMax: number };
}

router.post('/:userId/validate', async (req: Request<{ userId: string }>, res: Response) => {
  const candidate = req.body?.candidate as Partial<CandidateKpi> | undefined;
  if (!candidate || !candidate.sqlLogic || !candidate.unit) {
    res.status(400).json({ error: 'Missing candidate.sqlLogic or candidate.unit' });
    return;
  }
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Connection', 'keep-alive');
  try {
    for await (const stage of validateKpiCandidate(candidate as CandidateKpi)) {
      res.write(JSON.stringify(stage) + '\n');
      if (typeof (res as unknown as { flush?: () => void }).flush === 'function') {
        (res as unknown as { flush: () => void }).flush();
      }
    }
  } catch (err) {
    console.error('KPI validation pipeline error:', err);
    res.write(JSON.stringify({
      stage: 'Pipeline',
      status: 'fail',
      message: err instanceof Error ? err.message : 'Validation pipeline failed',
      durationMs: 0,
    }) + '\n');
  }
  res.end();
});

router.get('/stages', (_req: Request, res: Response) => {
  res.json({ stages: VALIDATION_STAGES });
});

router.post('/:userId/publish', (req: Request<{ userId: string }>, res: Response) => {
  const body = req.body as Partial<PublishBody>;
  const missing = ['kpiId', 'displayName', 'sqlLogic', 'unit', 'direction'].filter(k => !body[k as keyof PublishBody]);
  if (missing.length) {
    res.status(400).json({ error: `Missing fields: ${missing.join(', ')}` });
    return;
  }
  const kpi = publishKpi({
    kpiId: body.kpiId!,
    displayName: body.displayName!,
    description: body.description ?? '',
    unit: body.unit!,
    direction: body.direction!,
    sqlLogic: body.sqlLogic!,
    grain: body.grain ?? 'all-time',
    dimensions: body.dimensions ?? [],
    thresholds: body.thresholds ?? { greenMax: 0, yellowMax: 0 },
    createdBy: req.params.userId,
  });
  res.json({ ok: true, kpi });
});

export default router;
