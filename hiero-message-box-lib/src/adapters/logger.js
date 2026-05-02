'use strict';

/**
 * Logger interface (duck-typed):
 *   debug(...args), log(...args), info(...args), warn(...args), error(...args)
 */

const NoopLogger = Object.freeze({
  debug: () => {},
  log: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
});

module.exports = { NoopLogger };
