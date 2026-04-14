import { Router } from 'express';
import type { Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { KPI_STUDIO_SYSTEM_PROMPT } from '../prompts/kpiStudio.js';
import { classifyLLMError } from '../services/llmErrors.js';

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

export default router;
