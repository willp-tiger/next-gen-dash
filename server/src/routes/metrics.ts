import { Router } from 'express';
import type { Request, Response } from 'express';
import { generateSnapshot, getCanonicalConfig, generateCategoricalSnapshot, getAvailableFilters } from '../services/mockData.js';

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

router.get('/filters', (_req: Request, res: Response) => {
  res.json(getAvailableFilters());
});

router.get('/categorical', (req: Request, res: Response) => {
  const metricIdsParam = req.query.metricIds as string | undefined;
  const metricIds = metricIdsParam
    ? metricIdsParam.split(',').map((id) => id.trim())
    : undefined;

  const filters = {
    make: req.query.make as string | undefined,
    model: req.query.model as string | undefined,
    dateFrom: req.query.dateFrom as string | undefined,
    dateTo: req.query.dateTo as string | undefined,
  };

  const snapshot = generateCategoricalSnapshot(metricIds, filters);
  res.json(snapshot);
});

export default router;
