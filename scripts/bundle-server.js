import { build } from 'esbuild';
import { readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverDist = join(__dirname, '..', 'packages', 'server', 'dist');

// Collect all .js files in server dist to rebundle them with shared inlined
const entryPoints = [];
function collectJs(dir) {
  for (const f of readdirSync(dir)) {
    const full = join(dir, f);
    if (statSync(full).isDirectory()) collectJs(full);
    else if (f.endsWith('.js')) entryPoints.push(full);
  }
}
collectJs(serverDist);

await build({
  entryPoints,
  outdir: serverDist,
  bundle: true,
  platform: 'node',
  format: 'esm',
  allowOverwrite: true,
  banner: {
    js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`,
  },
  // Inline workspace packages, keep everything else external
  external: [
    'fastify', '@fastify/*', 'chokidar',
    'os', 'path', 'fs', 'url', 'events', 'stream', 'util', 'crypto',
    'child_process', 'http', 'https', 'net', 'tls', 'zlib', 'buffer',
    'node:*',
  ],
  // Resolve @agent-move/shared to the built dist
  alias: {
    '@agent-move/shared': join(__dirname, '..', 'packages', 'shared', 'dist', 'index.js'),
  },
});

console.log('Server bundled with @agent-move/shared inlined.');
