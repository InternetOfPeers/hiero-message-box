'use strict';

/**
 * Tests for bin/hmb.js dispatch logic.
 *
 * The dispatcher runs its logic at the top level when required, so we
 * re-require it after jest.resetModules() to re-run the dispatch logic
 * with a fresh module cache each time.
 */

// Hoisted mocks: prevent real env-loader and command modules from running
jest.mock('../src/env-loader', () => ({
  loadEnv: jest.fn(),
  findProjectRoot: jest.fn(() => '/fake/root'),
}));

jest.mock('../src/commands/setup-message-box', () => {});
jest.mock('../src/commands/link-message-box', () => {});
jest.mock('../src/commands/listen-for-new-messages', () => {});
jest.mock('../src/commands/check-messages', () => {});
jest.mock('../src/commands/send-message', () => {});
jest.mock('../src/commands/remove-message-box', () => {});

const VALID_COMMANDS = [
  'setup-message-box',
  'link-message-box',
  'listen-for-new-messages',
  'check-messages',
  'send-message',
  'remove-message-box',
];

describe('hmb dispatcher', () => {
  let exitSpy;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function runDispatcher(argv) {
    process.argv = ['node', 'hmb.js', ...argv];
    try {
      require('../bin/hmb.js');
    } catch (err) {
      if (!err.message.includes('process.exit called')) throw err;
    }
  }

  test('no command prints help and exits 0', () => {
    runDispatcher([]);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  test('"help" exits 0', () => {
    runDispatcher(['help']);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  test('"--help" exits 0', () => {
    runDispatcher(['--help']);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  test('"-h" exits 0', () => {
    runDispatcher(['-h']);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  test('"--version" exits 0', () => {
    runDispatcher(['--version']);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  test('"-v" exits 0', () => {
    runDispatcher(['-v']);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  test('unknown command exits 1', () => {
    runDispatcher(['not-a-real-command']);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  test('loadEnv is called before dispatching a valid command', () => {
    runDispatcher(['check-messages']);
    const { loadEnv } = require('../src/env-loader');
    expect(loadEnv).toHaveBeenCalledTimes(1);
  });

  test('loadEnv is NOT called for help flags', () => {
    runDispatcher(['--help']);
    const { loadEnv } = require('../src/env-loader');
    expect(loadEnv).not.toHaveBeenCalled();
  });

  test.each(VALID_COMMANDS)('"%s" is a recognised command (no exit 1)', cmd => {
    runDispatcher([cmd]);
    const calledWith1 = exitSpy.mock.calls.some(([code]) => code === 1);
    expect(calledWith1).toBe(false);
  });
});
