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
  if (!existing) {
    res.status(404).json({ error: 'No dashboard config found for this user' });
    return;
  }

  const updated: DashboardConfig = {
    ...existing,
    ...update,
    userId,
    updatedAt: new Date().toISOString(),
  };

  setConfig(userId, updated);
  res.json({ config: updated });
});

export default router;
