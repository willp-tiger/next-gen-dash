import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  generatePivot,
  generateShipmentFunnel,
  generateTimeseries,
  getAnnotations,
} from '../services/widgets.js';
import type { FilterState, PivotDimension } from '../../../shared/types.js';

const router = Router();

const VALID_DIMS: PivotDimension[] = [
  'category', 'destination_region', 'warehouse_id',
  'customer_segment', 'abc_class', 'supplier_tier',
];

function parseFilters(req: Request): FilterState {
  return {
    destination_region: req.query.destination_region as string | undefined,
    warehouse_id: req.query.warehouse_id as string | undefined,
    customer_segment: req.query.customer_segment as string | undefined,
    sku_category: req.query.sku_category as string | undefined,
    supplier_tier: req.query.supplier_tier as string | undefined,
    dateStart: req.query.dateStart as string | undefined,
    dateEnd: req.query.dateEnd as string | undefined,
  };
}

router.get('/annotations', (_req: Request, res: Response) => {
  res.json({ annotations: getAnnotations() });
});

router.get('/pivot', async (req: Request, res: Response) => {
  try {
    const metricId = req.query.metricId as string | undefined;
    const rowDim = req.query.rowDim as PivotDimension | undefined;
    const colDim = req.query.colDim as PivotDimension | undefined;
    if (!metricId || !rowDim || !colDim) {
      res.status(400).json({ error: 'metricId, rowDim, colDim are all required' });
      return;
    }
    if (!VALID_DIMS.includes(rowDim) || !VALID_DIMS.includes(colDim)) {
      res.status(400).json({ error: `rowDim/colDim must be one of: ${VALID_DIMS.join(', ')}` });
      return;
    }
    const snapshot = await generatePivot(metricId, rowDim, colDim, parseFilters(req));
    res.json(snapshot);
  } catch (err) {
    console.error('Pivot error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fetch pivot' });
  }
});

router.get('/timeseries', async (req: Request, res: Response) => {
  try {
    const metricId = req.query.metricId as string | undefined;
    const grainRaw = (req.query.grain as string | undefined) || 'weekly';
    if (!metricId) {
      res.status(400).json({ error: 'metricId is required' });
      return;
    }
    if (grainRaw !== 'daily' && grainRaw !== 'weekly' && grainRaw !== 'monthly') {
      res.status(400).json({ error: 'grain must be daily | weekly | monthly' });
      return;
    }
    const snapshot = await generateTimeseries(metricId, grainRaw, parseFilters(req));
    res.json(snapshot);
  } catch (err) {
    console.error('Timeseries error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fetch timeseries' });
  }
});

router.get('/funnel', async (req: Request, res: Response) => {
  try {
    const source = (req.query.source as string | undefined) || 'shipment_lifecycle';
    if (source !== 'shipment_lifecycle') {
      res.status(400).json({ error: `Unsupported funnel source: ${source}` });
      return;
    }
    const snapshot = await generateShipmentFunnel(parseFilters(req));
    res.json(snapshot);
  } catch (err) {
    console.error('Funnel error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fetch funnel' });
  }
});

export default router;
