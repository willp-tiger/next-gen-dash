import { Router } from 'express';
import type { Request, Response } from 'express';
import { isLookerConfigured } from '../services/looker.js';
import { chat, resetConversation, type AgentMessage } from '../services/lookerAgent.js';

const router = Router();

// Check if Looker is configured
router.get('/status', (_req: Request, res: Response) => {
  res.json({
    configured: isLookerConfigured(),
    env: {
      hasBaseUrl: !!process.env.LOOKER_BASE_URL,
      hasClientId: !!process.env.LOOKER_CLIENT_ID,
      hasClientSecret: !!process.env.LOOKER_CLIENT_SECRET,
    },
  });
});

// Chat with the Looker dashboard builder agent
router.post('/chat/:userId', async (req: Request<{ userId: string }>, res: Response) => {
  try {
    const { userId } = req.params;
    const { message } = req.body as { message: string };

    if (!message) {
      res.status(400).json({ error: 'Missing message' });
      return;
    }

    if (!isLookerConfigured()) {
      res.status(503).json({
        error: 'Looker not configured',
        message: 'Set LOOKER_BASE_URL, LOOKER_CLIENT_ID, and LOOKER_CLIENT_SECRET to enable Looker integration.',
      });
      return;
    }

    const result: AgentMessage = await chat(userId, message);

    res.json({
      message: result.text,
      toolCalls: result.toolCalls || [],
      dashboardUrl: result.dashboardUrl || null,
    });
  } catch (err: any) {
    console.error('Looker agent error:', err);
    res.status(500).json({ error: err.message || 'Looker agent failed' });
  }
});

// Reset conversation
router.delete('/chat/:userId', (req: Request<{ userId: string }>, res: Response) => {
  resetConversation(req.params.userId);
  res.json({ ok: true });
});

export default router;
