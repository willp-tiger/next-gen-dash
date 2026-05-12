import { Router } from 'express';
import type { Request, Response } from 'express';
import { getPublishedKpis } from '../services/kpiStore.js';
import { getHealthSnapshot } from '../services/assertionRunner.js';
import { getAllKpiDefinitions, getAllVersions, getSchemaTables } from '../services/kpiDefinitionStore.js';

const router = Router();

router.get('/published', (_req: Request, res: Response) => {
  res.json({ kpis: getPublishedKpis() });
});

router.get('/catalog', async (_req: Request, res: Response) => {
  try {
    const [definitions, versions] = await Promise.all([
      getAllKpiDefinitions(),
      getAllVersions(),
    ]);
    const published = getPublishedKpis();
    const publishedIds = new Set(published.map(p => p.kpiId));
    const merged = [
      ...published.map(p => ({
        kpiId: p.kpiId, version: p.version, displayName: p.displayName,
        description: p.description, unit: p.unit, chartType: 'number',
        direction: p.direction, greenMax: p.thresholds.greenMax, yellowMax: p.thresholds.yellowMax,
        sqlLogic: p.sqlLogic, execSql: null, trendSql: null,
        sourceTables: ['production.sales.sales_orders'], grain: p.grain,
        dimensions: p.dimensions, materialization: 'live', schedule: null,
        owner: p.createdBy, status: p.status,
        createdAt: p.createdAt, createdBy: p.createdBy,
        changeReason: 'Published from KPI Authoring Studio',
        tags: ['studio-authored'],
      })),
      ...definitions.filter(d => !publishedIds.has(d.kpiId)),
    ];
    res.json({ definitions: merged, versions });
  } catch (err) {
    console.error('Catalog fetch failed:', err);
    res.status(500).json({ error: 'Failed to load KPI catalog' });
  }
});

router.get('/schema', (_req: Request, res: Response) => {
  res.json({ tables: getSchemaTables() });
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
