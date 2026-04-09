import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import interpretRouter from './routes/interpret.js';
import dashboardRouter from './routes/dashboard.js';
import metricsRouter from './routes/metrics.js';
import refinementRouter from './routes/refinement.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Middleware
app.use(cors());
app.use(express.json());

// API routes
app.use('/api/interpret', interpretRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/metrics', metricsRouter);
app.use('/api/refinement', refinementRouter);

// Production: serve static frontend
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.resolve(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

export default app;
