/**
 * Production startup script.
 *
 * Responsibilities:
 *   1. Apply pending Prisma migrations (idempotent: `prisma migrate deploy`).
 *   2. Start the Next.js web server (`next start`).
 *   3. Start the BullMQ worker (`npm run worker`) as a managed child process,
 *      so a single long-running deployment publishes the queue without a
 *      separate worker host.
 *
 * Set RUN_WORKER=false to disable the in-process worker (e.g. on serverless
 * hosts where you run the worker as a separate deployment).
 */

const { spawn } = require('child_process')
const { execFileSync } = require('child_process')

const env = { ...process.env }

// 1. Run migrations (best-effort, but do not block forever).
async function runMigrations() {
  if (!env.DATABASE_URL) {
    console.warn('[start] DATABASE_URL not set — skipping prisma migrate deploy.')
    return
  }
  console.log('[start] Applying database migrations...')
  try {
    execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
      stdio: 'inherit',
      env,
      timeout: 120_000,
    })
    console.log('[start] Migrations applied.')
  } catch (err) {
    // Don't crash the deploy if the DB is briefly unavailable; the app
    // will surface connection errors at request time.
    console.error('[start] prisma migrate deploy failed (continuing):', err.message)
  }
}

// 2. Spawn a long-running child process, restarting it on exit.
function startManaged(name, command, args) {
  let child = null
  const launch = () => {
    console.log(`[start] starting ${name}...`)
    child = spawn(command, args, { env, stdio: 'inherit', shell: false })
    child.on('exit', (code, signal) => {
      if (signal === 'SIGTERM' || signal === 'SIGINT') return
      console.error(`[start] ${name} exited (code ${code}); restarting in 5s...`)
      setTimeout(launch, 5000)
    })
  }
  launch()
  return {
    kill: (sig) => child && child.kill(sig),
  }
}

async function main() {
  await runMigrations()

  const web = startManaged('web', 'npx', ['next', 'start', '-p', env.PORT || '3000'])

  let worker = null
  if (env.RUN_WORKER !== 'false') {
    worker = startManaged('worker', 'npm', ['run', 'worker'])
  } else {
    console.log('[start] RUN_WORKER=false — worker not started in this process.')
  }

  const shutdown = (sig) => {
    console.log(`[start] received ${sig}, shutting down...`)
    web.kill(sig)
    if (worker) worker.kill(sig)
    process.exit(0)
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

main().catch((err) => {
  console.error('[start] fatal:', err)
  process.exit(1)
})
