import path from 'node:path';
import express from 'express';

/**
 * Serves the built client (production). Mount after the API routes.
 *
 * - Files in `assets/` are fingerprinted by Vite, so they are cached forever.
 *   Everything else (notably index.html) is revalidated, so phones pick up a
 *   new build on reload.
 * - Unknown routes fall back to index.html (single-page app), except paths
 *   that look like files: a stale hashed bundle after a rebuild must 404, not
 *   get HTML served in place of JavaScript.
 */
export function serveBuiltClient(app: express.Express, clientDir: string): void {
  const root = path.resolve(clientDir);
  const assetsDir = path.join(root, 'assets') + path.sep;

  app.use(
    express.static(root, {
      setHeaders(res, filePath) {
        // Compare against the bundle's own assets/ folder, not any "assets"
        // segment of the absolute path (the project may live under one).
        if (filePath.startsWith(assetsDir)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }),
  );

  app.get('/{*path}', (req, res, next) => {
    if (path.extname(req.path) !== '') {
      next();
      return;
    }
    res.sendFile(path.join(root, 'index.html'));
  });
}
