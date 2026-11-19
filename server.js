import { createApp } from './src/app.js';
import { createDatabasePool, getDatabaseConfig, initializeDatabase } from './src/db.js';

const config = getDatabaseConfig();
const pool = await createDatabasePool(config);
try {
  await initializeDatabase(pool);
} catch (error) {
  await pool.end();
  throw error;
}

const app = createApp({ pool, finePerDay: config.finePerDay });
const port = Number(process.env.PORT || 5080);
const host = process.env.HOST || '0.0.0.0';
const server = app.listen(port, host, () => {
  console.log(`Library Management System running at http://localhost:${port}`);
});

async function shutdown() {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
