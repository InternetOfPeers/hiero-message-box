/**
 * Streaming Jest reporter.
 *
 * - onTestCaseStart  → prints the test name immediately as it begins running
 * - onTestCaseResult → overwrites that line with the final icon + elapsed time
 * - onTestResult     → prints failure details (error messages / stack traces)
 * - onRunComplete    → prints the summary block
 *
 * Intentionally a plain class (not extending DefaultReporter) to avoid
 * inheriting any internal timers or buffers that would delay process exit.
 * All output goes directly to process.stdout so ordering is deterministic.
 */

'use strict';

const chalk = require('chalk');

class StreamingReporter {
  constructor() {
    // Tracks the last-printed describe header per test file path, so each
    // suite has its own state and they don't clobber each other.
    this._currentDescribe = new Map();

    // Number of test files currently running in parallel.  When >1, the
    // \r-overwrite trick is unsafe because output from different suites
    // interleaves on the same terminal line.
    this._activeFiles = 0;
  }

  // Called once before any test file starts.  Suppress the default
  // "Determining test suites to run…" message.
  onRunStart() {}

  // Track how many files are running; suppress the "RUNS …" status line.
  onTestStart() {
    this._activeFiles++;
  }

  // Called immediately when a test case starts.
  onTestCaseStart(test, { ancestorTitles, title }) {
    const filePath = test.path;
    const describe = ancestorTitles.join(' > ');

    if (this._currentDescribe.get(filePath) !== describe) {
      this._currentDescribe.set(filePath, describe);
      process.stdout.write(`\n  ${chalk.bold(describe)}\n`);
    }

    // Only write a partial line (no newline) when running sequentially.
    // In parallel runs we skip this to avoid interleaved partial lines —
    // onTestCaseResult will print the full row instead.
    if (this._activeFiles <= 1) {
      process.stdout.write(`    ${chalk.cyan('●')} ${title}`);
    }
  }

  // Called immediately when a test case finishes.
  onTestCaseResult(_test, { title, status, duration }) {
    const ms = duration != null ? chalk.dim(` (${duration} ms)`) : '';
    const icon = status === 'passed' ? chalk.green('✓')
               : status === 'failed' ? chalk.red('✗')
               : chalk.yellow('○');

    if (this._activeFiles <= 1) {
      // Overwrite the "● title" placeholder written by onTestCaseStart.
      process.stdout.write(`\r    ${icon} ${title}${ms}\n`);
    } else {
      // No placeholder was written — just print the result directly.
      process.stdout.write(`    ${icon} ${title}${ms}\n`);
    }
  }

  // Called once per test file after all its tests finish.
  onTestResult(test, { testResults, numFailingTests }) {
    this._activeFiles--;
    this._currentDescribe.delete(test.path);

    if (numFailingTests === 0) return;

    for (const t of testResults) {
      if (t.status !== 'failed') continue;
      const name = [...t.ancestorTitles, t.title].join(' › ');
      process.stdout.write(`\n  ${chalk.red('● ')}${name}\n\n`);
      for (const msg of t.failureMessages) {
        const indented = msg.split('\n').map(l => `    ${l}`).join('\n');
        process.stdout.write(`${indented}\n`);
      }
    }
  }

  // Called once after all test files have finished.
  onRunComplete(_contexts, results) {
    const {
      numPassedTestSuites, numFailedTestSuites, numTotalTestSuites,
      numPassedTests, numFailedTests, numPendingTests, numTotalTests,
      startTime,
    } = results;

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(3);

    const suites = numFailedTestSuites > 0
      ? `${chalk.red(`${numFailedTestSuites} failed`)}, ${chalk.green(`${numPassedTestSuites} passed`)}, ${numTotalTestSuites} total`
      : `${chalk.green(`${numPassedTestSuites} passed`)}, ${numTotalTestSuites} total`;

    const tests = numFailedTests > 0
      ? `${chalk.red(`${numFailedTests} failed`)}, ${chalk.green(`${numPassedTests} passed`)}, ${numTotalTests} total`
      : numPendingTests > 0
        ? `${chalk.green(`${numPassedTests} passed`)}, ${chalk.yellow(`${numPendingTests} skipped`)}, ${numTotalTests} total`
        : `${chalk.green(`${numPassedTests} passed`)}, ${numTotalTests} total`;

    process.stdout.write(`\nTest Suites: ${suites}\n`);
    process.stdout.write(`Tests:       ${tests}\n`);
    process.stdout.write(`Snapshots:   0 total\n`);
    process.stdout.write(`Time:        ${elapsed} s\n\n`);
  }
}

module.exports = StreamingReporter;
