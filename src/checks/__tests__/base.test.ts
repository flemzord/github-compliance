import type { ComplianceConfig } from '../../config/types';
import type { GitHubClient, Repository } from '../../github/types';
import type { TestableBaseCheck } from '../../test/test-types';
import { BaseCheck, type CheckContext, type CheckResult } from '../base';

// Concrete implementation for testing BaseCheck abstract class
class TestCheck extends BaseCheck {
  readonly name = 'test-check';
  readonly description = 'Test compliance check';

  async check(_context: CheckContext): Promise<CheckResult> {
    return this.createCompliantResult('Test check passed');
  }
}

// Mock GitHubClient
const mockClient: Partial<GitHubClient> = {
  getRepository: jest.fn(),
  updateRepository: jest.fn(),
  getBranch: jest.fn(),
  getBranchProtection: jest.fn(),
  updateBranchProtection: jest.fn(),
  getTeamPermissions: jest.fn(),
  getCollaborators: jest.fn(),
  addTeamToRepository: jest.fn(),
  removeCollaborator: jest.fn(),
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
    permissions: {
      remove_individual_collaborators: true,
      teams: [
        { team: 'developers', permission: 'write' },
        { team: 'admins', permission: 'admin' },
      ],
    },
    archived_repos: {
      admin_team_only: true,
      archive_inactive: true,
      inactive_days: 365,
      archive_patterns: ['*-deprecated', 'legacy-*'],
      keep_active_patterns: ['*-production', 'main-*'],
    },
  },
  rules: [
    {
      match: {
        repositories: ['*-private'],
        only_private: true,
      },
      apply: {
        merge_methods: {
          allow_merge_commit: false,
          allow_squash_merge: true,
          allow_rebase_merge: true,
        },
      },
    },
  ],
};

describe('BaseCheck', () => {
  let testCheck: TestCheck;
  let context: CheckContext;

  beforeEach(() => {
    testCheck = new TestCheck();
    context = {
      client: mockClient as GitHubClient,
      config: mockConfig,
      dryRun: false,
      repository: mockRepository,
    };
    jest.clearAllMocks();
  });

  describe('shouldRun', () => {
    it('should return true by default', () => {
      expect(testCheck.shouldRun(context)).toBe(true);
    });
  });

  describe('check', () => {
    it('should return compliant result for test check', async () => {
      const result = await testCheck.check(context);
      expect(result.compliant).toBe(true);
      expect(result.message).toBe('Test check passed');
    });
  });

  describe('fix', () => {
    it('should call check method when in dry run mode', async () => {
      const dryRunContext = { ...context, dryRun: true };
      const checkSpy = jest.spyOn(testCheck, 'check');

      const result = await testCheck.fix(dryRunContext);

      expect(checkSpy).toHaveBeenCalledWith(dryRunContext);
      expect(result.compliant).toBe(true);
    });

    it('should call check method when not in dry run mode (default implementation)', async () => {
      const checkSpy = jest.spyOn(testCheck, 'check');

      const result = await testCheck.fix(context);

      expect(checkSpy).toHaveBeenCalledWith(context);
      expect(result.compliant).toBe(true);
    });
  });

  describe('helper methods', () => {
    describe('createCompliantResult', () => {
      it('should create compliant result without details', () => {
        const result = (testCheck as unknown as TestableBaseCheck).createCompliantResult(
          'Test message'
        );

        expect(result.compliant).toBe(true);
        expect(result.message).toBe('Test message');
        expect(result.details).toBeUndefined();
        expect(result.fixed).toBeUndefined();
        expect(result.error).toBeUndefined();
      });

      it('should create compliant result with details', () => {
        const details = { key: 'value' };
        const result = (testCheck as unknown as TestableBaseCheck).createCompliantResult(
          'Test message',
          details
        );

        expect(result.compliant).toBe(true);
        expect(result.message).toBe('Test message');
        expect(result.details).toEqual(details);
      });
    });

    describe('createNonCompliantResult', () => {
      it('should create non-compliant result without details', () => {
        const result = (testCheck as unknown as TestableBaseCheck).createNonCompliantResult(
          'Test message'
        );

        expect(result.compliant).toBe(false);
        expect(result.message).toBe('Test message');
        expect(result.details).toBeUndefined();
        expect(result.fixed).toBeUndefined();
        expect(result.error).toBeUndefined();
      });

      it('should create non-compliant result with details', () => {
        const details = { key: 'value' };
        const result = (testCheck as unknown as TestableBaseCheck).createNonCompliantResult(
          'Test message',
          details
        );

        expect(result.compliant).toBe(false);
        expect(result.message).toBe('Test message');
        expect(result.details).toEqual(details);
      });
    });

    describe('createFixedResult', () => {
      it('should create fixed result without details', () => {
        const result = (testCheck as unknown as TestableBaseCheck).createFixedResult(
          'Test message'
        );

        expect(result.compliant).toBe(true);
        expect(result.message).toBe('Test message');
        expect(result.fixed).toBe(true);
        expect(result.details).toBeUndefined();
        expect(result.error).toBeUndefined();
      });

      it('should create fixed result with details', () => {
        const details = { key: 'value' };
        const result = (testCheck as unknown as TestableBaseCheck).createFixedResult(
          'Test message',
          details
        );

        expect(result.compliant).toBe(true);
        expect(result.message).toBe('Test message');
        expect(result.fixed).toBe(true);
        expect(result.details).toEqual(details);
      });
    });

    describe('createErrorResult', () => {
      it('should create error result', () => {
        const result = (testCheck as unknown as TestableBaseCheck).createErrorResult(
          'Test message',
          'Error details'
        );

        expect(result.compliant).toBe(false);
        expect(result.message).toBe('Test message');
        expect(result.error).toBe('Error details');
        expect(result.fixed).toBeUndefined();
        expect(result.details).toBeUndefined();
      });
    });

    describe('getRepoInfo', () => {
      it('should return repository info object', () => {
        const result = (testCheck as unknown as TestableBaseCheck).getRepoInfo(mockRepository);

        expect(result).toEqual({ owner: 'owner', repo: 'test-repo' });
      });

      it('should handle full_name with multiple slashes', () => {
        const repo = { ...mockRepository, full_name: 'org/suborg/repo-name' };
        const result = (testCheck as unknown as TestableBaseCheck).getRepoInfo(repo);

        expect(result).toEqual({ owner: 'org', repo: 'suborg' });
      });
    });

    describe('matchesPattern', () => {
      it('should match exact strings', () => {
        expect(
          (testCheck as unknown as TestableBaseCheck).matchesPattern('test-repo', ['test-repo'])
        ).toBe(true);
        expect(
          (testCheck as unknown as TestableBaseCheck).matchesPattern('test-repo', ['other-repo'])
        ).toBe(false);
      });

      it('should match wildcard patterns', () => {
        expect(
          (testCheck as unknown as TestableBaseCheck).matchesPattern('test-repo', ['test-*'])
        ).toBe(true);
        expect(
          (testCheck as unknown as TestableBaseCheck).matchesPattern('my-test-repo', ['*-test-*'])
        ).toBe(true);
        expect(
          (testCheck as unknown as TestableBaseCheck).matchesPattern('repo-test', ['*-test'])
        ).toBe(true);
        expect(
          (testCheck as unknown as TestableBaseCheck).matchesPattern('test-repo', ['prod-*'])
        ).toBe(false);
      });

      it('should match single character patterns', () => {
        expect((testCheck as unknown as TestableBaseCheck).matchesPattern('test1', ['test?'])).toBe(
          true
        );
        expect((testCheck as unknown as TestableBaseCheck).matchesPattern('testA', ['test?'])).toBe(
          true
        );
        expect(
          (testCheck as unknown as TestableBaseCheck).matchesPattern('test12', ['test?'])
        ).toBe(false);
      });

      it('should be case insensitive', () => {
        expect(
          (testCheck as unknown as TestableBaseCheck).matchesPattern('Test-Repo', ['test-*'])
        ).toBe(true);
        expect(
          (testCheck as unknown as TestableBaseCheck).matchesPattern('TEST-REPO', ['test-*'])
        ).toBe(true);
      });

      it('should match multiple patterns', () => {
        expect(
          (testCheck as unknown as TestableBaseCheck).matchesPattern('test-repo', [
            'prod-*',
            'test-*',
            'dev-*',
          ])
        ).toBe(true);
        expect(
          (testCheck as unknown as TestableBaseCheck).matchesPattern('staging-repo', [
            'prod-*',
            'test-*',
            'dev-*',
          ])
        ).toBe(false);
      });
    });

    describe('getRepoConfig', () => {
      it('should return default config when no rules match', () => {
        const result = (testCheck as unknown as TestableBaseCheck).getRepoConfig(
          context,
          'merge_methods'
        );

        expect(result).toEqual(mockConfig.defaults.merge_methods);
      });

      it('should apply matching rules to default config', () => {
        const privateRepo = { ...mockRepository, name: 'my-private', private: true };
        const privateContext = { ...context, repository: privateRepo };

        const result = (testCheck as unknown as TestableBaseCheck).getRepoConfig(
          privateContext,
          'merge_methods'
        );

        expect(result).toEqual({
          allow_merge_commit: false, // overridden by rule
          allow_squash_merge: true, // overridden by rule
          allow_rebase_merge: true, // overridden by rule
        });
      });

      it('should handle multiple matching rules (last one wins)', () => {
        const configWithMultipleRules: ComplianceConfig = {
          ...mockConfig,
          rules: [
            {
              match: { repositories: ['test-*'] },
              apply: {
                merge_methods: {
                  allow_merge_commit: false,
                  allow_squash_merge: false,
                  allow_rebase_merge: false,
                },
              },
            },
            {
              match: { repositories: ['*-repo'] },
              apply: {
                merge_methods: {
                  allow_merge_commit: true,
                  allow_squash_merge: true,
                  allow_rebase_merge: false,
                },
              },
            },
          ],
        };

        const multiRuleContext = { ...context, config: configWithMultipleRules };
        const result = (testCheck as unknown as TestableBaseCheck).getRepoConfig(
          multiRuleContext,
          'merge_methods'
        );

        expect(result).toEqual({
          allow_merge_commit: true, // from default, not overridden in second rule
          allow_squash_merge: true, // from second rule (overrides first)
          allow_rebase_merge: false, // from first rule
        });
      });

      it('should return undefined for non-existent config keys', () => {
        const result = (testCheck as unknown as TestableBaseCheck).getRepoConfig(
          context,
          'non_existent'
        );

        expect(result).toBeUndefined();
      });
    });

    describe('matchesRepositoryRule', () => {
      it('should match repository name patterns', () => {
        const rule = {
          repositories: ['test-*', 'dev-*'],
        };

        expect(
          (testCheck as unknown as TestableBaseCheck).matchesRepositoryRule(mockRepository, rule)
        ).toBe(true);

        const nonMatchingRepo = { ...mockRepository, name: 'prod-repo' };
        expect(
          (testCheck as unknown as TestableBaseCheck).matchesRepositoryRule(nonMatchingRepo, rule)
        ).toBe(false);
      });

      it('should match private repository requirement', () => {
        const privateRule = { only_private: true };
        const publicRule = { only_private: false };

        expect(
          (testCheck as unknown as TestableBaseCheck).matchesRepositoryRule(
            mockRepository,
            privateRule
          )
        ).toBe(false);
        expect(
          (testCheck as unknown as TestableBaseCheck).matchesRepositoryRule(
            mockRepository,
            publicRule
          )
        ).toBe(true);

        const privateRepo = { ...mockRepository, private: true };
        expect(
          (testCheck as unknown as TestableBaseCheck).matchesRepositoryRule(
            privateRepo,
            privateRule
          )
        ).toBe(true);
        expect(
          (testCheck as unknown as TestableBaseCheck).matchesRepositoryRule(privateRepo, publicRule)
        ).toBe(false);
      });

      it('should match both repository patterns and privacy', () => {
        const combinedRule = {
          repositories: ['*-private'],
          only_private: true,
        };

        const publicRepo = { ...mockRepository, name: 'my-private', private: false };
        const privateRepo = { ...mockRepository, name: 'my-private', private: true };
        const wrongNamePrivateRepo = { ...mockRepository, name: 'my-public', private: true };

        expect(
          (testCheck as unknown as TestableBaseCheck).matchesRepositoryRule(
            publicRepo,
            combinedRule
          )
        ).toBe(false);
        expect(
          (testCheck as unknown as TestableBaseCheck).matchesRepositoryRule(
            privateRepo,
            combinedRule
          )
        ).toBe(true);
        expect(
          (testCheck as unknown as TestableBaseCheck).matchesRepositoryRule(
            wrongNamePrivateRepo,
            combinedRule
          )
        ).toBe(false);
      });

      it('should return true when no criteria specified', () => {
        const emptyRule = {};

        expect(
          (testCheck as unknown as TestableBaseCheck).matchesRepositoryRule(
            mockRepository,
            emptyRule
          )
        ).toBe(true);
      });

      it('should handle undefined only_private', () => {
        const rule = {
          repositories: ['test-*'],
        };

        expect(
          (testCheck as unknown as TestableBaseCheck).matchesRepositoryRule(mockRepository, rule)
        ).toBe(true);
      });
    });
  });

  describe('edge cases', () => {
    it('should handle empty patterns array', () => {
      expect((testCheck as unknown as TestableBaseCheck).matchesPattern('test-repo', [])).toBe(
        false
      );
    });

    it('should handle config without rules', () => {
      const configWithoutRules = { ...mockConfig };
      delete (configWithoutRules as ComplianceConfig & { rules?: unknown }).rules;
      const contextWithoutRules = { ...context, config: configWithoutRules };

      const result = (testCheck as unknown as TestableBaseCheck).getRepoConfig(
        contextWithoutRules,
        'merge_methods'
      );

      expect(result).toEqual(mockConfig.defaults.merge_methods);
    });

    it('should handle empty rules array', () => {
      const configWithEmptyRules = { ...mockConfig, rules: [] };
      const contextWithEmptyRules = { ...context, config: configWithEmptyRules };

      const result = (testCheck as unknown as TestableBaseCheck).getRepoConfig(
        contextWithEmptyRules,
        'merge_methods'
      );

      expect(result).toEqual(mockConfig.defaults.merge_methods);
    });

    it('should handle rule with undefined apply config', () => {
      const configWithUndefinedApply: ComplianceConfig = {
        ...mockConfig,
        rules: [
          {
            match: { repositories: ['test-*'] },
            apply: {}, // empty apply
          },
        ],
      };

      const undefinedApplyContext = { ...context, config: configWithUndefinedApply };
      const result = (testCheck as unknown as TestableBaseCheck).getRepoConfig(
        undefinedApplyContext,
        'merge_methods'
      );

      expect(result).toEqual(mockConfig.defaults.merge_methods);
    });
  });
});
