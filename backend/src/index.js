import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { passesRouter } from './routes/passes.js';
import { scansRouter } from './routes/scans.js';
import { adminRouter } from './routes/admin.js';
import { opsRouter } from './routes/ops.js';
import { webhooksRouter } from './routes/webhooks.js';
import { store } from './lib/store.js';

const app = express();
// Webhook needs the raw bytes for signature verification — mount before express.json()
app.use('/api/webhooks', express.raw({ type: 'application/json', limit: '1mb' }), webhooksRouter);

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : true }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('tiny'));
app.use('/api/', rateLimit({ windowMs: 60_000, max: 300 }));

app.get('/api/health', (_req, res) => res.json({ ok: true, mode: store.mode, time: new Date().toISOString() }));
app.use('/api/passes', passesRouter);
app.use('/api/scans', scansRouter);
app.use('/api/admin', adminRouter);
app.use('/api/ops', opsRouter);

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`[backend] :${port} store=${store.mode}`));
