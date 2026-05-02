'use strict';

const readline = require('readline');

/**
 * Ask a yes/no question via stdin.
 * @param {string} question
 * @returns {Promise<boolean>} true if user answers yes/y
 */
function promptYesNo(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(resolve => {
    rl.question(question, ans => {
      rl.close();
      const answer = ans.toLowerCase().trim();
      resolve(answer === 'yes' || answer === 'y');
    });
  });
}

module.exports = { promptYesNo };
