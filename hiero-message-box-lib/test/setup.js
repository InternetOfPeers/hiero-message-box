// Load .env from the git repo root (two levels up from this file) for integration tests.
const fs = require('fs');
const path = require('path');

const envFile = path.resolve(__dirname, '../../.env');
if (fs.existsSync(envFile)) {
  const content = fs.readFileSync(envFile, 'utf8');
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const sep = trimmed.indexOf('=');
    if (sep === -1) return;
    const key = trimmed.slice(0, sep).trim();
    let val = trimmed.slice(sep + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  });
}

// Silence application console output during tests.
const noop = () => {};
global.console.log = noop;
global.console.debug = noop;
global.console.warn = noop;
global.console.info = noop;
