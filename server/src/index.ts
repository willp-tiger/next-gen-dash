import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import interpretRouter from './routes/interpret.js';
import dashboardRouter from './routes/dashboard.js';
import metricsRouter from './routes/metrics.js';
import refinementRouter from './routes/refinement.js';
import chatRouter from './routes/chat.js';
import dashboardChatRouter from './routes/dashboardChat.js';
import kpiStudioRouter from './routes/kpiStudio.js';
import kpisRouter from './routes/kpis.js';
import authRouter from './routes/auth.js';

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
app.use('/api/chat', chatRouter);
app.use('/api/dashboard-chat', dashboardChatRouter);
app.use('/api/kpi-studio', kpiStudioRouter);
app.use('/api/kpis', kpisRouter);
app.use('/api/auth', authRouter);

// Production: serve static frontend
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.resolve(process.cwd(), 'client/dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

export default app;
