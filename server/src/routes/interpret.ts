import { Router } from 'express';
import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { InterpretRequest, DashboardConfig } from '../../../shared/types.js';
import { interpretPrompt } from '../services/claude.js';
import { setConfig } from '../services/configStore.js';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  try {
    const { userId, prompt } = req.body as InterpretRequest;

    if (!prompt || typeof prompt !== 'string') {
      res.status(400).json({ error: 'Missing or invalid "prompt" field' });
      return;
    }

    const resolvedUserId = userId || uuidv4();
    const result = await interpretPrompt(prompt);
    const now = new Date().toISOString();

    const config: DashboardConfig = {
      userId: resolvedUserId,
      createdAt: now,
      updatedAt: now,
      userPrompt: prompt,
      interpretation: {
        summary: result.summary,
        priorities: result.priorities,
      },
      metrics: result.metrics,
      layout: result.layout,
    };

    setConfig(resolvedUserId, config);

    res.json({ config });
  } catch (err) {
    console.error('Interpret error:', err);
    res.status(500).json({ error: 'Failed to interpret prompt' });
  }
});

export default router;
