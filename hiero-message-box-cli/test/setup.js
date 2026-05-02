'use strict';

// Silence console output during CLI tests
jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(console, 'error').mockImplementation(() => {});
jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
