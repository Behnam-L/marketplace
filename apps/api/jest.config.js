/** @type {import('jest').Config} */
module.exports = {
  rootDir: 'src',
  testRegex: '.*\\.(spec|e2e-spec)\\.ts$',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }] },
  moduleNameMapper: { '^@bajet/contracts$': '<rootDir>/../../../packages/contracts/src/index.ts' },
  testEnvironment: 'node',
  testTimeout: 30000,
};
