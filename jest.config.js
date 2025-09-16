module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.+(ts|tsx|js)', '**/*.(test|spec).+(ts|tsx|js)'],
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        tsconfig: {
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
        },
      },
    ],
  },
  moduleNameMapper: {
    '@octokit/plugin-throttling': '<rootDir>/src/__mocks__/@octokit/plugin-throttling.js',
    '@octokit/rest': '<rootDir>/src/__mocks__/@octokit/rest.js',
    '^chalk$': '<rootDir>/src/__mocks__/chalk.js',
    '^ora$': '<rootDir>/src/__mocks__/ora.js',
    '^log-update$': '<rootDir>/src/__mocks__/log-update.js',
    '^cli-table3$': '<rootDir>/src/__mocks__/cli-table3.js',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/**/index.ts',
    '!src/cli.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
  testTimeout: 30000,
  verbose: true,
};
