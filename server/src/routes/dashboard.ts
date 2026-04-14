import { Router } from 'express';
import type { Request, Response } from 'express';
import type { DashboardConfig } from '../../../shared/types.js';
import { getConfig, setConfig } from '../services/configStore.js';

const router = Router();

router.get('/:userId', (req: Request<{ userId: string }>, res: Response) => {
  const userId = req.params.userId as string;
  const config = getConfig(userId);

  if (!config) {
    res.status(404).json({ error: 'No dashboard config found for this user' });
    return;
  }

  res.json({ config });
});

router.put('/:userId', (req: Request<{ userId: string }>, res: Response) => {
  const userId = req.params.userId as string;
  const update = req.body as Partial<DashboardConfig>;
  const existing = getConfig(userId);
  const now = new Date().toISOString();

  // Upsert: allow creating a config for a new userId (e.g. persona adoption).
  const updated: DashboardConfig = {
    ...(existing ?? {
      createdAt: now,
      userPrompt: '',
      interpretation: { summary: '', priorities: [] },
      metrics: [],
    }),
    ...update,
    userId,
    updatedAt: now,
  } as DashboardConfig;

  setConfig(userId, updated);
  res.json({ config: updated });
});

export default router;
