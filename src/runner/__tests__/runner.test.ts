import type { ComplianceConfig } from '../../config/types';
import type { GitHubClient, Repository } from '../../github/types';
import { ComplianceRunner } from '../index';
import type { RunnerOptions } from '../types';

// Mock GitHub client
const mockClient: Partial<GitHubClient> = {
  listRepositories: jest.fn().mockResolvedValue([
    {
      id: 1,
      name: 'test-repo',
      full_name: 'org/test-repo',
      private: false,
      archived: false,
      disabled: false,
      fork: false,
      default_branch: 'main',
      updated_at: '2024-01-01T00:00:00Z',
      pushed_at: '2024-01-01T00:00:00Z',
      stargazers_count: 0,
      forks_count: 0,
      open_issues_count: 0,
      size: 100,
      language: 'TypeScript',
    } as Repository,
  ]),
};

// Mock config
const mockConfig: ComplianceConfig = {
  version: 1,
  organization: 'test-org',
  defaults: {
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
      required_conversation_resolution: false,
      lock_branch: false,
      allow_fork_syncing: false,
    },
  },
};

describe('ComplianceRunner', () => {
  it('should create an instance', () => {
    const options: RunnerOptions = {
      dryRun: true,
      includeArchived: false,
    };

    const runner = new ComplianceRunner(mockClient as GitHubClient, mockConfig, options);

    expect(runner).toBeInstanceOf(ComplianceRunner);
  });

  it('should run checks and generate report', async () => {
    const options: RunnerOptions = {
      dryRun: true,
      includeArchived: false,
    };

    const runner = new ComplianceRunner(mockClient as GitHubClient, mockConfig, options);

    const report = await runner.run();

    expect(report).toHaveProperty('totalRepositories');
    expect(report).toHaveProperty('compliancePercentage');
    expect(report.totalRepositories).toBe(1);
  });

  it('should filter checks when specified', async () => {
    const options: RunnerOptions = {
      dryRun: true,
      includeArchived: false,
      checks: ['merge-methods'],
    };

    const runner = new ComplianceRunner(mockClient as GitHubClient, mockConfig, options);

    const report = await runner.run();

    expect(report).toHaveProperty('repositories');
    // Since we're using a mock, detailed assertions would depend on mock implementations
  });

  it('should handle empty repository list', async () => {
    const emptyClient: Partial<GitHubClient> = {
      listRepositories: jest.fn().mockResolvedValue([]),
    };

    const options: RunnerOptions = {
      dryRun: true,
      includeArchived: false,
    };

    const runner = new ComplianceRunner(emptyClient as GitHubClient, mockConfig, options);

    const report = await runner.run();

    expect(report.totalRepositories).toBe(0);
    expect(report.compliancePercentage).toBe(100);
  });
});
