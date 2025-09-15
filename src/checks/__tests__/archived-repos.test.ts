import * as core from '@actions/core';
import type { ComplianceConfig } from '../../config/types';
import type { GitHubClient, Repository } from '../../github/types';
import { ArchivedReposCheck } from '../archived-repos';
import type { CheckContext } from '../base';

// Mock @actions/core
jest.mock('@actions/core');
const mockCore = core as jest.Mocked<typeof core>;

// Mock GitHubClient
const mockClient: Partial<GitHubClient> = {
  getRepository: jest.fn(),
  updateRepository: jest.fn(),
  listRepositories: jest.fn(),
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
  stargazers_count: 5,
  forks_count: 2,
  open_issues_count: 0,
  size: 100,
  language: 'TypeScript',
};

// Mock ComplianceConfig
const mockConfig: ComplianceConfig = {
  version: 1,
  organization: 'test-org',
  defaults: {
    archived_repos: {
      admin_team_only: true,
      archive_inactive: true,
      inactive_days: 365,
      unarchive_active: false,
      archive_patterns: ['*-deprecated', 'legacy-*'],
      keep_active_patterns: ['*-production', 'main-*'],
      specific_repos: {
        'old-repo': { archived: true },
        'new-repo': { archived: false },
      } as Record<string, { archived: boolean }>,
    },
  },
};

describe('ArchivedReposCheck', () => {
  let check: ArchivedReposCheck;
  let context: CheckContext;

  beforeEach(() => {
    check = new ArchivedReposCheck();
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
    it('should return true when archived_repos config exists', () => {
      expect(check.shouldRun(context)).toBe(true);
    });

    it('should return false when no archived_repos config', () => {
      const configWithoutArchived = {
        ...mockConfig,
        defaults: {},
      };
      const contextWithoutConfig = { ...context, config: configWithoutArchived };

      expect(check.shouldRun(contextWithoutConfig)).toBe(false);
    });
  });

  describe('check', () => {
    it('should return compliant when no config specified', async () => {
      const configWithoutArchived = {
        ...mockConfig,
        defaults: {},
      };
      const contextWithoutConfig = { ...context, config: configWithoutArchived };

      const result = await check.check(contextWithoutConfig);

      expect(result.compliant).toBe(true);
      expect(result.message).toBe('No archived repositories configuration specified');
    });

    describe('archive_inactive functionality', () => {
      it('should detect inactive repository that should be archived', async () => {
        const inactiveRepo = {
          ...mockRepository,
          pushed_at: '2022-01-01T00:00:00Z', // Over 365 days ago
          updated_at: '2022-01-01T00:00:00Z',
        };
        const inactiveContext = { ...context, repository: inactiveRepo };

        const result = await check.check(inactiveContext);

        expect(result.compliant).toBe(false);
        expect(result.message).toContain('Repository has been inactive');
        expect(result.details?.actions_needed).toEqual([
          {
            action: 'archive_repository',
            reason: 'inactive',
            days_inactive: expect.any(Number),
          },
        ]);
      });

      it('should be compliant for active repository', async () => {
        const activeRepo = {
          ...mockRepository,
          pushed_at: new Date().toISOString(), // Recent activity
        };
        const activeContext = { ...context, repository: activeRepo };

        const result = await check.check(activeContext);

        expect(result.compliant).toBe(true);
        expect(result.message).toBe('Repository archival status is configured correctly');
      });

      it('should use custom inactive_days threshold', async () => {
        const customConfig = {
          ...mockConfig,
          defaults: {
            archived_repos: {
              admin_team_only: true,
              archive_inactive: true,
              inactive_days: 30,
              unarchive_active: false,
              archive_patterns: ['*-deprecated', 'legacy-*'],
              keep_active_patterns: ['*-production', 'main-*'],
              specific_repos: {
                'old-repo': { archived: true },
                'new-repo': { archived: false },
              } as Record<string, { archived: boolean }>,
            },
          },
        };
        const customContext = { ...context, config: customConfig };

        const inactiveRepo = {
          ...mockRepository,
          pushed_at: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(), // 45 days ago
        };
        const inactiveContext = { ...customContext, repository: inactiveRepo };

        const result = await check.check(inactiveContext);

        expect(result.compliant).toBe(false);
        expect(result.message).toContain('threshold: 30');
      });

      it('should handle already archived repository', async () => {
        const archivedRepo = {
          ...mockRepository,
          archived: true,
          pushed_at: '2022-01-01T00:00:00Z',
        };
        const archivedContext = { ...context, repository: archivedRepo };

        const result = await check.check(archivedContext);

        expect(result.compliant).toBe(true);
      });

      it('should use updated_at when pushed_at is null', async () => {
        const repoWithNullPushedAt = {
          ...mockRepository,
          pushed_at: null,
          updated_at: '2022-01-01T00:00:00Z',
        };
        const repoContext = { ...context, repository: repoWithNullPushedAt };

        const result = await check.check(repoContext);

        expect(result.compliant).toBe(false);
        expect(result.message).toContain('Repository has been inactive');
      });
    });

    describe('unarchive_active functionality', () => {
      it('should log info for archived repo when unarchive_active is enabled', async () => {
        const configWithUnarchive = {
          ...mockConfig,
          defaults: {
            archived_repos: {
              admin_team_only: true,
              archive_inactive: true,
              inactive_days: 365,
              unarchive_active: true,
              archive_patterns: ['*-deprecated', 'legacy-*'],
              keep_active_patterns: ['*-production', 'main-*'],
              specific_repos: {
                'old-repo': { archived: true },
                'new-repo': { archived: false },
              } as Record<string, { archived: boolean }>,
            },
          },
        };
        const unarchiveContext = { ...context, config: configWithUnarchive };

        const archivedRepo = { ...mockRepository, archived: true };
        const archivedContext = { ...unarchiveContext, repository: archivedRepo };

        await check.check(archivedContext);

        expect(mockCore.info).toHaveBeenCalledWith(
          expect.stringContaining('Repository owner/test-repo is archived')
        );
      });
    });

    describe('archive_patterns functionality', () => {
      it('should identify repository matching archive pattern', async () => {
        const deprecatedRepo = { ...mockRepository, name: 'old-deprecated' };
        const deprecatedContext = { ...context, repository: deprecatedRepo };

        const result = await check.check(deprecatedContext);

        expect(result.compliant).toBe(false);
        expect(result.message).toContain('Repository name matches archival pattern');
        expect(result.details?.actions_needed).toContainEqual({
          action: 'archive_repository',
          reason: 'name_pattern',
          matched_pattern: '*-deprecated',
        });
      });

      it('should identify legacy repository matching pattern', async () => {
        const legacyRepo = { ...mockRepository, name: 'legacy-system' };
        const legacyContext = { ...context, repository: legacyRepo };

        const result = await check.check(legacyContext);

        expect(result.compliant).toBe(false);
        expect(result.message).toContain('Repository name matches archival pattern');
        expect(result.details?.actions_needed).toContainEqual({
          action: 'archive_repository',
          reason: 'name_pattern',
          matched_pattern: 'legacy-*',
        });
      });

      it('should be compliant for already archived repo matching pattern', async () => {
        const archivedDeprecatedRepo = {
          ...mockRepository,
          name: 'old-deprecated',
          archived: true,
        };
        const archivedContext = { ...context, repository: archivedDeprecatedRepo };

        const result = await check.check(archivedContext);

        expect(result.compliant).toBe(true);
      });
    });

    describe('keep_active_patterns functionality', () => {
      it('should identify archived repo that should stay active', async () => {
        const productionRepo = {
          ...mockRepository,
          name: 'app-production',
          archived: true,
        };
        const productionContext = { ...context, repository: productionRepo };

        const result = await check.check(productionContext);

        expect(result.compliant).toBe(false);
        expect(result.message).toContain('Repository name matches keep-active pattern');
        expect(result.details?.actions_needed).toContainEqual({
          action: 'unarchive_repository',
          reason: 'keep_active_pattern',
          matched_pattern: '*-production',
        });
      });

      it('should identify main repo that should stay active', async () => {
        const mainRepo = {
          ...mockRepository,
          name: 'main-service',
          archived: true,
        };
        const mainContext = { ...context, repository: mainRepo };

        const result = await check.check(mainContext);

        expect(result.compliant).toBe(false);
        expect(result.message).toContain('Repository name matches keep-active pattern');
        expect(result.details?.actions_needed).toContainEqual({
          action: 'unarchive_repository',
          reason: 'keep_active_pattern',
          matched_pattern: 'main-*',
        });
      });

      it('should be compliant for active repo matching keep-active pattern', async () => {
        const activeProductionRepo = {
          ...mockRepository,
          name: 'app-production',
          archived: false,
          pushed_at: new Date().toISOString(), // Make sure it's not inactive
          updated_at: new Date().toISOString(),
        };
        const activeContext = { ...context, repository: activeProductionRepo };

        const result = await check.check(activeContext);

        expect(result.compliant).toBe(true);
      });
    });

    describe('specific_repos functionality', () => {
      it('should identify repo that should be archived per specific config', async () => {
        const oldRepo = { ...mockRepository, name: 'old-repo', archived: false };
        const oldContext = { ...context, repository: oldRepo };

        const result = await check.check(oldContext);

        expect(result.compliant).toBe(false);
        expect(result.message).toContain('Repository should be archived');
        expect(result.details?.actions_needed).toContainEqual({
          action: 'archive_repository',
          reason: 'specific_configuration',
        });
      });

      it('should identify repo that should be unarchived per specific config', async () => {
        const newRepo = { ...mockRepository, name: 'new-repo', archived: true };
        const newContext = { ...context, repository: newRepo };

        const result = await check.check(newContext);

        expect(result.compliant).toBe(false);
        expect(result.message).toContain('Repository should be unarchived');
        expect(result.details?.actions_needed).toContainEqual({
          action: 'unarchive_repository',
          reason: 'specific_configuration',
        });
      });

      it('should be compliant when specific repo config matches current state', async () => {
        const oldRepo = { ...mockRepository, name: 'old-repo', archived: true };
        const oldContext = { ...context, repository: oldRepo };

        const result = await check.check(oldContext);

        expect(result.compliant).toBe(true);
      });

      it('should handle specific_repos as non-object', async () => {
        const invalidSpecificConfig = {
          ...mockConfig,
          defaults: {
            archived_repos: {
              admin_team_only: true,
              archive_inactive: true,
              inactive_days: 365,
              unarchive_active: false,
              archive_patterns: ['*-deprecated', 'legacy-*'],
              keep_active_patterns: ['*-production', 'main-*'],
              specific_repos: ['repo1', 'repo2'], // array instead of object
            },
          },
        };
        // Use a recently active repository to avoid inactive flagging
        const recentRepo = {
          ...mockRepository,
          pushed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        const invalidContext = {
          ...context,
          config: invalidSpecificConfig,
          repository: recentRepo,
        };

        const result = await check.check(invalidContext);

        expect(result.compliant).toBe(true);
      });
    });

    describe('repository metrics functionality', () => {
      it('should fetch and include repository metrics for active repos', async () => {
        const repoData = {
          stargazers_count: 10,
          forks_count: 5,
          open_issues_count: 3,
          size: 1024,
          language: 'JavaScript',
        };

        (mockClient.getRepository as jest.Mock).mockResolvedValue(repoData);

        const result = await check.check(context);

        expect(mockClient.getRepository).toHaveBeenCalledWith('owner', 'test-repo');
        expect(result.details?.current).toMatchObject({
          metrics: {
            stars: 10,
            forks: 5,
            open_issues: 3,
            size: 1024,
            language: 'JavaScript',
          },
        });
      });

      it('should provide recommendations for inactive repos with no engagement', async () => {
        const inactiveRepo = {
          ...mockRepository,
          pushed_at: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString(), // 200 days ago
        };
        const inactiveContext = { ...context, repository: inactiveRepo };

        const repoData = {
          stargazers_count: 0,
          forks_count: 0,
          open_issues_count: 0,
          size: 50,
          language: null,
        };

        (mockClient.getRepository as jest.Mock).mockResolvedValue(repoData);

        const result = await check.check(inactiveContext);

        expect(result.details?.recommendations).toContain(
          'Repository has no stars or forks and has been inactive for 6+ months - consider archiving'
        );
        expect(mockCore.info).toHaveBeenCalledWith(
          expect.stringContaining('Repository has no stars or forks')
        );
      });

      it('should not warn about open issues for non-archived repos', async () => {
        // Test that open issues don't cause warnings for non-archived repos
        const repoWithIssues = {
          ...mockRepository,
          archived: false,
          pushed_at: new Date().toISOString(), // Keep it active
          updated_at: new Date().toISOString(),
        };
        const repoContext = { ...context, repository: repoWithIssues };

        const repoData = {
          stargazers_count: 10,
          forks_count: 5,
          open_issues_count: 5,
          size: 100,
          language: 'TypeScript',
        };

        (mockClient.getRepository as jest.Mock).mockResolvedValue(repoData);

        const result = await check.check(repoContext);

        expect(result.compliant).toBe(true);
        expect(result.details?.recommendations).not.toContain(
          expect.stringContaining('open issues')
        );
      });

      it('should handle repository fetch error gracefully', async () => {
        (mockClient.getRepository as jest.Mock).mockRejectedValue(
          new Error('API rate limit exceeded')
        );

        // Use a recent repository to avoid inactive flagging
        const recentRepo = {
          ...mockRepository,
          pushed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        const recentContext = { ...context, repository: recentRepo };

        const result = await check.check(recentContext);

        expect(mockCore.debug).toHaveBeenCalledWith(
          'Could not fetch repository metrics: API rate limit exceeded'
        );
        expect(result.compliant).toBe(true); // Should still work without metrics
      });

      it('should not fetch metrics for archived repos', async () => {
        const archivedRepo = { ...mockRepository, archived: true };
        const archivedContext = { ...context, repository: archivedRepo };

        await check.check(archivedContext);

        expect(mockClient.getRepository).not.toHaveBeenCalled();
      });
    });

    describe('error handling', () => {
      it('should handle general errors and return error result', async () => {
        (mockClient.getRepository as jest.Mock).mockImplementation(() => {
          throw new Error('Network error');
        });

        const result = await check.check(context);

        expect(result.compliant).toBe(false);
        expect(result.error).toBe('Network error');
        expect(result.message).toBe('Failed to check repository archival status');
        expect(mockCore.error).toHaveBeenCalledWith(
          expect.stringContaining('Failed to check archived repos')
        );
      });

      it('should handle non-Error exceptions', async () => {
        (mockClient.getRepository as jest.Mock).mockImplementation(() => {
          throw 'String error';
        });

        const result = await check.check(context);

        expect(result.compliant).toBe(false);
        expect(result.error).toBe('String error');
      });
    });

    describe('multiple issues', () => {
      it('should detect multiple archival issues', async () => {
        const problematicRepo = {
          ...mockRepository,
          name: 'legacy-deprecated', // matches archive pattern
          archived: false,
          pushed_at: '2022-01-01T00:00:00Z', // inactive
        };
        const problematicContext = { ...context, repository: problematicRepo };

        const result = await check.check(problematicContext);

        expect(result.compliant).toBe(false);
        expect(result.details?.actions_needed).toHaveLength(2);
        expect(result.details?.actions_needed).toContainEqual({
          action: 'archive_repository',
          reason: 'inactive',
          days_inactive: expect.any(Number),
        });
        expect(result.details?.actions_needed).toContainEqual({
          action: 'archive_repository',
          reason: 'name_pattern',
          matched_pattern: 'legacy-*',
        });
      });
    });
  });

  describe('fix', () => {
    beforeEach(() => {
      (mockClient.updateRepository as jest.Mock).mockResolvedValue({});
    });

    it('should return check result when in dry run mode', async () => {
      const dryRunContext = { ...context, dryRun: true };

      const result = await check.fix(dryRunContext);

      expect(result.compliant).toBe(true);
      expect(mockClient.updateRepository).not.toHaveBeenCalled();
    });

    it('should return compliant result when no config specified', async () => {
      const configWithoutArchived = {
        ...mockConfig,
        defaults: {},
      };
      const contextWithoutConfig = { ...context, config: configWithoutArchived };

      const result = await check.fix(contextWithoutConfig);

      expect(result.compliant).toBe(true);
      expect(result.message).toBe('No archived repositories configuration to apply');
    });

    it('should return compliant result when already compliant', async () => {
      jest.spyOn(check, 'check').mockResolvedValue({
        compliant: true,
        message: 'Already compliant',
      });

      const result = await check.fix(context);

      expect(result.compliant).toBe(true);
      expect(result.message).toBe('Already compliant');
      expect(mockClient.updateRepository).not.toHaveBeenCalled();
    });

    it('should archive repository when action is needed', async () => {
      jest.spyOn(check, 'check').mockResolvedValue({
        compliant: false,
        message: 'Not compliant',
        details: {
          actions_needed: [
            {
              action: 'archive_repository',
              reason: 'inactive',
              days_inactive: 400,
            },
          ],
        },
      });

      const result = await check.fix(context);

      expect(mockClient.updateRepository).toHaveBeenCalledWith('owner', 'test-repo', {
        archived: true,
      });
      expect(result.compliant).toBe(true);
      expect(result.fixed).toBe(true);
      expect(result.message).toBe('Applied 1 archival changes');
      expect(mockCore.info).toHaveBeenCalledWith(
        '✅ Archived repository owner/test-repo (reason: inactive)'
      );
    });

    it('should unarchive repository when action is needed', async () => {
      jest.spyOn(check, 'check').mockResolvedValue({
        compliant: false,
        message: 'Not compliant',
        details: {
          actions_needed: [
            {
              action: 'unarchive_repository',
              reason: 'keep_active_pattern',
              matched_pattern: '*-production',
            },
          ],
        },
      });

      const result = await check.fix(context);

      expect(mockClient.updateRepository).toHaveBeenCalledWith('owner', 'test-repo', {
        archived: false,
      });
      expect(result.compliant).toBe(true);
      expect(result.fixed).toBe(true);
      expect(result.message).toBe('Applied 1 archival changes');
      expect(mockCore.info).toHaveBeenCalledWith(
        '✅ Unarchived repository owner/test-repo (reason: keep_active_pattern)'
      );
    });

    it('should handle multiple actions', async () => {
      jest.spyOn(check, 'check').mockResolvedValue({
        compliant: false,
        message: 'Not compliant',
        details: {
          actions_needed: [
            { action: 'archive_repository', reason: 'inactive' },
            { action: 'archive_repository', reason: 'name_pattern' },
          ],
        },
      });

      const result = await check.fix(context);

      expect(mockClient.updateRepository).toHaveBeenCalledTimes(2);
      expect(result.message).toBe('Applied 2 archival changes');
    });

    it('should handle unknown actions gracefully', async () => {
      jest.spyOn(check, 'check').mockResolvedValue({
        compliant: false,
        message: 'Not compliant',
        details: {
          actions_needed: [{ action: 'unknown_action', reason: 'test' }],
        },
      });

      const result = await check.fix(context);

      expect(mockCore.warning).toHaveBeenCalledWith(
        'Unknown archived repos action: unknown_action'
      );
      expect(result.compliant).toBe(false);
      expect(result.message).toBe('Failed to apply any archival changes');
    });

    it('should handle API errors during fix', async () => {
      jest.spyOn(check, 'check').mockResolvedValue({
        compliant: false,
        message: 'Not compliant',
        details: {
          actions_needed: [{ action: 'archive_repository', reason: 'inactive' }],
        },
      });

      (mockClient.updateRepository as jest.Mock).mockRejectedValue(
        new Error('Repository is already archived')
      );

      const result = await check.fix(context);

      expect(mockCore.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to apply archive_repository')
      );
      expect(result.compliant).toBe(false);
      expect(result.message).toBe('Failed to apply any archival changes');
    });

    it('should handle archived repository error specifically', async () => {
      jest.spyOn(check, 'check').mockResolvedValue({
        compliant: false,
        message: 'Not compliant',
        details: {
          actions_needed: [{ action: 'archive_repository', reason: 'inactive' }],
        },
      });

      (mockClient.updateRepository as jest.Mock).mockRejectedValue(
        new Error('Cannot modify an archived repository')
      );

      await check.fix(context);

      expect(mockCore.error).toHaveBeenCalledWith(
        'Cannot modify an archived repository. Manual intervention may be required.'
      );
    });

    it('should handle permission errors specifically', async () => {
      jest.spyOn(check, 'check').mockResolvedValue({
        compliant: false,
        message: 'Not compliant',
        details: {
          actions_needed: [{ action: 'archive_repository', reason: 'inactive' }],
        },
      });

      (mockClient.updateRepository as jest.Mock).mockRejectedValue(
        new Error('Insufficient permission to archive')
      );

      await check.fix(context);

      expect(mockCore.error).toHaveBeenCalledWith(
        'Insufficient permissions to archive/unarchive repository.'
      );
    });

    it('should handle no actions needed', async () => {
      jest.spyOn(check, 'check').mockResolvedValue({
        compliant: false,
        message: 'Not compliant',
        details: {
          actions_needed: [],
        },
      });

      const result = await check.fix(context);

      expect(result.compliant).toBe(true);
      expect(result.message).toBe('No actions needed to apply');
    });

    it('should handle invalid actions_needed format', async () => {
      jest.spyOn(check, 'check').mockResolvedValue({
        compliant: false,
        message: 'Not compliant',
        details: {
          actions_needed: null,
        },
      });

      const result = await check.fix(context);

      expect(result.compliant).toBe(true);
      expect(result.message).toBe('No actions needed to apply');
    });

    it('should handle general fix errors', async () => {
      jest.spyOn(check, 'check').mockImplementation(() => {
        throw new Error('Unexpected error during check');
      });

      const result = await check.fix(context);

      expect(result.compliant).toBe(false);
      expect(result.error).toBe('Unexpected error during check');
      expect(result.message).toBe('Failed to update repository archival status');
      expect(mockCore.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fix archived repos')
      );
    });

    it('should handle non-Error exceptions in fix', async () => {
      jest.spyOn(check, 'check').mockImplementation(() => {
        throw 'String error in fix';
      });

      const result = await check.fix(context);

      expect(result.error).toBe('String error in fix');
    });
  });

  describe('property getters', () => {
    it('should have correct name', () => {
      expect(check.name).toBe('archived-repos');
    });

    it('should have correct description', () => {
      expect(check.description).toBe('Verify repository archival status and cleanup');
    });
  });
});
