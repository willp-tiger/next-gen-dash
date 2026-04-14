import { Router } from 'express';
import type { Request, Response } from 'express';
import { getPublishedKpis } from '../services/kpiStore.js';

const router = Router();

router.get('/published', (_req: Request, res: Response) => {
  res.json({ kpis: getPublishedKpis() });
});

export default router;
