import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { existsSync, readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { fetchAllJobs } from './server/feishu.ts'
import type { JobPosition } from './shared/jobs.ts'
import chatHandler from './api/chat.ts'
import healthHandler from './api/health.ts'
import rankHandler from './api/rank.ts'

// 把 Vercel 的 (req, res) handler 适配到 vite dev 的 node 中间件上
type VercelLikeHandler = (req: any, res: any) => any

function devApi(pathname: string, handler: VercelLikeHandler): Plugin {
  return {
    name: `dev-api${pathname}`,
    configureServer(server) {
      server.middlewares.use(pathname, async (req: IncomingMessage, res: ServerResponse) => {
        const chunks: Buffer[] = []
        for await (const chunk of req) chunks.push(chunk as Buffer)
        const raw = Buffer.concat(chunks).toString('utf-8')

        let body: unknown
        if (raw) {
          try {
            body = JSON.parse(raw)
          } catch {
            body = undefined
          }
        }

        const vres = {
          statusCode: 200,
          setHeader(k: string, v: string) {
            res.setHeader(k, v)
            return vres
          },
          status(code: number) {
            vres.statusCode = code
            return vres
          },
          json(payload: unknown) {
            res.statusCode = vres.statusCode
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(payload))
            return vres
          },
          send(payload: unknown) {
            res.statusCode = vres.statusCode
            res.end(typeof payload === 'string' ? payload : JSON.stringify(payload))
            return vres
          },
          end() {
            res.end()
            return vres
          },
        }

        await handler(
          { ...req, method: req.method, headers: req.headers, body, query: {}, socket: req.socket },
          vres,
        )
      })
    },
  }
}

// 本地开发时的 /api/jobs —— 线上是 api/jobs.ts (Vercel Serverless)
// 优先用飞书应用凭证; 没有凭证就退回本地快照 data/jobs.snapshot.json
function devJobsApi(env: Record<string, string>): Plugin {
  return {
    name: 'dev-jobs-api',
    configureServer(server) {
      server.middlewares.use('/api/jobs', async (_req, res) => {
        const send = (payload: unknown) => {
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(payload))
        }

        const appId = env.FEISHU_APP_ID
        const appSecret = env.FEISHU_APP_SECRET

        try {
          if (appId && appSecret) {
            const { jobs, failedTables } = await fetchAllJobs(appId, appSecret)
            send({
              jobs,
              fetchedAt: Date.now(),
              source: 'live',
              count: jobs.length,
              degraded: failedTables.length > 0,
            })
            return
          }

          const snapshotPath = path.resolve(__dirname, 'data/jobs.snapshot.json')
          if (existsSync(snapshotPath)) {
            const jobs = JSON.parse(readFileSync(snapshotPath, 'utf-8')) as JobPosition[]
            send({ jobs, fetchedAt: Date.now(), source: 'live', count: jobs.length, degraded: false })
            return
          }

          send({
            jobs: [],
            fetchedAt: Date.now(),
            source: 'fallback',
            count: 0,
            degraded: true,
            error: '本地既没有 FEISHU_APP_ID/SECRET, 也没有 data/jobs.snapshot.json, 岗位库不可用。',
          })
        } catch (e) {
          send({
            jobs: [],
            fetchedAt: Date.now(),
            source: 'fallback',
            count: 0,
            degraded: true,
            error: e instanceof Error ? e.message : String(e),
          })
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // 第三参传 '' —— FEISHU_APP_ID 不带 VITE_ 前缀, 默认前缀会把它过滤掉
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      react(),
      devJobsApi(env),
      devApi('/api/health', healthHandler),
      devApi('/api/chat', chatHandler),
      devApi('/api/rank', rankHandler),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    optimizeDeps: {
      include: ['pdfjs-dist'],
    },
    server: {
      port: 5173,
      host: '0.0.0.0',
    },
  }
})
