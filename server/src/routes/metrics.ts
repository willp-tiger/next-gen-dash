import { Router } from 'express';
import type { Request, Response } from 'express';
import { generateSnapshot, getCanonicalConfig, generateCategoricalSnapshot, getAvailableFilters, getPersonaConfigs } from '../services/salesData.js';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const metricIdsParam = req.query.metricIds as string | undefined;
    const metricIds = metricIdsParam
      ? metricIdsParam.split(',').map((id) => id.trim())
      : undefined;

    const filters = {
      product_line: req.query.product_line as string | undefined,
      country: req.query.country as string | undefined,
      territory: req.query.territory as string | undefined,
      deal_size: req.query.deal_size as string | undefined,
      dateStart: req.query.dateStart as string | undefined,
      dateEnd: req.query.dateEnd as string | undefined,
    };

    const snapshot = await generateSnapshot(metricIds, filters);
    res.json(snapshot);
  } catch (err) {
    console.error('Metrics error:', err);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

router.get('/canonical', async (_req: Request, res: Response) => {
  try {
    const config = getCanonicalConfig();
    const metricIds = config.metrics.map((m) => m.id);
    const snapshot = await generateSnapshot(metricIds);
    res.json({ config, snapshot });
  } catch (err) {
    console.error('Canonical error:', err);
    res.status(500).json({ error: 'Failed to fetch canonical view' });
  }
});

router.get('/personas', (_req: Request, res: Response) => {
  const personas = getPersonaConfigs();
  res.json(personas);
});

router.get('/filters', async (_req: Request, res: Response) => {
  try {
    res.json(await getAvailableFilters());
  } catch (err) {
    console.error('Filters error:', err);
    res.status(500).json({ error: 'Failed to fetch filters' });
  }
});

router.get('/categorical', async (req: Request, res: Response) => {
  try {
    const metricIdsParam = req.query.metricIds as string | undefined;
    const metricIds = metricIdsParam
      ? metricIdsParam.split(',').map((id) => id.trim())
      : undefined;

    const filters = {
      product_line: req.query.product_line as string | undefined,
      country: req.query.country as string | undefined,
      territory: req.query.territory as string | undefined,
      deal_size: req.query.deal_size as string | undefined,
      dateStart: req.query.dateStart as string | undefined,
      dateEnd: req.query.dateEnd as string | undefined,
    };

    const snapshot = await generateCategoricalSnapshot(metricIds, filters);
    res.json(snapshot);
  } catch (err) {
    console.error('Categorical error:', err);
    res.status(500).json({ error: 'Failed to fetch categorical data' });
  }
});

export default router;
