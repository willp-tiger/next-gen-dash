import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  buildBulletSnapshot,
  generateCalendar,
  generateDrill,
  generateOtifWaterfall,
  generatePivot,
  generateShipmentFunnel,
  generateTimeseries,
  generateTopN,
  getAnnotations,
} from '../services/widgets.js';
import { generateSnapshot } from '../services/salesData.js';
import type { FilterState, PivotDimension, TopNDimension } from '../../../shared/types.js';

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

const VALID_TOP_N_DIMS: TopNDimension[] = ['supplier', 'customer', 'sku', 'warehouse', 'carrier', 'category'];

router.get('/waterfall', async (req: Request, res: Response) => {
  try {
    const source = (req.query.source as string | undefined) || 'otif_bridge';
    if (source !== 'otif_bridge') {
      res.status(400).json({ error: `Unsupported waterfall source: ${source}` });
      return;
    }
    const snapshot = await generateOtifWaterfall(parseFilters(req));
    res.json(snapshot);
  } catch (err) {
    console.error('Waterfall error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fetch waterfall' });
  }
});

router.get('/top-n', async (req: Request, res: Response) => {
  try {
    const metricId = req.query.metricId as string | undefined;
    const dimension = req.query.dimension as TopNDimension | undefined;
    const n = parseInt((req.query.n as string | undefined) || '10', 10);
    const ascending = (req.query.ascending as string | undefined) === 'true';
    if (!metricId || !dimension) {
      res.status(400).json({ error: 'metricId and dimension are required' });
      return;
    }
    if (!VALID_TOP_N_DIMS.includes(dimension)) {
      res.status(400).json({ error: `dimension must be one of: ${VALID_TOP_N_DIMS.join(', ')}` });
      return;
    }
    const snapshot = await generateTopN(metricId, dimension, n, ascending, parseFilters(req));
    res.json(snapshot);
  } catch (err) {
    console.error('TopN error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fetch top-N' });
  }
});

router.get('/bullet', async (req: Request, res: Response) => {
  try {
    const metricId = req.query.metricId as string | undefined;
    if (!metricId) {
      res.status(400).json({ error: 'metricId is required' });
      return;
    }
    // Bullet needs the current value — fetch it via the standard snapshot path so all
    // filters (including compareTo, dimensions, dates) apply consistently.
    const snap = await generateSnapshot([metricId], parseFilters(req));
    const actual = snap.metrics[metricId]?.current ?? 0;
    res.json(buildBulletSnapshot(metricId, actual));
  } catch (err) {
    console.error('Bullet error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fetch bullet' });
  }
});

router.get('/calendar', async (req: Request, res: Response) => {
  try {
    const source = (req.query.source as string | undefined) || 'shipments_per_day';
    if (source !== 'shipments_per_day' && source !== 'exceptions_per_day') {
      res.status(400).json({ error: `Unsupported calendar source: ${source}` });
      return;
    }
    const snapshot = await generateCalendar(source, parseFilters(req));
    res.json(snapshot);
  } catch (err) {
    console.error('Calendar error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fetch calendar' });
  }
});

router.get('/drill', async (req: Request, res: Response) => {
  try {
    const metricId = req.query.metricId as string | undefined;
    if (!metricId) {
      res.status(400).json({ error: 'metricId is required' });
      return;
    }
    const limit = parseInt((req.query.limit as string | undefined) || '50', 10);
    const snapshot = await generateDrill(metricId, parseFilters(req), Number.isFinite(limit) ? limit : 50);
    res.json(snapshot);
  } catch (err) {
    console.error('Drill error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fetch drill rows' });
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
