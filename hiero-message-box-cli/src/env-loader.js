'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Walk up from startDir until a package.json is found.
 * @param {string} startDir
 * @returns {string} Directory containing package.json, or startDir if not found
 */
function findProjectRoot(startDir = process.cwd()) {
  let currentDir = startDir;
  while (currentDir !== path.dirname(currentDir)) {
    if (fs.existsSync(path.join(currentDir, 'package.json'))) return currentDir;
    currentDir = path.dirname(currentDir);
  }
  return startDir;
}

/**
 * Parse a .env file and populate process.env.
 * Values already set in process.env are NOT overwritten.
 * @param {string} [envFilePath] - Explicit path; if omitted, searches from project root
 */
function loadEnv(envFilePath) {
  const filePath = envFilePath || path.join(findProjectRoot(), '.env');

  if (!fs.existsSync(filePath)) {
    process.stderr.write(`.env file not found at ${filePath}\n`);
    return;
  }

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    process.stderr.write(`Error reading .env file: ${error.message}\n`);
    return;
  }

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const sep = trimmed.indexOf('=');
    if (sep === -1) continue;

    const key = trimmed.slice(0, sep).trim();
    let value = trimmed.slice(sep + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) process.env[key] = value;
  }
}

module.exports = { loadEnv, findProjectRoot };
