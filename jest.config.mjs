export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  testEnvironmentOptions: {
    nodeOptions: '--experimental-vm-modules',
  },
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  testMatch: ['**/?(*.)+(spec|test).ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/index.ts', '!src/client.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  extensionsToTreatAsEsm: ['.ts'],
  transformIgnorePatterns: [
    '/node_modules/(?!(boxen|chalk|gradient-string|figlet|ora|log-symbols|pretty-ms|cli-progress)/).*',
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setupTests.ts'],
};
