import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import omniSaveHandler from './api/omnisave.js';

async function attachOmniSaveApi(server) {
  server.middlewares.use('/api/omnisave', (req, res, next) => {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.end('Method not allowed.');
      return;
    }

    (async () => {
      try {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const rawBody = Buffer.concat(chunks).toString('utf8');
        req.body = rawBody ? JSON.parse(rawBody) : {};
        await omniSaveHandler(req, res);
      } catch {
        if (!res.headersSent) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: 'Invalid OmniSave request.' }));
        }
      }
    })();
  });
}

const omniSaveDevPlugin = {
  name: 'moovie-omnisave-api',
  configureServer: attachOmniSaveApi,
  configurePreviewServer: attachOmniSaveApi,
};

export default defineConfig({
  plugins: [react(), omniSaveDevPlugin],
  base: './',
});