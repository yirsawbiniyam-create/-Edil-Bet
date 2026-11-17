import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApiApp } from '../../server/apiApp';

const app = createApiApp();

export default function handler(req: IncomingMessage & { url?: string }, res: ServerResponse) {
  const qs = req.url?.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  req.url = `/api/football/results${qs}`;
  return app(req as never, res as never);
}
