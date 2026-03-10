#!/usr/bin/env node

const args = process.argv.slice(2);

// ── Colors (works on all terminals, no dependencies) ────────────────────────
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  white: '\x1b[37m',
  bgCyan: '\x1b[46m',
  bgBlue: '\x1b[44m',
};

// Disable colors if NO_COLOR env or dumb terminal
const noColor = process.env.NO_COLOR || process.env.TERM === 'dumb';
if (noColor) Object.keys(c).forEach(k => { c[k] = ''; });

function logo() {
  console.log();
  console.log(`${c.cyan}${c.bold}     _                    _   __  __`);
  console.log(`    / \\   __ _  ___ _ __ | |_|  \\/  | _____   _____`);
  console.log(`   / _ \\ / _\` |/ _ \\ '_ \\| __| |\\/| |/ _ \\ \\ / / _ \\`);
  console.log(`  / ___ \\ (_| |  __/ | | | |_| |  | | (_) \\ V /  __/`);
  console.log(` /_/   \\_\\__, |\\___|_| |_|\\__|_|  |_|\\___/ \\_/ \\___|`);
  console.log(`         |___/`);
  console.log(`${c.reset}${c.dim}  Watch your AI agents come alive as pixel-art characters${c.reset}`);
  console.log();
}

function status(icon, label, detail) {
  console.log(`  ${icon}  ${c.bold}${label}${c.reset}  ${c.dim}${detail}${c.reset}`);
}

function troubleshooting() {
  console.log();
  console.log(`${c.dim}  ── Troubleshooting ──────────────────────────────────────${c.reset}`);
  console.log(`${c.dim}  Port in use?        ${c.reset}npx @foothill/agent-move --port 4444`);
  console.log(`${c.dim}  Hooks not working?  ${c.reset}npx @foothill/agent-move hooks status`);
  console.log(`${c.dim}  Reinstall hooks:    ${c.reset}npx @foothill/agent-move hooks install`);
  console.log(`${c.dim}  Remove hooks:       ${c.reset}npx @foothill/agent-move hooks uninstall`);
  console.log(`${c.dim}  Report issues:      ${c.reset}https://github.com/FoothillSolutions/agent-move/issues`);
  console.log();
}

// ── help ──────────────────────────────────────────────────────────────────────
if (args.includes('--help') || args.includes('-h')) {
  logo();
  console.log(`${c.bold}  Usage:${c.reset}`);
  console.log(`    ${c.cyan}npx @foothill/agent-move${c.reset}                     Start the visualization server`);
  console.log(`    ${c.cyan}npx @foothill/agent-move --port 4444${c.reset}         Use a custom port`);
  console.log(`    ${c.cyan}npx @foothill/agent-move hooks install${c.reset}       Install Claude Code hooks`);
  console.log(`    ${c.cyan}npx @foothill/agent-move hooks uninstall${c.reset}     Remove Claude Code hooks`);
  console.log(`    ${c.cyan}npx @foothill/agent-move hooks status${c.reset}        Check hooks installation`);
  console.log();
  console.log(`${c.bold}  Options:${c.reset}`);
  console.log(`    ${c.dim}--port <n>${c.reset}    Server port (default: 3333)`);
  console.log(`    ${c.dim}--no-open${c.reset}     Don't auto-open the browser`);
  console.log(`    ${c.dim}--help${c.reset}        Show this help`);
  console.log();
  process.exit(0);
}

// ── hooks subcommand ──────────────────────────────────────────────────────────
if (args[0] === 'hooks') {
  const sub = args[1];
  async function runHooks() {
    const { installHooks, uninstallHooks, checkHookStatus } =
      await import('../packages/server/dist/hooks/hook-installer.js');

    if (sub === 'install') {
      const portIdx = args.indexOf('--port');
      const port = portIdx !== -1 ? parseInt(args[portIdx + 1], 10) : 3333;
      const result = installHooks(port);
      console.log();
      status(`${c.green}+${c.reset}`, 'Hooks installed', `(${result.scriptPath})`);
      status(`${c.green}+${c.reset}`, 'Settings updated', `(${result.settingsPath})`);
      console.log();
      console.log(`${c.dim}  Hooks will send events to http://localhost:${port}/hook${c.reset}`);
      console.log(`${c.dim}  Start the server with: ${c.reset}npx @foothill/agent-move`);
      console.log();
    } else if (sub === 'uninstall') {
      const result = uninstallHooks();
      console.log();
      status(`${c.yellow}-${c.reset}`, 'Hooks removed', result.message);
      console.log();
    } else if (sub === 'status') {
      const s = checkHookStatus();
      console.log();
      if (s.installed) {
        status(`${c.green}*${c.reset}`, 'Hooks installed', `(${s.events.length} events registered)`);
        status(s.scriptExists ? `${c.green}*${c.reset}` : `${c.red}!${c.reset}`, 'Hook script', s.scriptExists ? 'exists' : 'MISSING — run `agent-move hooks install`');
      } else {
        status(`${c.dim}-${c.reset}`, 'Hooks not installed', '');
        console.log(`${c.dim}  Run ${c.reset}npx @foothill/agent-move hooks install${c.dim} to enable real-time events.${c.reset}`);
      }
      console.log();
    } else {
      console.log();
      console.log(`${c.bold}  Usage:${c.reset} agent-move hooks <install|uninstall|status> [--port <n>]`);
      console.log();
    }
  }
  runHooks().catch((err) => {
    console.error(`\n  ${c.red}!${c.reset}  ${err?.message ?? err}\n`);
    process.exit(1);
  });

} else {
  // ── server (default) ────────────────────────────────────────────────────────
  const preferredPort = (() => {
    const idx = args.indexOf('--port');
    if (idx !== -1 && args[idx + 1]) {
      const p = parseInt(args[idx + 1], 10);
      if (!Number.isNaN(p) && p > 0 && p < 65536) return p;
      console.error(`\n  ${c.red}!${c.reset}  Invalid port: ${args[idx + 1]}\n`);
      process.exit(1);
    }
    return 3333;
  })();

  const skipOpen = args.includes('--no-open');

  process.env.AGENT_MOVE_PORT = String(preferredPort);
  process.env.__AGENT_MOVE_CLI = '1';

  async function run() {
    logo();

    // ── Step 1: Auto-install hooks ──────────────────────────────────────────
    try {
      const { checkHookStatus, installHooks } =
        await import('../packages/server/dist/hooks/hook-installer.js');
      const hookStatus = checkHookStatus();
      if (!hookStatus.installed) {
        const result = installHooks(preferredPort);
        status(`${c.green}+${c.reset}`, 'Hooks', `auto-installed (${result.scriptPath})`);
      } else if (!hookStatus.scriptExists) {
        // Hooks registered but script missing — reinstall
        const result = installHooks(preferredPort);
        status(`${c.yellow}~${c.reset}`, 'Hooks', `reinstalled (script was missing)`);
      } else {
        status(`${c.green}*${c.reset}`, 'Hooks', `ready (${hookStatus.events.length} events)`);
      }
    } catch (err) {
      status(`${c.yellow}!${c.reset}`, 'Hooks', `skipped — ${err?.message ?? 'unknown error'}`);
      console.log(`${c.dim}    You can install manually: npx @foothill/agent-move hooks install${c.reset}`);
    }

    // ── Step 2: Start server ────────────────────────────────────────────────
    const { main } = await import('../packages/server/dist/index.js');
    const { port } = await main();

    if (port !== preferredPort) {
      status(`${c.yellow}~${c.reset}`, 'Port', `${preferredPort} was busy, using ${port}`);
    }

    // ── Step 3: Detect platform ─────────────────────────────────────────────
    const platforms = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' };
    const platformName = platforms[process.platform] || process.platform;
    status(`${c.blue}*${c.reset}`, 'Platform', platformName);

    // ── Step 4: JSONL watch path ────────────────────────────────────────────
    const os = await import('os');
    const path = await import('path');
    const claudeHome = path.join(os.homedir(), '.claude');
    status(`${c.blue}*${c.reset}`, 'Watching', claudeHome);

    // ── Ready banner ────────────────────────────────────────────────────────
    const url = `http://localhost:${port}`;
    console.log();
    console.log(`  ${c.bgBlue}${c.white}${c.bold}  READY  ${c.reset}  ${c.cyan}${c.bold}${url}${c.reset}`);
    console.log();
    console.log(`${c.dim}  Press ${c.reset}Ctrl+C${c.dim} to stop the server${c.reset}`);

    troubleshooting();

    // ── Step 5: Auto-open browser ───────────────────────────────────────────
    if (!skipOpen) {
      const { exec } = await import('child_process');
      let cmd;
      switch (process.platform) {
        case 'win32':
          cmd = `start "" "${url}"`;
          break;
        case 'darwin':
          cmd = `open "${url}"`;
          break;
        default:
          // Linux and others — try xdg-open, fall back to nothing
          cmd = `xdg-open "${url}" 2>/dev/null || true`;
          break;
      }
      exec(cmd, () => {});
    }
  }

  run().catch((err) => {
    console.error();
    console.error(`  ${c.red}${c.bold}  FAILED  ${c.reset}  Could not start AgentMove`);
    console.error();

    const msg = err?.message ?? String(err);

    if (msg.includes('EADDRINUSE')) {
      console.error(`  ${c.red}!${c.reset}  Port ${preferredPort} is already in use.`);
      console.error(`${c.dim}    Try: ${c.reset}npx @foothill/agent-move --port ${preferredPort + 1}`);
    } else if (msg.includes('EACCES')) {
      console.error(`  ${c.red}!${c.reset}  Permission denied on port ${preferredPort}.`);
      console.error(`${c.dim}    Try a port above 1024: ${c.reset}npx @foothill/agent-move --port 3333`);
    } else if (msg.includes('Cannot find module')) {
      console.error(`  ${c.red}!${c.reset}  Build artifacts missing.`);
      console.error(`${c.dim}    Run: ${c.reset}npm run build`);
    } else {
      console.error(`  ${c.red}!${c.reset}  ${msg}`);
    }

    console.error();
    console.error(`${c.dim}  Need help? https://github.com/FoothillSolutions/agent-move/issues${c.reset}`);
    console.error();
    process.exit(1);
  });
}
