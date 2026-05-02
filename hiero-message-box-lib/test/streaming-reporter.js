'use strict';

const chalk = require('chalk');

class StreamingReporter {
  constructor() {
    this._currentDescribe = new Map();
    this._activeFiles = 0;
  }

  onRunStart() {}

  onTestStart() {
    this._activeFiles++;
  }

  onTestCaseStart(test, { ancestorTitles, title }) {
    const filePath = test.path;
    const describe = ancestorTitles.join(' > ');

    if (this._currentDescribe.get(filePath) !== describe) {
      this._currentDescribe.set(filePath, describe);
      process.stdout.write(`\n  ${chalk.bold(describe)}\n`);
    }

    if (this._activeFiles <= 1) {
      process.stdout.write(`    ${chalk.cyan('●')} ${title}`);
    }
  }

  onTestCaseResult(_test, { title, status, duration }) {
    const ms = duration != null ? chalk.dim(` (${duration} ms)`) : '';
    const icon =
      status === 'passed'
        ? chalk.green('✓')
        : status === 'failed'
          ? chalk.red('✗')
          : chalk.yellow('○');

    if (this._activeFiles <= 1) {
      process.stdout.write(`\r    ${icon} ${title}${ms}\n`);
    } else {
      process.stdout.write(`    ${icon} ${title}${ms}\n`);
    }
  }

  onTestResult(test, { testResults, numFailingTests }) {
    this._activeFiles--;
    this._currentDescribe.delete(test.path);

    if (numFailingTests === 0) return;

    for (const t of testResults) {
      if (t.status !== 'failed') continue;
      const name = [...t.ancestorTitles, t.title].join(' › ');
      process.stdout.write(`\n  ${chalk.red('● ')}${name}\n\n`);
      for (const msg of t.failureMessages) {
        const indented = msg
          .split('\n')
          .map(l => `    ${l}`)
          .join('\n');
        process.stdout.write(`${indented}\n`);
      }
    }
  }

  onRunComplete(_contexts, results) {
    const {
      numPassedTestSuites,
      numFailedTestSuites,
      numTotalTestSuites,
      numPassedTests,
      numFailedTests,
      numPendingTests,
      numTotalTests,
      startTime,
    } = results;

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(3);

    const suites =
      numFailedTestSuites > 0
        ? `${chalk.red(`${numFailedTestSuites} failed`)}, ${chalk.green(`${numPassedTestSuites} passed`)}, ${numTotalTestSuites} total`
        : `${chalk.green(`${numPassedTestSuites} passed`)}, ${numTotalTestSuites} total`;

    const tests =
      numFailedTests > 0
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
