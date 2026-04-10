import { Router } from 'express';
import type { Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { ONBOARDING_SYSTEM_PROMPT } from '../prompts/onboarding.js';

const router = Router();
const client = new Anthropic();
const MODEL = 'claude-sonnet-4-20250514';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// In-memory conversation history per user
const conversations = new Map<string, ChatMessage[]>();

router.post('/', async (req: Request, res: Response) => {
  try {
    const { userId, message } = req.body as { userId: string; message: string };

    if (!userId || !message) {
      res.status(400).json({ error: 'Missing userId or message' });
      return;
    }

    const history = conversations.get(userId) || [];
    history.push({ role: 'user', content: message });

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      system: ONBOARDING_SYSTEM_PROMPT,
      messages: history,
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    const reply = textBlock?.type === 'text' ? textBlock.text : '';

    history.push({ role: 'assistant', content: reply });
    conversations.set(userId, history);

    // Check if the assistant says it's ready
    const isReady = reply.includes('READY_TO_BUILD');

    // Build the full conversation transcript for the interpret step
    let transcript: string | undefined;
    if (isReady) {
      transcript = history
        .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n');
      conversations.delete(userId);
    }

    // Clean READY_TO_BUILD from the displayed message
    const displayReply = reply
      .replace(/READY_TO_BUILD\s*/, '')
      .replace(/\{[^}]*"understood"[^}]*\}/, '')
      .trim();

    res.json({
      reply: displayReply || "Great, I have everything I need. Let me build your dashboard!",
      isReady,
      transcript,
    });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Chat failed' });
  }
});

// Reset conversation
router.delete('/:userId', (req: Request<{ userId: string }>, res: Response) => {
  conversations.delete(req.params.userId);
  res.json({ ok: true });
});

export default router;
