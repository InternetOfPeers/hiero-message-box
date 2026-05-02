#!/usr/bin/env node
'use strict';

const { loadEnv } = require('../src/env-loader');

const COMMANDS = {
  'setup-message-box': '../src/commands/setup-message-box',
  'link-message-box': '../src/commands/link-message-box',
  'listen-for-new-messages': '../src/commands/listen-for-new-messages',
  'check-messages': '../src/commands/check-messages',
  'send-message': '../src/commands/send-message',
  'remove-message-box': '../src/commands/remove-message-box',
};

const VERSION = require('../package.json').version;

function printHelp() {
  console.log(`
hmb — Hiero Message Box CLI v${VERSION}

Usage: hmb <command> [options]

Commands:
  setup-message-box                     Initialize your message box
  link-message-box <topic-id>           Re-attach an existing topic
  listen-for-new-messages               Poll for new messages (Ctrl+C to stop)
  check-messages [start] [end]          Retrieve messages by sequence range
  send-message <account> <message>      Send an encrypted message [--cbor]
  remove-message-box                    Clear your account memo

  help, --help, -h                      Show this help message
  --version, -v                         Show version

Environment: copy .env.example to .env and fill in your credentials.
`);
}

const [, , command, ...args] = process.argv;

if (
  !command ||
  command === 'help' ||
  command === '--help' ||
  command === '-h'
) {
  printHelp();
  process.exit(0);
}

if (command === '--version' || command === '-v') {
  console.log(VERSION);
  process.exit(0);
}

const modulePath = COMMANDS[command];
if (!modulePath) {
  console.error(`\n✗ Unknown command: "${command}"\n`);
  printHelp();
  process.exit(1);
}

loadEnv();

// Restore process.argv so command modules read args[2..] as their own arguments
process.argv = [process.argv[0], process.argv[1], ...args];

require(modulePath);
