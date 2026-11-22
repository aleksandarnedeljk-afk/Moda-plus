import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { createStoreApiApp } from './server/app';
import { injectSeoIntoHtml } from './server/seo';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STORE_FILE = path.resolve(__dirname, 'data', 'store.json');

async function startServer() {
  const { app, engine } = createStoreApiApp(STORE_FILE);

  // Ensure initial backup on boot if none exists for today
  const existingBackups = engine.listBackups();
  const todayPrefix = new Date().toISOString().slice(0, 10);
  if (!existingBackups.some((b) => b.createdAt.startsWith(todayPrefix))) {
    engine.createBackupSnapshot('daily-auto');
  }

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });
    app.use(vite.middlewares);

    app.get('*', async (req, res, next) => {
      if (req.originalUrl.startsWith('/api/')) {
        next();
        return;
      }
      try {
        const templatePath = path.resolve(__dirname, 'index.html');
        const rawTemplate = fs.readFileSync(templatePath, 'utf-8');
        const transformed = await vite.transformIndexHtml(req.originalUrl, rawTemplate);
        const db = engine.readDb();
        const baseUrl =
          process.env.APP_URL || `${req.protocol}://${req.get('host') || 'localhost:3000'}`;
        const htmlWithSeo = injectSeoIntoHtml(transformed, req.originalUrl, db, baseUrl);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(htmlWithSeo);
      } catch (err) {
        next(err);
      }
    });
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath, { index: false }));
    app.get('*', (req, res) => {
      const indexHtml = fs.readFileSync(path.join(distPath, 'index.html'), 'utf-8');
      const db = engine.readDb();
      const baseUrl =
        process.env.APP_URL || `${req.protocol}://${req.get('host') || 'localhost:3000'}`;
      const htmlWithSeo = injectSeoIntoHtml(indexHtml, req.originalUrl, db, baseUrl);
      res.status(200).set({ 'Content-Type': 'text/html' }).end(htmlWithSeo);
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Atelier Outlet server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
