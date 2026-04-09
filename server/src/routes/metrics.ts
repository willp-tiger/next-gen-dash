import { Router } from 'express';
import type { Request, Response } from 'express';
import { generateSnapshot, getCanonicalConfig } from '../services/mockData.js';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const metricIdsParam = req.query.metricIds as string | undefined;
  const metricIds = metricIdsParam
    ? metricIdsParam.split(',').map((id) => id.trim())
    : undefined;

  const snapshot = generateSnapshot(metricIds);
  res.json(snapshot);
});

router.get('/canonical', (_req: Request, res: Response) => {
  const config = getCanonicalConfig();
  const metricIds = config.metrics.map((m) => m.id);
  const snapshot = generateSnapshot(metricIds);

  res.json({ config, snapshot });
});

export default router;
