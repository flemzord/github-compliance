import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as core from '@actions/core';
import * as github from '@actions/github';
import type { ComplianceConfig } from './config/types';
import { validateFromString } from './config/validator';
import { GitHubClient } from './github/client';
import { run } from './main-integrated';
import { JsonReporter, MarkdownReporter } from './reporting';
import { ComplianceRunner } from './runner';
import type { RunnerReport } from './runner/types';

// Mock all dependencies
jest.mock('node:fs', () => ({
  existsSync: jest.fn(),
  writeFileSync: jest.fn(),
  promises: {
    access: jest.fn(),
    writeFile: jest.fn(),
  },
  constants: {
    O_RDONLY: 0,
    F_OK: 0,
    R_OK: 4,
    W_OK: 2,
    X_OK: 1,
  },
}));
jest.mock('node:path');
jest.mock('@actions/core');
jest.mock('@actions/github');
jest.mock('./config/validator');
jest.mock('./github/client');
jest.mock('./reporting');
jest.mock('./runner');

// Type the mocked modules
const mockedFs = jest.mocked({ existsSync, writeFileSync });
const mockedPath = jest.mocked({ resolve });
const mockedCore = jest.mocked(core);
const mockedGithub = jest.mocked(github);
const mockedValidateFromString = jest.mocked(validateFromString);
const mockedGitHubClient = jest.mocked(GitHubClient);
const mockedJsonReporter = jest.mocked(JsonReporter);
const mockedMarkdownReporter = jest.mocked(MarkdownReporter);
const mockedComplianceRunner = jest.mocked(ComplianceRunner);

// Mock constants
const mockConfig: ComplianceConfig = {
  version: 1 as const,
  organization: 'test-org',
  defaults: {
    merge_methods: {
      allow_merge_commit: false,
      allow_squash_merge: true,
      allow_rebase_merge: false,
    },
    branch_protection: {
      patterns: ['main'],
      enforce_admins: true,
      required_reviews: {
        dismiss_stale_reviews: true,
        required_approving_review_count: 1,
        require_code_owner_reviews: false,
        require_last_push_approval: false,
      },
      required_status_checks: {
        auto_discover: true,
        contexts: ['tests'],
        strict: true,
      },
      restrictions: {
        users: [],
        teams: [],
      },
      allow_force_pushes: false,
      allow_deletions: false,
      required_conversation_resolution: true,
      lock_branch: false,
      allow_fork_syncing: false,
    },
  },
};

const mockRunnerReport: RunnerReport = {
  totalRepositories: 10,
  compliantRepositories: 10,
  nonCompliantRepositories: 0,
  fixedRepositories: 1,
  errorRepositories: 0,
  repositories: [],
  compliancePercentage: 100,
  executionTime: 5000,
  timestamp: '2024-01-01T00:00:00Z',
};

describe('main-integrated', () => {
  let mockRunner: jest.Mocked<ComplianceRunner>;
  let mockClient: jest.Mocked<GitHubClient>;
  let mockJsonReporterInstance: jest.Mocked<JsonReporter>;
  let mockMarkdownReporterInstance: jest.Mocked<MarkdownReporter>;
  let mockSummary: { addRaw: jest.Mock; write: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset process.env
    delete process.env.GITHUB_STEP_SUMMARY;

    // Setup default file system behavior
    mockedFs.writeFileSync.mockImplementation(() => {
      /* mock */
    });

    // Setup mock summary
    mockSummary = {
      addRaw: jest.fn().mockReturnThis(),
      write: jest.fn().mockResolvedValue(undefined),
    };

    // Setup default mocks
    mockedCore.getInput.mockImplementation((name: string) => {
      switch (name) {
        case 'token':
          return 'test-token';
        case 'config_path':
          return '.github/compliance.yml';
        case 'checks':
          return '';
        case 'repos':
          return '';
        case 'report_format':
          return '';
        default:
          return '';
      }
    });

    mockedCore.getBooleanInput.mockImplementation((name: string) => {
      switch (name) {
        case 'dry_run':
          return false;
        case 'include_archived':
          return false;
        default:
          return false;
      }
    });

    Object.defineProperty(mockedCore, 'summary', {
      value: mockSummary,
      writable: true,
    });

    mockedPath.resolve.mockReturnValue('/absolute/path/.github/compliance.yml');
    mockedFs.existsSync.mockReturnValue(true);

    // Setup GitHub context mock
    mockedGithub.context = {
      payload: {
        organization: { login: 'test-org' },
        repository: { full_name: 'test-org/test-repo' },
      },
    } as CheckContext;

    // Setup validator mock - when called with file path, returns object with config and warnings
    mockedValidateFromString.mockResolvedValue({
      config: mockConfig,
      warnings: [],
    } as { config: ComplianceConfig; warnings: string[] });

    // Setup client mock
    mockClient = {
      setOwner: jest.fn(),
    } as GitHubClient;
    mockedGitHubClient.mockImplementation(() => mockClient);

    // Setup reporter mocks
    mockJsonReporterInstance = {
      generateReport: jest.fn().mockReturnValue('{"test": "json"}'),
    } as JsonReporter;
    mockMarkdownReporterInstance = {
      generateReport: jest.fn().mockReturnValue('# Test Report'),
      generateSummary: jest.fn().mockReturnValue('## Summary'),
    } as MarkdownReporter;
    mockedJsonReporter.mockImplementation(() => mockJsonReporterInstance);
    mockedMarkdownReporter.mockImplementation(() => mockMarkdownReporterInstance);

    // Setup runner mock
    mockRunner = {
      run: jest.fn().mockResolvedValue(mockRunnerReport),
      // biome-ignore lint/suspicious/noExplicitAny: Mock ComplianceRunner for testing
    } as any;
    mockedComplianceRunner.mockImplementation(() => mockRunner);
  });

  describe('successful execution', () => {
    it('should run successfully with default configuration', async () => {
      await run();

      expect(mockedCore.info).toHaveBeenCalledWith('🚀 GitHub Compliance Action starting...');
      expect(mockedCore.info).toHaveBeenCalledWith('📋 Loading and validating configuration...');
      expect(mockedCore.info).toHaveBeenCalledWith('🔗 Connecting to GitHub...');
      expect(mockedCore.info).toHaveBeenCalledWith('🏃 Running compliance checks...');
      expect(mockedCore.info).toHaveBeenCalledWith('📝 Generating reports...');
      expect(mockedCore.info).toHaveBeenCalledWith('✅ All repositories are compliant!');

      expect(mockedCore.setOutput).toHaveBeenCalledWith('report_path', 'compliance-report.md');
      expect(mockedCore.setOutput).toHaveBeenCalledWith('compliance_percentage', '100');
      expect(mockedCore.setOutput).toHaveBeenCalledWith('non_compliant_count', '0');
      expect(mockedCore.setOutput).toHaveBeenCalledWith('total_repositories', '10');
      expect(mockedCore.setOutput).toHaveBeenCalledWith('fixed_repositories', '1');

      expect(mockedCore.setFailed).not.toHaveBeenCalled();
    });

    it('should generate JSON report when format is json', async () => {
      mockedCore.getInput.mockImplementation((name: string) => {
        if (name === 'report_format') return 'json';
        if (name === 'token') return 'test-token';
        if (name === 'config_path') return '.github/compliance.yml';
        return '';
      });

      await run();

      expect(mockJsonReporterInstance.generateReport).toHaveBeenCalledWith(mockRunnerReport);
      expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
        'compliance-report.json',
        '{"test": "json"}'
      );
      expect(mockedCore.setOutput).toHaveBeenCalledWith('report_path', 'compliance-report.json');
    });

    it('should generate markdown report by default', async () => {
      await run();

      expect(mockMarkdownReporterInstance.generateReport).toHaveBeenCalledWith(mockRunnerReport);
      expect(mockedFs.writeFileSync).toHaveBeenCalledWith('compliance-report.md', '# Test Report');
      expect(mockedCore.setOutput).toHaveBeenCalledWith('report_path', 'compliance-report.md');
    });

    it('should handle dry run mode', async () => {
      mockedCore.getBooleanInput.mockImplementation((name: string) => {
        if (name === 'dry_run') return true;
        return false;
      });

      await run();

      expect(mockedCore.info).toHaveBeenCalledWith(
        '🔍 Running in DRY-RUN mode - no changes will be made'
      );
    });

    it('should parse and use specific checks input', async () => {
      mockedCore.getInput.mockImplementation((name: string) => {
        if (name === 'checks') return 'branch_protection,merge_methods';
        if (name === 'token') return 'test-token';
        if (name === 'config_path') return '.github/compliance.yml';
        return '';
      });

      await run();

      expect(mockedComplianceRunner).toHaveBeenCalledWith(
        mockClient,
        mockConfig,
        expect.objectContaining({
          checks: ['branch_protection', 'merge_methods'],
        })
      );
    });

    it('should parse and use specific repos input', async () => {
      mockedCore.getInput.mockImplementation((name: string) => {
        if (name === 'repos') return 'repo1,repo2,repo3';
        if (name === 'token') return 'test-token';
        if (name === 'config_path') return '.github/compliance.yml';
        return '';
      });

      await run();

      expect(mockedComplianceRunner).toHaveBeenCalledWith(
        mockClient,
        mockConfig,
        expect.objectContaining({
          repos: ['repo1', 'repo2', 'repo3'],
        })
      );
    });

    it('should handle include_archived option', async () => {
      mockedCore.getBooleanInput.mockImplementation((name: string) => {
        if (name === 'include_archived') return true;
        return false;
      });

      await run();

      expect(mockedComplianceRunner).toHaveBeenCalledWith(
        mockClient,
        mockConfig,
        expect.objectContaining({
          includeArchived: true,
        })
      );
    });

    it('should set owner from organization context', async () => {
      await run();

      expect(mockClient.setOwner).toHaveBeenCalledWith('test-org');
    });

    it('should set owner from repository context when no organization', async () => {
      mockedGithub.context = {
        payload: {
          repository: { full_name: 'owner/repo' },
        },
        // biome-ignore lint/suspicious/noExplicitAny: Mock CheckContext for testing
      } as any;

      await run();

      expect(mockClient.setOwner).toHaveBeenCalledWith('owner');
    });

    it('should generate GitHub Actions summary when GITHUB_STEP_SUMMARY is set', async () => {
      process.env.GITHUB_STEP_SUMMARY = 'true';

      await run();

      expect(mockMarkdownReporterInstance.generateSummary).toHaveBeenCalledWith(mockRunnerReport);
      expect(mockSummary.addRaw).toHaveBeenCalledWith('## Summary');
      expect(mockSummary.write).toHaveBeenCalled();
    });
  });

  describe('configuration validation', () => {
    it('should handle configuration warnings', async () => {
      mockedValidateFromString.mockResolvedValue({
        config: mockConfig,
        warnings: ['Warning 1', 'Warning 2'],
        // biome-ignore lint/suspicious/noExplicitAny: Mock validation result for testing
      } as any);

      await run();

      expect(mockedCore.warning).toHaveBeenCalledWith('Configuration warnings:');
      expect(mockedCore.warning).toHaveBeenCalledWith('  - Warning 1');
      expect(mockedCore.warning).toHaveBeenCalledWith('  - Warning 2');
    });

    it('should handle configuration file not found', async () => {
      mockedFs.existsSync.mockReturnValue(false);

      await run();

      expect(mockedCore.setFailed).toHaveBeenCalledWith(
        'Configuration file not found: /absolute/path/.github/compliance.yml'
      );
    });

    it('should handle configuration with just config (no warnings)', async () => {
      mockedValidateFromString.mockResolvedValue({
        config: mockConfig,
        warnings: [],
        // biome-ignore lint/suspicious/noExplicitAny: Mock validation result for testing
      } as any);

      await run();

      expect(mockedCore.warning).not.toHaveBeenCalledWith('Configuration warnings:');
      expect(mockRunner.run).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle generic Error with message and stack', async () => {
      const error = new Error('Test error');
      error.stack = 'Error stack trace';
      mockedValidateFromString.mockRejectedValue(error);

      await run();

      expect(mockedCore.setFailed).toHaveBeenCalledWith('Test error');
      expect(mockedCore.debug).toHaveBeenCalledWith('Error stack trace');
    });

    it('should handle Error without stack trace', async () => {
      const error = new Error('Test error');
      delete error.stack;
      mockedValidateFromString.mockRejectedValue(error);

      await run();

      expect(mockedCore.setFailed).toHaveBeenCalledWith('Test error');
      expect(mockedCore.debug).not.toHaveBeenCalled();
    });

    it('should handle non-Error exceptions', async () => {
      mockedValidateFromString.mockRejectedValue('String error');

      await run();

      expect(mockedCore.setFailed).toHaveBeenCalledWith('An unknown error occurred');
    });

    it('should handle runner errors', async () => {
      const error = new Error('Runner error');
      mockRunner.run.mockRejectedValue(error);

      await run();

      expect(mockedCore.setFailed).toHaveBeenCalledWith('Runner error');
    });

    it('should handle file write errors', async () => {
      const error = new Error('Write error');
      mockedFs.writeFileSync.mockImplementation(() => {
        throw error;
      });

      await run();

      expect(mockedCore.setFailed).toHaveBeenCalledWith('Write error');
    });
  });

  describe('compliance status handling', () => {
    beforeEach(() => {
      // Reset the writeFileSync mock to not throw errors for these tests
      mockedFs.writeFileSync.mockImplementation(() => {
        /* mock */
      });
    });

    it('should set failed status for non-compliant repositories in production mode', async () => {
      const nonCompliantReport: RunnerReport = {
        ...mockRunnerReport,
        nonCompliantRepositories: 3,
        compliantRepositories: 7,
      };
      mockRunner.run.mockResolvedValue(nonCompliantReport);

      await run();

      expect(mockedCore.setFailed).toHaveBeenCalledWith('3 repositories are non-compliant');
    });

    it('should not set failed status for non-compliant repositories in dry-run mode', async () => {
      mockedCore.getBooleanInput.mockImplementation((name: string) => {
        if (name === 'dry_run') return true;
        return false;
      });

      const nonCompliantReport: RunnerReport = {
        ...mockRunnerReport,
        nonCompliantRepositories: 3,
        compliantRepositories: 7,
      };
      mockRunner.run.mockResolvedValue(nonCompliantReport);

      await run();

      expect(mockedCore.setFailed).not.toHaveBeenCalled();
      expect(mockedCore.info).toHaveBeenCalledWith('✅ All repositories are compliant!');
    });

    it('should set failed status for repositories with errors', async () => {
      const errorReport: RunnerReport = {
        ...mockRunnerReport,
        errorRepositories: 2,
        nonCompliantRepositories: 0,
      };
      mockRunner.run.mockResolvedValue(errorReport);

      await run();

      expect(mockedCore.setFailed).toHaveBeenCalledWith(
        '2 repositories had errors during checking'
      );
    });

    it('should prioritize non-compliant over error status', async () => {
      const mixedReport: RunnerReport = {
        ...mockRunnerReport,
        nonCompliantRepositories: 2,
        errorRepositories: 1,
      };
      mockRunner.run.mockResolvedValue(mixedReport);

      await run();

      expect(mockedCore.setFailed).toHaveBeenCalledWith('2 repositories are non-compliant');
    });
  });

  describe('input parsing edge cases', () => {
    it('should handle empty checks input', async () => {
      mockedCore.getInput.mockImplementation((name: string) => {
        if (name === 'checks') return '';
        if (name === 'token') return 'test-token';
        if (name === 'config_path') return '.github/compliance.yml';
        return '';
      });

      await run();

      expect(mockedComplianceRunner).toHaveBeenCalledWith(
        mockClient,
        mockConfig,
        expect.objectContaining({
          dryRun: false,
          includeArchived: false,
          concurrency: 5,
        })
      );
    });

    it('should handle checks with whitespace', async () => {
      mockedCore.getInput.mockImplementation((name: string) => {
        if (name === 'checks') return ' branch_protection , merge_methods ';
        if (name === 'token') return 'test-token';
        if (name === 'config_path') return '.github/compliance.yml';
        return '';
      });

      await run();

      expect(mockedComplianceRunner).toHaveBeenCalledWith(
        mockClient,
        mockConfig,
        expect.objectContaining({
          checks: ['branch_protection', 'merge_methods'],
        })
      );
    });

    it('should handle repos with whitespace', async () => {
      mockedCore.getInput.mockImplementation((name: string) => {
        if (name === 'repos') return ' repo1 , repo2 , repo3 ';
        if (name === 'token') return 'test-token';
        if (name === 'config_path') return '.github/compliance.yml';
        return '';
      });

      await run();

      expect(mockedComplianceRunner).toHaveBeenCalledWith(
        mockClient,
        mockConfig,
        expect.objectContaining({
          repos: ['repo1', 'repo2', 'repo3'],
        })
      );
    });

    it('should handle missing required token input', async () => {
      mockedCore.getInput.mockImplementation((name: string) => {
        if (name === 'token') return '';
        if (name === 'config_path') return '.github/compliance.yml';
        return '';
      });

      await run();

      // The actual GitHub Actions framework would throw before we get here,
      // but we test that our code doesn't break with empty token
      expect(mockedGitHubClient).toHaveBeenCalledWith(
        expect.objectContaining({
          token: '',
        })
      );
    });
  });

  describe('GitHub client configuration', () => {
    it('should configure client with throttling options', async () => {
      await run();

      expect(mockedGitHubClient).toHaveBeenCalledWith({
        token: 'test-token',
        throttle: {
          enabled: true,
          retries: 3,
          retryDelay: 1000,
        },
      });
    });

    it('should not set owner when no context is available', async () => {
      mockedGithub.context = {
        payload: {},
        // biome-ignore lint/suspicious/noExplicitAny: Mock GitHub context for testing
      } as any;

      await run();

      expect(mockClient.setOwner).not.toHaveBeenCalled();
    });
  });

  describe('runner options construction', () => {
    it('should create runner options with all parameters', async () => {
      mockedCore.getInput.mockImplementation((name: string) => {
        if (name === 'token') return 'test-token';
        if (name === 'config_path') return '.github/compliance.yml';
        if (name === 'checks') return 'check1,check2';
        if (name === 'repos') return 'repo1,repo2';
        return '';
      });

      mockedCore.getBooleanInput.mockImplementation((name: string) => {
        if (name === 'dry_run') return true;
        if (name === 'include_archived') return true;
        return false;
      });

      await run();

      expect(mockedComplianceRunner).toHaveBeenCalledWith(mockClient, mockConfig, {
        dryRun: true,
        checks: ['check1', 'check2'],
        includeArchived: true,
        repos: ['repo1', 'repo2'],
        concurrency: 5,
      });
    });

    it('should create runner options without optional parameters', async () => {
      await run();

      expect(mockedComplianceRunner).toHaveBeenCalledWith(mockClient, mockConfig, {
        dryRun: false,
        includeArchived: false,
        concurrency: 5,
      });
    });
  });

  describe('report generation', () => {
    it('should write report to correct file', async () => {
      await run();

      expect(mockedFs.writeFileSync).toHaveBeenCalledWith('compliance-report.md', '# Test Report');
      expect(mockedCore.info).toHaveBeenCalledWith('Report written to compliance-report.md');
    });

    it('should handle different report formats correctly', async () => {
      mockedCore.getInput.mockImplementation((name: string) => {
        if (name === 'report_format') return 'json';
        if (name === 'token') return 'test-token';
        if (name === 'config_path') return '.github/compliance.yml';
        return '';
      });

      await run();

      expect(mockedJsonReporter).toHaveBeenCalled();
      expect(mockJsonReporterInstance.generateReport).toHaveBeenCalledWith(mockRunnerReport);
      expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
        'compliance-report.json',
        '{"test": "json"}'
      );
    });

    it('should always generate summary with markdown reporter even for JSON reports', async () => {
      mockedCore.getInput.mockImplementation((name: string) => {
        if (name === 'report_format') return 'json';
        if (name === 'token') return 'test-token';
        if (name === 'config_path') return '.github/compliance.yml';
        return '';
      });
      process.env.GITHUB_STEP_SUMMARY = 'true';

      await run();

      // Should be called twice: once for JSON report (which we won't), and once for summary
      expect(mockedMarkdownReporter).toHaveBeenCalledTimes(1);
      expect(mockMarkdownReporterInstance.generateSummary).toHaveBeenCalledWith(mockRunnerReport);
    });
  });
});

describe('module execution', () => {
  it('should run when called as main module', () => {
    // The module execution logic is tested implicitly by running the main function
    // We can test that the export exists and is callable
    expect(typeof run).toBe('function');
  });
});
