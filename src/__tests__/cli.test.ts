import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runCommand, validateCommand } from '../cli';

// Mock dependencies before imports
jest.mock('../github/client');
jest.mock('../runner');
jest.mock('../config/validator', () => ({
  validateFromString: jest.fn().mockResolvedValue({
    config: {
      organization: 'test-org',
      defaults: {
        checks: {
          'merge-methods': {
            allow_merge_commit: false,
            allow_squash_merge: true,
            allow_rebase_merge: false,
          },
        },
      },
    },
    warnings: [],
  }),
}));

const mockLogger = {
  info: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
  success: jest.fn(),
  debug: jest.fn(),
  showHeader: jest.fn(),
  displaySummary: jest.fn(),
  verbose: false,
  quiet: false,
};

jest.mock('../logging', () => ({
  setLogger: jest.fn(),
  ConsoleLogger: jest.fn(() => mockLogger),
  ProgressLogger: jest.fn(() => mockLogger),
}));

import { validateFromString } from '../config/validator';
import { GitHubClient } from '../github/client';
import * as logging from '../logging';
import { ComplianceRunner } from '../runner';

jest.spyOn(process, 'exit').mockImplementation(() => {
  throw new Error('process.exit');
});

jest.spyOn(console, 'log').mockImplementation();
jest.spyOn(console, 'error').mockImplementation();

describe('CLI Commands', () => {
  const testConfigPath = resolve(__dirname, 'test-config.yml');
  const testConfig = `
organization: test-org
defaults:
  checks:
    merge-methods:
      allow_merge_commit: false
      allow_squash_merge: true
      allow_rebase_merge: false
`;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GITHUB_TOKEN = 'test-token';

    // Write test config file
    writeFileSync(testConfigPath, testConfig);

    // Reset mock logger
    mockLogger.info.mockClear();
    mockLogger.warning.mockClear();
    mockLogger.error.mockClear();
    mockLogger.success.mockClear();
    mockLogger.debug.mockClear();
    mockLogger.showHeader.mockClear();
    mockLogger.displaySummary.mockClear();

    // Mock GitHubClient
    (GitHubClient as jest.MockedClass<typeof GitHubClient>).mockImplementation(
      () =>
        ({
          setOwner: jest.fn(),
          // biome-ignore lint/suspicious/noExplicitAny: Mock object for testing
        }) as any
    );

    // Mock ComplianceRunner
    (ComplianceRunner as jest.MockedClass<typeof ComplianceRunner>).mockImplementation(
      () =>
        ({
          run: jest.fn().mockResolvedValue({
            totalRepositories: 10,
            compliantRepositories: 8,
            nonCompliantRepositories: 1,
            fixedRepositories: 1,
            errorRepositories: 0,
            compliancePercentage: 80,
            executionTime: 5000,
            repositories: [],
          }),
          // biome-ignore lint/suspicious/noExplicitAny: Mock object for testing
        }) as any
    );
  });

  afterEach(() => {
    // Clean up test config
    if (existsSync(testConfigPath)) {
      unlinkSync(testConfigPath);
    }
    // Clean up generated reports
    ['compliance-report.md', 'compliance-report.json'].forEach((file) => {
      if (existsSync(file)) {
        unlinkSync(file);
      }
    });
  });

  describe('run command', () => {
    it('should run compliance checks with default options', async () => {
      await expect(
        runCommand({
          config: testConfigPath,
          token: 'test-token',
        })
      ).rejects.toThrow('process.exit');

      expect(GitHubClient).toHaveBeenCalledWith({
        token: 'test-token',
        throttle: {
          enabled: true,
          retries: 3,
          retryDelay: 1000,
        },
      });

      expect(ComplianceRunner).toHaveBeenCalled();
    });

    it('should run in dry-run mode', async () => {
      await expect(
        runCommand({
          config: testConfigPath,
          token: 'test-token',
          dryRun: true,
        })
      ).rejects.toThrow('process.exit');

      const runnerConstructor = (ComplianceRunner as jest.MockedClass<typeof ComplianceRunner>).mock
        .calls[0];
      expect(runnerConstructor[2]).toMatchObject({
        dryRun: true,
      });
    });

    it('should filter repositories and checks', async () => {
      await expect(
        runCommand({
          config: testConfigPath,
          token: 'test-token',
          repos: 'repo1,repo2',
          checks: 'merge-methods,security-scanning',
        })
      ).rejects.toThrow('process.exit');

      const runnerConstructor = (ComplianceRunner as jest.MockedClass<typeof ComplianceRunner>).mock
        .calls[0];
      expect(runnerConstructor[2]).toMatchObject({
        repos: ['repo1', 'repo2'],
        checks: ['merge-methods', 'security-scanning'],
      });
    });

    it('should generate JSON report', async () => {
      await expect(
        runCommand({
          config: testConfigPath,
          token: 'test-token',
          format: 'json',
        })
      ).rejects.toThrow('process.exit');

      expect(existsSync('compliance-report.json')).toBe(true);
    });

    it('should use custom output path', async () => {
      const customPath = 'custom-report.md';

      await expect(
        runCommand({
          config: testConfigPath,
          token: 'test-token',
          output: customPath,
        })
      ).rejects.toThrow('process.exit');

      expect(existsSync(customPath)).toBe(true);
      unlinkSync(customPath);
    });

    it('should fail if config file does not exist', async () => {
      await expect(
        runCommand({
          config: 'non-existent.yml',
          token: 'test-token',
        })
      ).rejects.toThrow('process.exit');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Configuration file not found')
      );
    });

    it('should fail if token is not provided', async () => {
      delete process.env.GITHUB_TOKEN;

      await expect(
        runCommand({
          config: testConfigPath,
        })
      ).rejects.toThrow('process.exit');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('GITHUB_TOKEN environment variable is required')
      );
    });

    it('should use different output modes', async () => {
      await expect(
        runCommand({
          config: testConfigPath,
          token: 'test-token',
          mode: 'detailed',
        })
      ).rejects.toThrow('process.exit');

      expect(logging.ProgressLogger).toHaveBeenCalledWith({
        verbose: false,
        quiet: false,
        mode: 'detailed',
      });
    });

    it('should handle verbose and quiet flags', async () => {
      await expect(
        runCommand({
          config: testConfigPath,
          token: 'test-token',
          verbose: true,
        })
      ).rejects.toThrow('process.exit');

      expect(logging.ProgressLogger).toHaveBeenCalledWith({
        verbose: true,
        quiet: false,
        mode: 'compact',
      });
    });
  });

  describe('validate command', () => {
    it('should validate a valid configuration', async () => {
      await expect(
        validateCommand({
          config: testConfigPath,
        })
      ).rejects.toThrow('process.exit');

      expect(mockLogger.success).toHaveBeenCalledWith('✅ Configuration is valid!');
    });

    it('should show detailed validation in verbose mode', async () => {
      await expect(
        validateCommand({
          config: testConfigPath,
          verbose: true,
        })
      ).rejects.toThrow('process.exit');

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Configuration Summary')
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Organization: test-org')
      );
    });

    it('should fail if config file does not exist', async () => {
      await expect(
        validateCommand({
          config: 'non-existent.yml',
        })
      ).rejects.toThrow('process.exit');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Configuration file not found')
      );
    });

    it('should fail if organization is missing', async () => {
      const invalidConfig = `
defaults:
  checks:
    merge-methods:
      allow_merge_commit: false
`;
      const invalidConfigPath = resolve(__dirname, 'invalid-config.yml');
      writeFileSync(invalidConfigPath, invalidConfig);

      // Mock validateFromString to return config without organization
      (validateFromString as jest.Mock).mockResolvedValueOnce({
        config: {
          defaults: {
            checks: {
              'merge-methods': {
                allow_merge_commit: false,
              },
            },
          },
        },
        warnings: [],
      });

      await expect(
        validateCommand({
          config: invalidConfigPath,
        })
      ).rejects.toThrow('process.exit');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Missing required field: organization')
      );

      unlinkSync(invalidConfigPath);
    });

    it('should fail if no checks are configured', async () => {
      const invalidConfig = `
organization: test-org
defaults: {}
`;
      const invalidConfigPath = resolve(__dirname, 'no-checks-config.yml');
      writeFileSync(invalidConfigPath, invalidConfig);

      // Mock validateFromString to return config without checks
      (validateFromString as jest.Mock).mockResolvedValueOnce({
        config: {
          organization: 'test-org',
          defaults: {},
        },
        warnings: [],
      });

      await expect(
        validateCommand({
          config: invalidConfigPath,
        })
      ).rejects.toThrow('process.exit');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('No checks configured')
      );

      unlinkSync(invalidConfigPath);
    });

    it('should handle quiet mode', async () => {
      await expect(
        validateCommand({
          config: testConfigPath,
          quiet: true,
        })
      ).rejects.toThrow('process.exit');

      expect(logging.ConsoleLogger).toHaveBeenCalledWith({
        verbose: false,
        quiet: true,
      });
    });
  });
});
