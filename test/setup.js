// Silence all application console output during tests.
// Jest's own reporter output is unaffected by this.
const noop = () => {};
global.console.log = noop;
global.console.debug = noop;
global.console.warn = noop;
global.console.info = noop;
