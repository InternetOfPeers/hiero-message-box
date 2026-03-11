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
    this._currentDescribe = null;
  }

  // Called once before any test file starts.  Suppress the default
  // "Determining test suites to run…" message.
  onRunStart() {}

  // Suppress the "RUNS test/file.js" status line — per-test output makes it
  // redundant.
  onTestStart() {}

  // Called immediately when a test case starts.
  onTestCaseStart(_test, { ancestorTitles, title }) {
    const describe = ancestorTitles.join(' > ');

    if (describe !== this._currentDescribe) {
      this._currentDescribe = describe;
      process.stdout.write(`\n  ${chalk.bold(describe)}\n`);
    }

    // No newline — onTestCaseResult will overwrite this line via \r.
    process.stdout.write(`    ${chalk.cyan('●')} ${title}`);
  }

  // Called immediately when a test case finishes.
  onTestCaseResult(_test, { title, status, duration }) {
    const ms = duration != null ? chalk.dim(` (${duration} ms)`) : '';
    const icon = status === 'passed' ? chalk.green('✓')
               : status === 'failed' ? chalk.red('✗')
               : chalk.yellow('○');

    process.stdout.write(`\r    ${icon} ${title}${ms}\n`);
  }

  // Called once per test file after all its tests finish.  Only used to
  // surface failure details (error messages + stack traces).
  onTestResult(_test, { testResults, numFailingTests }) {
    if (numFailingTests === 0) return;

    for (const t of testResults) {
      if (t.status !== 'failed') continue;
      const name = [...t.ancestorTitles, t.title].join(' › ');
      process.stdout.write(`\n  ${chalk.red('● ')}${name}\n\n`);
      for (const msg of t.failureMessages) {
        // Indent every line of the (already ANSI-formatted) message.
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
