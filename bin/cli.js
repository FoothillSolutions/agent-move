#!/usr/bin/env node

const preferredPort = (() => {
  const idx = process.argv.indexOf('--port');
  if (idx !== -1 && process.argv[idx + 1]) {
    const p = parseInt(process.argv[idx + 1], 10);
    if (!Number.isNaN(p) && p > 0 && p < 65536) return p;
    console.error(`Invalid port: ${process.argv[idx + 1]}`);
    process.exit(1);
  }
  return 3333;
})();

process.env.AGENT_MOVE_PORT = String(preferredPort);
process.env.__AGENT_MOVE_CLI = '1';

async function run() {
  const { main } = await import('../packages/server/dist/index.js');
  const { port } = await main();

  if (port !== preferredPort) {
    console.log(`  Port ${preferredPort} was in use, using ${port} instead.`);
  }

  console.log();
  console.log('  ┌──────────────────────────────────────┐');
  console.log('  │                                      │');
  console.log(`  │   AgentMove running on port ${String(port).padEnd(5)}   │`);
  console.log(`  │   http://localhost:${String(port).padEnd(18)}│`);
  console.log('  │                                      │');
  console.log('  └──────────────────────────────────────┘');
  console.log();

  // Auto-open browser
  const url = `http://localhost:${port}`;
  const { exec } = await import('child_process');
  const cmd = process.platform === 'win32' ? `start "" "${url}"`
    : process.platform === 'darwin' ? `open "${url}"`
    : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

run().catch((err) => {
  console.error('Failed to start AgentMove:', err);
  process.exit(1);
});
