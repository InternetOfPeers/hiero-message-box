'use strict';

const ConsoleLogger = Object.freeze({
  debug: (...args) => console.debug(...args),
  log: (...args) => console.log(...args),
  info: (...args) => console.info(...args),
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
});

module.exports = { ConsoleLogger };
