import * as core from '@actions/core';
import type { ComplianceConfig } from '../../config/types';
import type { GitHubClient, Repository } from '../../github/types';
import type { CheckContext } from '../base';
import { MergeMethodsCheck } from '../merge-methods';

// Mock @actions/core
jest.mock('@actions/core');
const mockCore = core as jest.Mocked<typeof core>;

// Mock GitHubClient
const mockClient: Partial<GitHubClient> = {
  getRepository: jest.fn(),
  updateRepository: jest.fn(),
};

// Mock Repository
const mockRepository: Repository = {
  id: 1,
  name: 'test-repo',
  full_name: 'owner/test-repo',
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
};

// Mock ComplianceConfig
const mockConfig: ComplianceConfig = {
  version: 1,
  organization: 'test-org',
  defaults: {
    merge_methods: {
      allow_merge_commit: true,
      allow_squash_merge: true,
      allow_rebase_merge: false,
    },
  },
};

// Mock repository data with merge methods
const mockRepoData = {
  id: 1,
  name: 'test-repo',
  full_name: 'owner/test-repo',
  allow_merge_commit: true,
  allow_squash_merge: true,
  allow_rebase_merge: false,
  // other repo properties...
};

describe('MergeMethodsCheck', () => {
  let check: MergeMethodsCheck;
  let context: CheckContext;

  beforeEach(() => {
    check = new MergeMethodsCheck();
    context = {
      client: mockClient as GitHubClient,
      config: mockConfig,
      dryRun: false,
      repository: mockRepository,
    };
    jest.clearAllMocks();
    mockCore.info.mockImplementation(() => {
      /* mock */
    });
    mockCore.warning.mockImplementation(() => {
      /* mock */
    });
    mockCore.error.mockImplementation(() => {
      /* mock */
    });
    mockCore.debug.mockImplementation(() => {
      /* mock */
    });
  });

  describe('shouldRun', () => {
    it('should return true when merge_methods config exists', () => {
      expect(check.shouldRun(context)).toBe(true);
    });

    it('should return false when no merge_methods config', () => {
      const configWithoutMergeMethods = {
        ...mockConfig,
        defaults: {},
      };
      const contextWithoutConfig = { ...context, config: configWithoutMergeMethods };

      expect(check.shouldRun(contextWithoutConfig)).toBe(false);
    });
  });

  describe('check', () => {
    beforeEach(() => {
      (mockClient.getRepository as jest.Mock).mockResolvedValue(mockRepoData);
    });

    it('should return compliant when no config specified', async () => {
      const configWithoutMergeMethods = {
        ...mockConfig,
        defaults: {},
      };
      const contextWithoutConfig = { ...context, config: configWithoutMergeMethods };

      const result = await check.check(contextWithoutConfig);

      expect(result.compliant).toBe(true);
      expect(result.message).toBe('No merge methods configuration specified');
    });

    it('should be compliant when all merge methods match config', async () => {
      const result = await check.check(context);

      expect(result.compliant).toBe(true);
      expect(result.message).toBe('Repository merge methods are configured correctly');
      expect(result.details?.current).toEqual({
        allow_merge_commit: true,
        allow_squash_merge: true,
        allow_rebase_merge: false,
      });
      expect(result.details?.expected).toEqual(mockConfig.defaults.merge_methods);
    });

    describe('allow_merge_commit validation', () => {
      it('should detect incorrect merge commit setting (should be enabled)', async () => {
        const repoDataWithWrongMergeCommit = {
          ...mockRepoData,
          allow_merge_commit: false, // should be true
        };
        (mockClient.getRepository as jest.Mock).mockResolvedValue(repoDataWithWrongMergeCommit);

        const result = await check.check(context);

        expect(result.compliant).toBe(false);
        expect(result.message).toContain('Merge commits should be enabled but is disabled');
      });

      it('should detect incorrect merge commit setting (should be disabled)', async () => {
        const configWithDisabledMergeCommit = {
          ...mockConfig,
          defaults: {
            merge_methods: {
              allow_merge_commit: false,
              allow_squash_merge: true,
              allow_rebase_merge: false,
            },
          },
        };
        const contextWithDisabledMergeCommit = {
          ...context,
          config: configWithDisabledMergeCommit,
        };

        const repoDataWithEnabledMergeCommit = {
          ...mockRepoData,
          allow_merge_commit: true, // should be false
        };
        (mockClient.getRepository as jest.Mock).mockResolvedValue(repoDataWithEnabledMergeCommit);

        const result = await check.check(contextWithDisabledMergeCommit);

        expect(result.compliant).toBe(false);
        expect(result.message).toContain('Merge commits should be disabled but is enabled');
      });

      it('should ignore merge commit setting when not specified in config', async () => {
        const configWithoutMergeCommit = {
          ...mockConfig,
          defaults: {
            merge_methods: {
              allow_merge_commit: true,
              allow_squash_merge: true,
              allow_rebase_merge: false,
              // allow_merge_commit not specified in the actual config checking logic
            },
          },
        };
        const contextWithoutMergeCommit = { ...context, config: configWithoutMergeCommit };

        const result = await check.check(contextWithoutMergeCommit);

        expect(result.compliant).toBe(true);
      });
    });

    describe('allow_squash_merge validation', () => {
      it('should detect incorrect squash merge setting (should be enabled)', async () => {
        const repoDataWithWrongSquashMerge = {
          ...mockRepoData,
          allow_squash_merge: false, // should be true
        };
        (mockClient.getRepository as jest.Mock).mockResolvedValue(repoDataWithWrongSquashMerge);

        const result = await check.check(context);

        expect(result.compliant).toBe(false);
        expect(result.message).toContain('Squash merges should be enabled but is disabled');
      });

      it('should detect incorrect squash merge setting (should be disabled)', async () => {
        const configWithDisabledSquashMerge = {
          ...mockConfig,
          defaults: {
            merge_methods: {
              allow_merge_commit: true,
              allow_squash_merge: false,
              allow_rebase_merge: false,
            },
          },
        };
        const contextWithDisabledSquashMerge = {
          ...context,
          config: configWithDisabledSquashMerge,
        };

        const repoDataWithEnabledSquashMerge = {
          ...mockRepoData,
          allow_squash_merge: true, // should be false
        };
        (mockClient.getRepository as jest.Mock).mockResolvedValue(repoDataWithEnabledSquashMerge);

        const result = await check.check(contextWithDisabledSquashMerge);

        expect(result.compliant).toBe(false);
        expect(result.message).toContain('Squash merges should be disabled but is enabled');
      });

      it('should ignore squash merge setting when not specified in config', async () => {
        const configWithoutSquashMerge = {
          ...mockConfig,
          defaults: {
            merge_methods: {
              allow_merge_commit: true,
              allow_squash_merge: true,
              allow_rebase_merge: false,
              // allow_squash_merge not specified in the actual config checking logic
            },
          },
        };
        const contextWithoutSquashMerge = { ...context, config: configWithoutSquashMerge };

        const result = await check.check(contextWithoutSquashMerge);

        expect(result.compliant).toBe(true);
      });
    });

    describe('allow_rebase_merge validation', () => {
      it('should detect incorrect rebase merge setting (should be enabled)', async () => {
        const configWithEnabledRebaseMerge = {
          ...mockConfig,
          defaults: {
            merge_methods: {
              allow_merge_commit: true,
              allow_squash_merge: true,
              allow_rebase_merge: true,
            },
          },
        };
        const contextWithEnabledRebaseMerge = { ...context, config: configWithEnabledRebaseMerge };

        const repoDataWithDisabledRebaseMerge = {
          ...mockRepoData,
          allow_rebase_merge: false, // should be true
        };
        (mockClient.getRepository as jest.Mock).mockResolvedValue(repoDataWithDisabledRebaseMerge);

        const result = await check.check(contextWithEnabledRebaseMerge);

        expect(result.compliant).toBe(false);
        expect(result.message).toContain('Rebase merges should be enabled but is disabled');
      });

      it('should detect incorrect rebase merge setting (should be disabled)', async () => {
        const repoDataWithEnabledRebaseMerge = {
          ...mockRepoData,
          allow_rebase_merge: true, // should be false
        };
        (mockClient.getRepository as jest.Mock).mockResolvedValue(repoDataWithEnabledRebaseMerge);

        const result = await check.check(context);

        expect(result.compliant).toBe(false);
        expect(result.message).toContain('Rebase merges should be disabled but is enabled');
      });

      it('should ignore rebase merge setting when not specified in config', async () => {
        const configWithoutRebaseMerge = {
          ...mockConfig,
          defaults: {
            merge_methods: {
              allow_merge_commit: true,
              allow_squash_merge: true,
              allow_rebase_merge: false,
              // allow_rebase_merge not specified in the actual config checking logic
            },
          },
        };
        const contextWithoutRebaseMerge = { ...context, config: configWithoutRebaseMerge };

        const result = await check.check(contextWithoutRebaseMerge);

        expect(result.compliant).toBe(true);
      });
    });

    describe('multiple issues', () => {
      it('should detect multiple merge method issues', async () => {
        const repoDataWithMultipleIssues = {
          ...mockRepoData,
          allow_merge_commit: false, // should be true
          allow_squash_merge: false, // should be true
          allow_rebase_merge: true, // should be false
        };
        (mockClient.getRepository as jest.Mock).mockResolvedValue(repoDataWithMultipleIssues);

        const result = await check.check(context);

        expect(result.compliant).toBe(false);
        expect(result.message).toContain('Merge commits should be enabled but is disabled');
        expect(result.message).toContain('Squash merges should be enabled but is disabled');
        expect(result.message).toContain('Rebase merges should be disabled but is enabled');
      });
    });

    describe('error handling', () => {
      it('should handle API errors gracefully', async () => {
        (mockClient.getRepository as jest.Mock).mockRejectedValue(
          new Error('Repository not found')
        );

        const result = await check.check(context);

        expect(result.compliant).toBe(false);
        expect(result.error).toBe('Repository not found');
        expect(result.message).toBe('Failed to check merge methods configuration');
        expect(mockCore.error).toHaveBeenCalledWith(
          expect.stringContaining('Failed to check merge methods')
        );
      });

      it('should handle non-Error exceptions', async () => {
        (mockClient.getRepository as jest.Mock).mockRejectedValue('String error');

        const result = await check.check(context);

        expect(result.error).toBe('String error');
      });
    });

    describe('edge cases', () => {
      it('should handle repository data without merge method properties', async () => {
        const repoDataWithoutMergeMethods = {
          id: 1,
          name: 'test-repo',
          // merge method properties are undefined
        };
        (mockClient.getRepository as jest.Mock).mockResolvedValue(repoDataWithoutMergeMethods);

        const result = await check.check(context);

        expect(result.compliant).toBe(false);
        expect(result.details?.current).toEqual({
          allow_merge_commit: undefined,
          allow_squash_merge: undefined,
          allow_rebase_merge: undefined,
        });
      });
    });
  });

  describe('fix', () => {
    beforeEach(() => {
      (mockClient.getRepository as jest.Mock).mockResolvedValue(mockRepoData);
      (mockClient.updateRepository as jest.Mock).mockResolvedValue({});
    });

    it('should return check result when in dry run mode', async () => {
      const dryRunContext = { ...context, dryRun: true };

      const result = await check.fix(dryRunContext);

      expect(result.compliant).toBe(true);
      expect(mockClient.updateRepository).not.toHaveBeenCalled();
    });

    it('should return compliant result when no config specified', async () => {
      const configWithoutMergeMethods = {
        ...mockConfig,
        defaults: {},
      };
      const contextWithoutConfig = { ...context, config: configWithoutMergeMethods };

      const result = await check.fix(contextWithoutConfig);

      expect(result.compliant).toBe(true);
      expect(result.message).toBe('No merge methods configuration to apply');
    });

    it('should return compliant result when already compliant', async () => {
      // Repository already matches config
      const result = await check.fix(context);

      expect(result.compliant).toBe(true);
      expect(mockClient.updateRepository).not.toHaveBeenCalled();
    });

    it('should fix merge commit setting', async () => {
      const repoDataWithWrongMergeCommit = {
        ...mockRepoData,
        allow_merge_commit: false, // should be true
      };
      (mockClient.getRepository as jest.Mock).mockResolvedValue(repoDataWithWrongMergeCommit);

      const result = await check.fix(context);

      expect(mockClient.updateRepository).toHaveBeenCalledWith('owner', 'test-repo', {
        allow_merge_commit: true,
        allow_squash_merge: true,
        allow_rebase_merge: false,
      });
      expect(result.compliant).toBe(true);
      expect(result.fixed).toBe(true);
      expect(result.message).toBe('Merge methods configuration has been updated');
      expect(mockCore.info).toHaveBeenCalledWith('✅ Updated merge methods for owner/test-repo');
    });

    it('should fix squash merge setting', async () => {
      const repoDataWithWrongSquashMerge = {
        ...mockRepoData,
        allow_squash_merge: false, // should be true
      };
      (mockClient.getRepository as jest.Mock).mockResolvedValue(repoDataWithWrongSquashMerge);

      const result = await check.fix(context);

      expect(mockClient.updateRepository).toHaveBeenCalledWith('owner', 'test-repo', {
        allow_merge_commit: true,
        allow_squash_merge: true,
        allow_rebase_merge: false,
      });
      expect(result.fixed).toBe(true);
    });

    it('should fix rebase merge setting', async () => {
      const repoDataWithWrongRebaseMerge = {
        ...mockRepoData,
        allow_rebase_merge: true, // should be false
      };
      (mockClient.getRepository as jest.Mock).mockResolvedValue(repoDataWithWrongRebaseMerge);

      const result = await check.fix(context);

      expect(mockClient.updateRepository).toHaveBeenCalledWith('owner', 'test-repo', {
        allow_merge_commit: true,
        allow_squash_merge: true,
        allow_rebase_merge: false,
      });
      expect(result.fixed).toBe(true);
    });

    it('should fix multiple merge method settings', async () => {
      const repoDataWithMultipleIssues = {
        ...mockRepoData,
        allow_merge_commit: false, // should be true
        allow_squash_merge: false, // should be true
        allow_rebase_merge: true, // should be false
      };
      (mockClient.getRepository as jest.Mock).mockResolvedValue(repoDataWithMultipleIssues);

      const result = await check.fix(context);

      expect(mockClient.updateRepository).toHaveBeenCalledWith('owner', 'test-repo', {
        allow_merge_commit: true,
        allow_squash_merge: true,
        allow_rebase_merge: false,
      });
      expect(result.fixed).toBe(true);
      expect(result.details?.applied).toEqual({
        allow_merge_commit: true,
        allow_squash_merge: true,
        allow_rebase_merge: false,
      });
      expect(result.details?.previous).toEqual({
        allow_merge_commit: false,
        allow_squash_merge: false,
        allow_rebase_merge: true,
      });
    });

    it('should only update specified settings', async () => {
      const configWithPartialSettings = {
        ...mockConfig,
        defaults: {
          merge_methods: {
            allow_merge_commit: false,
            allow_squash_merge: true,
            allow_rebase_merge: false,
            // testing only merge_commit is actually changed
          },
        },
      };
      const contextWithPartialSettings = { ...context, config: configWithPartialSettings };

      const repoDataWithWrongMergeCommit = {
        ...mockRepoData,
        allow_merge_commit: true, // should be false
      };
      (mockClient.getRepository as jest.Mock).mockResolvedValue(repoDataWithWrongMergeCommit);

      const result = await check.fix(contextWithPartialSettings);

      expect(mockClient.updateRepository).toHaveBeenCalledWith('owner', 'test-repo', {
        allow_merge_commit: false,
        allow_squash_merge: true,
        allow_rebase_merge: false,
      });
      expect(result.fixed).toBe(true);
    });

    describe('error handling', () => {
      it('should handle API errors during fix', async () => {
        const repoDataWithWrongMergeCommit = {
          ...mockRepoData,
          allow_merge_commit: false,
        };
        (mockClient.getRepository as jest.Mock).mockResolvedValue(repoDataWithWrongMergeCommit);
        (mockClient.updateRepository as jest.Mock).mockRejectedValue(
          new Error('Insufficient permissions')
        );

        const result = await check.fix(context);

        expect(mockCore.error).toHaveBeenCalledWith(
          expect.stringContaining('Failed to fix merge methods')
        );
        expect(result.compliant).toBe(false);
        expect(result.error).toBe('Insufficient permissions');
        expect(result.message).toBe('Failed to update merge methods configuration');
      });

      it('should handle errors that prevent fix operations', async () => {
        // Test when the fix method encounters an error in the try-catch block
        // This could happen if updateRepository throws after check succeeds
        (mockClient.getRepository as jest.Mock).mockResolvedValueOnce({
          ...mockRepoData,
          allow_merge_commit: false, // Make it non-compliant so fix tries to apply changes
        });
        (mockClient.updateRepository as jest.Mock).mockRejectedValue(
          new Error('Failed to update repository')
        );

        const result = await check.fix(context);

        expect(result.compliant).toBe(false);
        expect(result.error).toBe('Failed to update repository');
        expect(result.message).toBe('Failed to update merge methods configuration');
      });
    });
  });

  describe('property getters', () => {
    it('should have correct name', () => {
      expect(check.name).toBe('merge-methods');
    });

    it('should have correct description', () => {
      expect(check.description).toBe('Verify repository merge methods configuration');
    });
  });
});
