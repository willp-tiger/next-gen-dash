import { Router } from 'express';
import type { Request, Response } from 'express';
import { getPublishedKpis } from '../services/kpiStore.js';
import { getHealthSnapshot } from '../services/assertionRunner.js';

const router = Router();

router.get('/published', (_req: Request, res: Response) => {
  res.json({ kpis: getPublishedKpis() });
});

router.get('/health', async (_req: Request, res: Response) => {
  try {
    const snapshot = await getHealthSnapshot();
    res.json(snapshot);
  } catch (err) {
    console.error('Health check failed:', err);
    res.status(500).json({ error: 'Health check failed' });
  }
});

router.post('/health/run', async (_req: Request, res: Response) => {
  try {
    const snapshot = await getHealthSnapshot(true);
    res.json(snapshot);
  } catch (err) {
    console.error('Health check run failed:', err);
    res.status(500).json({ error: 'Health check run failed' });
  }
});

export default router;
