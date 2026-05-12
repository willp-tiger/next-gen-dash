import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  generateSnapshot,
  getCanonicalConfig,
  generateCategoricalSnapshot,
  generateHeatmapBreakdown,
  getAvailableFilters,
  getPersonaConfigs,
} from '../services/salesData.js';
import type { FilterState } from '../../../shared/types.js';

const router = Router();

function parseFilters(req: Request): FilterState {
  const compareToRaw = req.query.compareTo as string | undefined;
  const compareTo = compareToRaw === 'prior_period' || compareToRaw === 'prior_year' || compareToRaw === 'none'
    ? compareToRaw
    : undefined;
  return {
    destination_region: req.query.destination_region as string | undefined,
    warehouse_id: req.query.warehouse_id as string | undefined,
    customer_segment: req.query.customer_segment as string | undefined,
    sku_category: req.query.sku_category as string | undefined,
    supplier_tier: req.query.supplier_tier as string | undefined,
    dateStart: req.query.dateStart as string | undefined,
    dateEnd: req.query.dateEnd as string | undefined,
    compareTo,
  };
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const metricIdsParam = req.query.metricIds as string | undefined;
    const metricIds = metricIdsParam
      ? metricIdsParam.split(',').map((id) => id.trim())
      : undefined;

    const snapshot = await generateSnapshot(metricIds, parseFilters(req));
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

    const snapshot = await generateCategoricalSnapshot(metricIds, parseFilters(req));
    res.json(snapshot);
  } catch (err) {
    console.error('Categorical error:', err);
    res.status(500).json({ error: 'Failed to fetch categorical data' });
  }
});

router.get('/heatmap', async (req: Request, res: Response) => {
  try {
    const row = (req.query.row as string | undefined) || 'category';
    const col = (req.query.col as string | undefined) || 'destination_region';
    const snapshot = await generateHeatmapBreakdown(row, col, parseFilters(req));
    res.json(snapshot);
  } catch (err) {
    console.error('Heatmap error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fetch heatmap data' });
  }
});

export default router;
