import Redis from 'ioredis'

let _connection: Redis | null = null

function createConnection(): Redis {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'

  if (!process.env.REDIS_URL) {
    console.warn('REDIS_URL not set; using default redis://localhost:6379 (worker will fail without Redis)')
  }

  const connection = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  })

  connection.on('error', (err) => {
    console.error('Redis connection error:', err)
  })

  return connection
}

export function getConnection(): Redis {
  if (!_connection) {
    _connection = createConnection()
  }
  return _connection
}

export const connection = getConnection()

export async function disconnect(): Promise<void> {
  if (_connection) {
    await _connection.quit()
    _connection = null
  }
}