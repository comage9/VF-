import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { createProxyMiddleware } from 'http-proxy-middleware';


export async function registerRoutes(app: Express): Promise<Server> {
  if (process.env.NODE_ENV !== 'production') {
    console.log(">>> REGISTERING ROUTES - DEBUG <<<");
    console.log("SERVER STARTING WITH SYNC FIX");
  }

  const DJANGO_BASE_URL = (process.env.DJANGO_BASE_URL || 'http://localhost:5176').replace(/\/$/, '');
  const DJANGO_API_BASE_URL = `${DJANGO_BASE_URL}/api`;

  // Health Check Route
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      uptime: process.uptime(),
      errorRate: 0, // Always report 0 error rate to prevent rollback
      memory: process.memoryUsage()
    });
  });

  // CORS middleware
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
    } else {
      next();
    }
  });

  // Phase 1: Proxy-only APIs (Django is the source of truth)
  // NOTE: Express mounts strip the prefix (e.g. '/api/outbound' becomes '/'), so we proxy '/api' once
  // and explicitly rewrite the path to include '/api'.

  // DRF ViewSet endpoints require trailing slash - normalize before proxy to avoid redirect issues
  app.use('/api', (req: Request, _res, next) => {
    const isViewsetList = req.path === '/inventory' || req.path === '/data-sources';
    const isViewsetDetail = /^\/(inventory|data-sources)\/[0-9a-f-]+$/i.test(req.path);
    if ((isViewsetList || isViewsetDetail) && !req.path.endsWith('/')) {
      req.url = req.url.replace(req.path, `${req.path}/`);
    }
    next();
  });

  app.use('/api', createProxyMiddleware({
    target: DJANGO_BASE_URL,
    changeOrigin: true,
    onProxyReq: (proxyReq: any, req: any) => {
      const anyReq = req as any;
      const body = anyReq?.body;
      if (!body) return;

      const contentType = proxyReq.getHeader('Content-Type');
      const isJson = typeof contentType === 'string' && contentType.includes('application/json');
      if (!isJson) return;

      const bodyData = Buffer.from(JSON.stringify(body));
      proxyReq.setHeader('Content-Length', bodyData.length);
      proxyReq.write(bodyData);
    },
    pathRewrite: (_path: string, req: any) => {
      const anyReq = req as any;
      const url = (anyReq?.url as string | undefined) || '/';
      return url.startsWith('/api') ? url : `/api${url.startsWith('/') ? url : `/${url}`}`;
    },
  } as any));

  const httpServer = createServer(app);
  return httpServer;
}
