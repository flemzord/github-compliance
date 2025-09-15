import type {
  BranchProtectionRule,
  Collaborator,
  GitHubClientOptions,
  Repository,
  RepositorySettings,
  SecuritySettings,
  TeamPermission,
} from '../types';
import { GitHubClient } from '../types';

describe('GitHub Types', () => {
  describe('Repository interface', () => {
    it('should have all required properties', () => {
      const repository: Repository = {
        id: 1,
        name: 'test-repo',
        full_name: 'test-org/test-repo',
        private: false,
        archived: false,
        disabled: false,
        fork: false,
        default_branch: 'main',
        updated_at: '2023-01-01T00:00:00Z',
        pushed_at: '2023-01-01T00:00:00Z',
        stargazers_count: 10,
        forks_count: 5,
        open_issues_count: 2,
        size: 1024,
        language: 'TypeScript',
      };

      expect(repository.id).toBe(1);
      expect(repository.name).toBe('test-repo');
      expect(repository.full_name).toBe('test-org/test-repo');
      expect(repository.private).toBe(false);
      expect(repository.archived).toBe(false);
      expect(repository.disabled).toBe(false);
      expect(repository.fork).toBe(false);
      expect(repository.default_branch).toBe('main');
      expect(repository.updated_at).toBe('2023-01-01T00:00:00Z');
      expect(repository.pushed_at).toBe('2023-01-01T00:00:00Z');
      expect(repository.stargazers_count).toBe(10);
      expect(repository.forks_count).toBe(5);
      expect(repository.open_issues_count).toBe(2);
      expect(repository.size).toBe(1024);
      expect(repository.language).toBe('TypeScript');
    });

    it('should handle null values for optional properties', () => {
      const repository: Repository = {
        id: 1,
        name: 'test-repo',
        full_name: 'test-org/test-repo',
        private: false,
        archived: false,
        disabled: false,
        fork: false,
        default_branch: 'main',
        updated_at: '2023-01-01T00:00:00Z',
        pushed_at: null,
        stargazers_count: 0,
        forks_count: 0,
        open_issues_count: 0,
        size: 0,
        language: null,
      };

      expect(repository.pushed_at).toBeNull();
      expect(repository.language).toBeNull();
    });

    it('should handle permissions when provided', () => {
      const repository: Repository = {
        id: 1,
        name: 'test-repo',
        full_name: 'test-org/test-repo',
        private: false,
        archived: false,
        disabled: false,
        fork: false,
        default_branch: 'main',
        updated_at: '2023-01-01T00:00:00Z',
        pushed_at: '2023-01-01T00:00:00Z',
        stargazers_count: 10,
        forks_count: 5,
        open_issues_count: 2,
        size: 1024,
        language: 'TypeScript',
        permissions: {
          admin: true,
          maintain: true,
          push: true,
          triage: true,
          pull: true,
        },
      };

      expect(repository.permissions).toEqual({
        admin: true,
        maintain: true,
        push: true,
        triage: true,
        pull: true,
      });
    });
  });

  describe('BranchProtectionRule interface', () => {
    it('should have all required properties', () => {
      const protection: BranchProtectionRule = {
        required_status_checks: {
          strict: true,
          contexts: ['ci/test'],
          checks: [{ context: 'ci/test', app_id: 123 }],
        },
        enforce_admins: true,
        required_pull_request_reviews: {
          dismiss_stale_reviews: true,
          require_code_owner_reviews: true,
          required_approving_review_count: 2,
          require_last_push_approval: false,
          dismissal_restrictions: {
            users: ['admin'],
            teams: ['security'],
          },
        },
        restrictions: {
          users: ['admin'],
          teams: ['developers'],
          apps: ['github-actions'],
        },
        allow_force_pushes: false,
        allow_deletions: false,
        required_conversation_resolution: true,
        lock_branch: false,
        allow_fork_syncing: true,
      };

      expect(protection.required_status_checks?.strict).toBe(true);
      expect(protection.required_status_checks?.contexts).toEqual(['ci/test']);
      expect(protection.required_status_checks?.checks).toEqual([
        { context: 'ci/test', app_id: 123 },
      ]);
      expect(protection.enforce_admins).toBe(true);
      expect(protection.required_pull_request_reviews?.dismiss_stale_reviews).toBe(true);
      expect(protection.required_pull_request_reviews?.require_code_owner_reviews).toBe(true);
      expect(protection.required_pull_request_reviews?.required_approving_review_count).toBe(2);
      expect(protection.required_pull_request_reviews?.require_last_push_approval).toBe(false);
      expect(protection.required_pull_request_reviews?.dismissal_restrictions).toEqual({
        users: ['admin'],
        teams: ['security'],
      });
      expect(protection.restrictions).toEqual({
        users: ['admin'],
        teams: ['developers'],
        apps: ['github-actions'],
      });
      expect(protection.allow_force_pushes).toBe(false);
      expect(protection.allow_deletions).toBe(false);
      expect(protection.required_conversation_resolution).toBe(true);
      expect(protection.lock_branch).toBe(false);
      expect(protection.allow_fork_syncing).toBe(true);
    });

    it('should handle null values for optional properties', () => {
      const protection: BranchProtectionRule = {
        required_status_checks: null,
        enforce_admins: false,
        required_pull_request_reviews: null,
        restrictions: null,
        allow_force_pushes: true,
        allow_deletions: true,
        required_conversation_resolution: false,
        lock_branch: true,
        allow_fork_syncing: false,
      };

      expect(protection.required_status_checks).toBeNull();
      expect(protection.required_pull_request_reviews).toBeNull();
      expect(protection.restrictions).toBeNull();
      expect(protection.enforce_admins).toBe(false);
      expect(protection.allow_force_pushes).toBe(true);
      expect(protection.allow_deletions).toBe(true);
      expect(protection.required_conversation_resolution).toBe(false);
      expect(protection.lock_branch).toBe(true);
      expect(protection.allow_fork_syncing).toBe(false);
    });

    it('should handle checks without app_id', () => {
      const protection: BranchProtectionRule = {
        required_status_checks: {
          strict: false,
          contexts: ['ci/build', 'ci/test'],
          checks: [{ context: 'ci/build' }, { context: 'ci/test', app_id: 456 }],
        },
        enforce_admins: false,
        required_pull_request_reviews: null,
        restrictions: null,
        allow_force_pushes: false,
        allow_deletions: false,
        required_conversation_resolution: false,
        lock_branch: false,
        allow_fork_syncing: false,
      };

      expect(protection.required_status_checks?.checks).toEqual([
        { context: 'ci/build' },
        { context: 'ci/test', app_id: 456 },
      ]);
    });
  });

  describe('TeamPermission interface', () => {
    it('should have all required properties', () => {
      const team: TeamPermission = {
        id: 1,
        name: 'Team Alpha',
        slug: 'team-alpha',
        permission: 'admin',
      };

      expect(team.id).toBe(1);
      expect(team.name).toBe('Team Alpha');
      expect(team.slug).toBe('team-alpha');
      expect(team.permission).toBe('admin');
    });

    it('should support all permission levels', () => {
      const permissions: TeamPermission['permission'][] = [
        'read',
        'triage',
        'write',
        'maintain',
        'admin',
      ];

      permissions.forEach((permission) => {
        const team: TeamPermission = {
          id: 1,
          name: 'Test Team',
          slug: 'test-team',
          permission,
        };

        expect(team.permission).toBe(permission);
      });
    });
  });

  describe('Collaborator interface', () => {
    it('should have all required properties for User type', () => {
      const collaborator: Collaborator = {
        id: 1,
        login: 'testuser',
        type: 'User',
        permissions: {
          admin: false,
          maintain: false,
          push: true,
          triage: true,
          pull: true,
        },
      };

      expect(collaborator.id).toBe(1);
      expect(collaborator.login).toBe('testuser');
      expect(collaborator.type).toBe('User');
      expect(collaborator.permissions).toEqual({
        admin: false,
        maintain: false,
        push: true,
        triage: true,
        pull: true,
      });
    });

    it('should have all required properties for Bot type', () => {
      const collaborator: Collaborator = {
        id: 2,
        login: 'github-actions[bot]',
        type: 'Bot',
        permissions: {
          admin: true,
          maintain: true,
          push: true,
          triage: true,
          pull: true,
        },
      };

      expect(collaborator.id).toBe(2);
      expect(collaborator.login).toBe('github-actions[bot]');
      expect(collaborator.type).toBe('Bot');
      expect(collaborator.permissions).toEqual({
        admin: true,
        maintain: true,
        push: true,
        triage: true,
        pull: true,
      });
    });
  });

  describe('SecuritySettings interface', () => {
    it('should handle all security settings properties', () => {
      const settings: SecuritySettings = {
        secret_scanning: {
          status: 'enabled',
        },
        secret_scanning_push_protection: {
          status: 'enabled',
        },
        dependabot_alerts: {
          enabled: true,
        },
        dependabot_security_updates: {
          enabled: true,
        },
        dependency_graph: {
          enabled: true,
        },
      };

      expect(settings.secret_scanning?.status).toBe('enabled');
      expect(settings.secret_scanning_push_protection?.status).toBe('enabled');
      expect(settings.dependabot_alerts?.enabled).toBe(true);
      expect(settings.dependabot_security_updates?.enabled).toBe(true);
      expect(settings.dependency_graph?.enabled).toBe(true);
    });

    it('should handle disabled security settings', () => {
      const settings: SecuritySettings = {
        secret_scanning: {
          status: 'disabled',
        },
        secret_scanning_push_protection: {
          status: 'disabled',
        },
        dependabot_alerts: {
          enabled: false,
        },
        dependabot_security_updates: {
          enabled: false,
        },
        dependency_graph: {
          enabled: false,
        },
      };

      expect(settings.secret_scanning?.status).toBe('disabled');
      expect(settings.secret_scanning_push_protection?.status).toBe('disabled');
      expect(settings.dependabot_alerts?.enabled).toBe(false);
      expect(settings.dependabot_security_updates?.enabled).toBe(false);
      expect(settings.dependency_graph?.enabled).toBe(false);
    });

    it('should handle partial security settings', () => {
      const settings: SecuritySettings = {
        secret_scanning: {
          status: 'enabled',
        },
        dependabot_alerts: {
          enabled: true,
        },
      };

      expect(settings.secret_scanning?.status).toBe('enabled');
      expect(settings.dependabot_alerts?.enabled).toBe(true);
      expect(settings.secret_scanning_push_protection).toBeUndefined();
      expect(settings.dependabot_security_updates).toBeUndefined();
      expect(settings.dependency_graph).toBeUndefined();
    });

    it('should handle empty security settings', () => {
      const settings: SecuritySettings = {};

      expect(settings.secret_scanning).toBeUndefined();
      expect(settings.secret_scanning_push_protection).toBeUndefined();
      expect(settings.dependabot_alerts).toBeUndefined();
      expect(settings.dependabot_security_updates).toBeUndefined();
      expect(settings.dependency_graph).toBeUndefined();
    });
  });

  describe('RepositorySettings interface', () => {
    it('should have all required properties', () => {
      const settings: RepositorySettings = {
        name: 'test-repo',
        allow_merge_commit: true,
        allow_squash_merge: true,
        allow_rebase_merge: false,
        delete_branch_on_merge: true,
        archived: false,
        disabled: false,
      };

      expect(settings.name).toBe('test-repo');
      expect(settings.allow_merge_commit).toBe(true);
      expect(settings.allow_squash_merge).toBe(true);
      expect(settings.allow_rebase_merge).toBe(false);
      expect(settings.delete_branch_on_merge).toBe(true);
      expect(settings.archived).toBe(false);
      expect(settings.disabled).toBe(false);
    });

    it('should handle different merge settings combinations', () => {
      const settings: RepositorySettings = {
        name: 'restrictive-repo',
        allow_merge_commit: false,
        allow_squash_merge: false,
        allow_rebase_merge: true,
        delete_branch_on_merge: false,
        archived: true,
        disabled: true,
      };

      expect(settings.name).toBe('restrictive-repo');
      expect(settings.allow_merge_commit).toBe(false);
      expect(settings.allow_squash_merge).toBe(false);
      expect(settings.allow_rebase_merge).toBe(true);
      expect(settings.delete_branch_on_merge).toBe(false);
      expect(settings.archived).toBe(true);
      expect(settings.disabled).toBe(true);
    });
  });

  describe('GitHubClientOptions interface', () => {
    it('should have required token property', () => {
      const options: GitHubClientOptions = {
        token: 'github_pat_test_token',
      };

      expect(options.token).toBe('github_pat_test_token');
      expect(options.baseUrl).toBeUndefined();
      expect(options.throttle).toBeUndefined();
    });

    it('should handle optional baseUrl property', () => {
      const options: GitHubClientOptions = {
        token: 'github_pat_test_token',
        baseUrl: 'https://github.enterprise.com/api/v3',
      };

      expect(options.token).toBe('github_pat_test_token');
      expect(options.baseUrl).toBe('https://github.enterprise.com/api/v3');
      expect(options.throttle).toBeUndefined();
    });

    it('should handle throttle configuration', () => {
      const options: GitHubClientOptions = {
        token: 'github_pat_test_token',
        baseUrl: 'https://api.github.com',
        throttle: {
          enabled: true,
          retries: 5,
          retryDelay: 2000,
        },
      };

      expect(options.token).toBe('github_pat_test_token');
      expect(options.baseUrl).toBe('https://api.github.com');
      expect(options.throttle).toEqual({
        enabled: true,
        retries: 5,
        retryDelay: 2000,
      });
    });

    it('should handle throttle disabled configuration', () => {
      const options: GitHubClientOptions = {
        token: 'github_pat_test_token',
        throttle: {
          enabled: false,
          retries: 0,
          retryDelay: 0,
        },
      };

      expect(options.throttle).toEqual({
        enabled: false,
        retries: 0,
        retryDelay: 0,
      });
    });
  });

  describe('GitHubClient export', () => {
    it('should be able to import GitHubClient from types module', () => {
      expect(GitHubClient).toBeDefined();
      expect(typeof GitHubClient).toBe('function');
    });

    it('should be able to create an instance of GitHubClient', () => {
      const client = new GitHubClient({ token: 'test-token' });
      expect(client).toBeInstanceOf(GitHubClient);
    });
  });

  describe('Type compatibility and edge cases', () => {
    it('should handle Repository with minimal required properties', () => {
      const minimalRepo: Repository = {
        id: 1,
        name: 'minimal',
        full_name: 'user/minimal',
        private: false,
        archived: false,
        disabled: false,
        fork: false,
        default_branch: 'main',
        updated_at: '2023-01-01T00:00:00Z',
        pushed_at: null,
        stargazers_count: 0,
        forks_count: 0,
        open_issues_count: 0,
        size: 0,
        language: null,
      };

      expect(minimalRepo.id).toBe(1);
      expect(minimalRepo.pushed_at).toBeNull();
      expect(minimalRepo.language).toBeNull();
    });

    it('should handle BranchProtectionRule with only required boolean properties', () => {
      const minimalProtection: BranchProtectionRule = {
        required_status_checks: null,
        enforce_admins: false,
        required_pull_request_reviews: null,
        restrictions: null,
        allow_force_pushes: false,
        allow_deletions: false,
        required_conversation_resolution: false,
        lock_branch: false,
        allow_fork_syncing: false,
      };

      expect(minimalProtection.required_status_checks).toBeNull();
      expect(minimalProtection.required_pull_request_reviews).toBeNull();
      expect(minimalProtection.restrictions).toBeNull();
      expect(minimalProtection.enforce_admins).toBe(false);
    });

    it('should handle complex nested structures', () => {
      const complexProtection: BranchProtectionRule = {
        required_status_checks: {
          strict: true,
          contexts: ['ci/test', 'security/scan', 'quality/lint'],
          checks: [
            { context: 'ci/test' },
            { context: 'security/scan', app_id: 123 },
            { context: 'quality/lint', app_id: 456 },
          ],
        },
        enforce_admins: true,
        required_pull_request_reviews: {
          dismiss_stale_reviews: true,
          require_code_owner_reviews: true,
          required_approving_review_count: 3,
          require_last_push_approval: true,
          dismissal_restrictions: {
            users: ['admin1', 'admin2'],
            teams: ['security-team', 'platform-team'],
          },
        },
        restrictions: {
          users: ['deploy-user'],
          teams: ['release-team'],
          apps: ['github-actions', 'deployment-bot'],
        },
        allow_force_pushes: false,
        allow_deletions: false,
        required_conversation_resolution: true,
        lock_branch: false,
        allow_fork_syncing: true,
      };

      expect(complexProtection.required_status_checks?.contexts).toHaveLength(3);
      expect(complexProtection.required_status_checks?.checks).toHaveLength(3);
      expect(complexProtection.required_pull_request_reviews?.required_approving_review_count).toBe(
        3
      );
      expect(
        complexProtection.required_pull_request_reviews?.dismissal_restrictions?.users
      ).toHaveLength(2);
      expect(
        complexProtection.required_pull_request_reviews?.dismissal_restrictions?.teams
      ).toHaveLength(2);
      expect(complexProtection.restrictions?.users).toHaveLength(1);
      expect(complexProtection.restrictions?.teams).toHaveLength(1);
      expect(complexProtection.restrictions?.apps).toHaveLength(2);
    });
  });
});
