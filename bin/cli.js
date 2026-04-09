#!/usr/bin/env node

const { execFile, execFileSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const LIB_DIR = path.join(__dirname, '..', 'lib');
const PREVIEW_HTML = path.join(LIB_DIR, 'preview.html');
const SERVER_SCRIPT = path.join(LIB_DIR, 'server.js');

const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;

function parseArgs(args) {
  let target = null;
  let breakpoints = null;
  let appMode = false;
  let port = 8787;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--breakpoints' && args[i + 1]) {
      breakpoints = args[i + 1];
      i++;
    } else if (args[i] === '--port' && args[i + 1]) {
      port = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--app') {
      appMode = true;
    } else if (args[i] === '--help' || args[i] === '-h') {
      printHelp();
      process.exit(0);
    } else if (!target) {
      target = args[i];
    }
  }

  return { target, breakpoints, appMode, port };
}

function printHelp() {
  console.log('');
  LOGO.forEach(l => console.log(cyan(l)));
  console.log('');
  console.log(`  ${bold('Usage')}`);
  console.log(`    ${cyan('breakpoint-preview')} <url>                       ${dim('Preview a dev server')}`);
  console.log(`    ${cyan('breakpoint-preview')} <path>                      ${dim('Preview a static file')}`);
  console.log('');
  console.log(`  ${bold('Options')}`);
  console.log(`    ${cyan('--breakpoints')} 320,768,1024   ${dim('Custom viewport widths')}`);
  console.log(`    ${cyan('--app')}                        ${dim('Standalone window (Chrome/Chromium)')}`);
  console.log(`    ${cyan('--port')} 9000                  ${dim('Custom port (default: 8787)')}`);
  console.log(`    ${cyan('--help')}                       ${dim('Show this help')}`);
  console.log('');
  console.log(`  ${bold('Examples')}`);
  console.log(`    ${dim('$')} breakpoint-preview http://localhost:5173`);
  console.log(`    ${dim('$')} breakpoint-preview http://localhost:3000 --app`);
  console.log(`    ${dim('$')} breakpoint-preview ./dist --breakpoints 375,768,1440`);
  console.log('');
  console.log(`  ${bold('Features')}`);
  console.log(`    ${dim('Per-viewport URL bar, hide/show viewports, scroll sync,')}`);
  console.log(`    ${dim('session persistence, HMR pass-through, zero dependencies.')}`);
  console.log('');
}

const LOGO = [
  '┌┐ ┬─┐┌─┐┌─┐┬┌─┌─┐┌─┐┬┌┐┌┌┬┐',
  '├┴┐├┬┘├┤ ├─┤├┴┐├─┘│ │││││ │ ',
  '└─┘┴└─└─┘┴ ┴┴ ┴┴  └─┘┴┘└┘ ┴ ',
  '┌─┐┬─┐┌─┐┬  ┬┬┌─┐┬ ┬',
  '├─┘├┬┘├┤ └┐┌┘│├┤ │││',
  '┴  ┴└─└─┘ └┘ ┴└─┘└┴┘',
];

function printBanner(target, previewUrl, bps) {
  console.log('');
  LOGO.forEach(l => console.log(cyan(l)));
  console.log('');
  console.log(`  ${dim('Target')}    ${target}`);
  const displayUrl = previewUrl.replace(/\?.*$/, '');
  console.log(`  ${dim('Preview')}   ${cyan(displayUrl)}`);
  console.log(`  ${dim('Viewports')} ${bps || '375, 768, 1024, 1440'}`);
  console.log('');
  console.log(`  ${green('Ready.')} ${dim('Press Ctrl+C to stop.')}`);
  console.log('');
}

function isUrl(str) {
  return /^https?:\/\//i.test(str);
}

function findBrowser() {
  if (process.platform === 'darwin') {
    const apps = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'];
    for (const app of apps) {
      if (fs.existsSync(app)) return app;
    }
    return null;
  }

  if (process.platform === 'win32') {
    const dirs = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
    const paths = [
      ...dirs.map(d => path.join(d, 'Google', 'Chrome', 'Application', 'chrome.exe')),
      ...dirs.map(d => path.join(d, 'Microsoft', 'Edge', 'Application', 'msedge.exe')),
    ];
    for (const p of paths) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  const candidates = ['chromium', 'google-chrome-stable', 'google-chrome', 'chromium-browser'];
  for (const cmd of candidates) {
    try {
      execFileSync('which', [cmd], { stdio: 'ignore' });
      return cmd;
    } catch {}
  }
  return null;
}

function openUrl(url, appMode) {
  if (appMode) {
    const browser = findBrowser();
    if (browser) {
      const tmpProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-chrome-'));
      process.on('exit', () => { try { fs.rmSync(tmpProfile, { recursive: true }); } catch {} });
      const chrome = spawn(browser, [
        `--app=${url}`,
        `--user-data-dir=${tmpProfile}`,
        '--no-first-run',
        '--no-default-browser-check',
      ], { stdio: 'ignore' });
      chrome.on('close', () => process.exit(0));
      return;
    }
    console.error(`\n  ${bold('Error:')} --app requires Chrome or Chromium, but neither was found.\n  Install Chrome or use without --app.\n`);
    process.exit(1);
  }

  if (process.platform === 'win32') {
    execFile('cmd', ['/c', 'start', '', url], (err) => {
      if (err) console.error(`Could not open browser: ${err.message}`);
    });
  } else {
    const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
    execFile(cmd, [url], (err) => {
      if (err) console.error(`Could not open browser: ${err.message}`);
    });
  }
}

function buildPreviewUrl(port, breakpoints, target) {
  const params = new URLSearchParams();
  if (breakpoints) params.set('breakpoints', breakpoints);
  try {
    const u = new URL(target);
    params.set('origin', u.origin);
    if (u.pathname !== '/') params.set('path', u.pathname);
  } catch {}
  const qs = params.toString();
  return `http://localhost:${port}/_bp${qs ? '?' + qs : ''}`;
}

function startServer(serveDir, proxyUrl, startPort, onReady) {
  const previewDest = path.join(serveDir, '_preview.html');
  fs.copyFileSync(PREVIEW_HTML, previewDest);

  const args = [SERVER_SCRIPT, serveDir, String(startPort)];
  if (proxyUrl) args.push(proxyUrl);
  const server = spawn('node', args, { stdio: ['ignore', 'pipe', 'pipe'] });

  let output = '';
  let ready = false;

  const timeout = setTimeout(() => {
    if (!ready) {
      console.error('Server failed to start within 10 seconds.');
      server.kill();
      process.exit(1);
    }
  }, 10000);

  server.stdout.on('data', (data) => {
    if (ready) return;
    output += data.toString();
    const match = output.match(/SERVING_PORT:(\d+)/);
    if (match) {
      ready = true;
      output = '';
      clearTimeout(timeout);
      onReady(parseInt(match[1], 10));
    }
  });

  server.stderr.on('data', (data) => process.stderr.write(data));

  process.on('exit', () => {
    try { fs.unlinkSync(previewDest); } catch {}
  });

  function cleanup() {
    server.kill();
    process.exit(0);
  }

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  return server;
}

const { target, breakpoints, appMode, port } = parseArgs(process.argv.slice(2));

if (!target) {
  printHelp();
  process.exit(0);
}

if (isUrl(target)) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-preview-'));
  process.on('exit', () => { try { fs.rmSync(tmpDir, { recursive: true }); } catch {} });

  startServer(tmpDir, target, port, (actualPort) => {
    const previewUrl = buildPreviewUrl(actualPort, breakpoints, target);
    printBanner(target, previewUrl, breakpoints);
    openUrl(previewUrl, appMode);
  });
} else {
  const resolvedPath = path.resolve(target);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`Error: Path does not exist: ${resolvedPath}`);
    process.exit(1);
  }

  const stat = fs.statSync(resolvedPath);
  const serveDir = stat.isDirectory() ? resolvedPath : path.dirname(resolvedPath);

  startServer(serveDir, null, port, (actualPort) => {
    const previewUrl = buildPreviewUrl(actualPort, breakpoints, resolvedPath);
    printBanner(resolvedPath, previewUrl, breakpoints);
    openUrl(previewUrl, appMode);
  });
}
