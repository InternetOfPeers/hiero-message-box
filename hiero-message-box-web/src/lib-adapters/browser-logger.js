import { addLog } from '../session.js';

const fmt = args =>
  args
    .map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a)))
    .join(' ');

export const BrowserLogger = {
  debug: (...args) => {
    addLog('debug', fmt(args));
    console.debug(...args);
  },
  log: (...args) => {
    addLog('info', fmt(args));
    console.log(...args);
  },
  info: (...args) => {
    addLog('info', fmt(args));
    console.info(...args);
  },
  warn: (...args) => {
    addLog('warn', fmt(args));
    console.warn(...args);
  },
  error: (...args) => {
    addLog('error', fmt(args));
    console.error(...args);
  },
};
