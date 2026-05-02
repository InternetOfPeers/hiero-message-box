'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { loadEnv, findProjectRoot } = require('../src/env-loader');

describe('findProjectRoot()', () => {
  test('finds a directory that contains package.json', () => {
    // This file lives inside hiero-message-box-cli, which has a package.json
    const root = findProjectRoot(__dirname);
    expect(fs.existsSync(path.join(root, 'package.json'))).toBe(true);
  });

  test('returns startDir when no package.json is found anywhere', () => {
    const originalExistsSync = fs.existsSync;
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    try {
      const sentinel = '/tmp/no-package-json-anywhere';
      const result = findProjectRoot(sentinel);
      expect(result).toBe(sentinel);
    } finally {
      fs.existsSync = originalExistsSync;
      jest.restoreAllMocks();
    }
  });
});

describe('loadEnv()', () => {
  let tmpDir;
  let savedEnv;

  beforeEach(() => {
    savedEnv = { ...process.env };
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hmb-test-'));
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in savedEnv)) delete process.env[key];
    }
    Object.assign(process.env, savedEnv);
    jest.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('loads KEY=VALUE pairs into process.env', () => {
    const envPath = path.join(tmpDir, '.env');
    fs.writeFileSync(envPath, 'TEST_KEY_LOAD=hello\n');
    delete process.env.TEST_KEY_LOAD;

    loadEnv(envPath);

    expect(process.env.TEST_KEY_LOAD).toBe('hello');
  });

  test('does not overwrite existing process.env values', () => {
    const envPath = path.join(tmpDir, '.env');
    fs.writeFileSync(envPath, 'TEST_KEY_PRECEDENCE=from-file\n');
    process.env.TEST_KEY_PRECEDENCE = 'already-set';

    loadEnv(envPath);

    expect(process.env.TEST_KEY_PRECEDENCE).toBe('already-set');
  });

  test('strips double quotes from values', () => {
    const envPath = path.join(tmpDir, '.env');
    fs.writeFileSync(envPath, 'TEST_KEY_DQUOTE="double-quoted"\n');
    delete process.env.TEST_KEY_DQUOTE;

    loadEnv(envPath);

    expect(process.env.TEST_KEY_DQUOTE).toBe('double-quoted');
  });

  test('strips single quotes from values', () => {
    const envPath = path.join(tmpDir, '.env');
    fs.writeFileSync(envPath, "TEST_KEY_SQUOTE='single-quoted'\n");
    delete process.env.TEST_KEY_SQUOTE;

    loadEnv(envPath);

    expect(process.env.TEST_KEY_SQUOTE).toBe('single-quoted');
  });

  test('ignores comment lines and blank lines', () => {
    const envPath = path.join(tmpDir, '.env');
    fs.writeFileSync(envPath, '# comment\n\nTEST_KEY_COMMENT=value\n');
    delete process.env.TEST_KEY_COMMENT;

    loadEnv(envPath);

    expect(process.env.TEST_KEY_COMMENT).toBe('value');
  });

  test('ignores lines without "="', () => {
    const envPath = path.join(tmpDir, '.env');
    fs.writeFileSync(envPath, 'INVALID_LINE\nTEST_KEY_VALID=ok\n');
    delete process.env.INVALID_LINE;
    delete process.env.TEST_KEY_VALID;

    loadEnv(envPath);

    expect(process.env.INVALID_LINE).toBeUndefined();
    expect(process.env.TEST_KEY_VALID).toBe('ok');
  });

  test('writes to stderr and returns when file does not exist', () => {
    const stderrSpy = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    const nonexistent = path.join(tmpDir, 'missing.env');

    loadEnv(nonexistent);

    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('not found')
    );
  });

  test('writes to stderr and returns when readFileSync throws', () => {
    const envPath = path.join(tmpDir, '.env');
    fs.writeFileSync(envPath, '');
    const stderrSpy = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
      throw new Error('disk error');
    });

    loadEnv(envPath);

    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error reading')
    );
  });
});
