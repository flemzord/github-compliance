import { throttling } from '@octokit/plugin-throttling';
import { Octokit } from '@octokit/rest';
import type { CacheKeyDescriptor, CacheLookupOptions, CacheNamespace } from '../cache';
import { CacheManager } from '../cache';
import type { OctokitRepository, RepositoryListOptions, VulnerabilityAlert } from '../checks/types';
import * as logger from '../logging';
import type {
  BranchProtectionRule,
  Collaborator,
  GitHubClientOptions,
  Repository,
  RepositorySettings,
  SecuritySettings,
  TeamPermission,
} from './types';

const ThrottledOctokit = Octokit.plugin(throttling);
const SELF_CACHE_OWNER = '__self__';

export class GitHubClient {
  private octokit: Octokit;
  private owner?: string;
  private cache?: CacheManager;

  constructor(options: GitHubClientOptions) {
    const octokitOptions = {
      auth: options.token,
      ...(options.baseUrl && { baseUrl: options.baseUrl }),
    };

    if (options.throttle?.enabled) {
      // Type assertion for throttle config due to complex Octokit types
      (octokitOptions as Record<string, unknown>).throttle = {
        onRateLimit: (retryAfter: number, opts: Record<string, unknown>) => {
          logger.warning(
            `Rate limit exceeded, retrying after ${retryAfter} seconds. ${opts.method} ${opts.url}`
          );
          return (
            (opts.request as { retryCount: number }).retryCount < (options.throttle?.retries ?? 3)
          );
        },
        onSecondaryRateLimit: (retryAfter: number, opts: Record<string, unknown>) => {
          logger.warning(
            `Secondary rate limit exceeded, retrying after ${retryAfter} seconds. ${opts.method} ${opts.url}`
          );
          return (
            (opts.request as { retryCount: number }).retryCount < (options.throttle?.retries ?? 3)
          );
        },
      };
    }

    this.octokit = new ThrottledOctokit(octokitOptions);

    if (options.cache instanceof CacheManager) {
      this.cache = options.cache;
    } else if (options.cache && typeof options.cache === 'object') {
      this.cache = new CacheManager(options.cache);
    }
  }

  private getCacheOwner(owner?: string): string {
    if (owner) {
      return owner;
    }
    if (this.owner) {
      return this.owner;
    }
    return SELF_CACHE_OWNER;
  }

  private async fetchWithCache<T>(
    descriptor: CacheKeyDescriptor,
    loader: () => Promise<T>,
    options?: CacheLookupOptions
  ): Promise<T> {
    if (!this.cache || !this.cache.enabled) {
      return loader();
    }

    return this.cache.getOrLoad(descriptor, loader, options);
  }

  private invalidateCache(namespace: CacheNamespace, owner: string, repo?: string): void {
    if (!this.cache || !this.cache.enabled) {
      return;
    }
    this.cache.invalidateNamespace(namespace, owner, repo);
  }

  /**
   * Set the organization/owner context for subsequent operations
   */
  setOwner(owner: string): void {
    this.owner = owner;
  }

  /**
   * Get current authenticated user info
   */
  async getCurrentUser() {
    return this.fetchWithCache(
      {
        namespace: 'currentUser',
        owner: this.getCacheOwner(),
        identifier: 'authenticated',
      },
      async () => {
        const response = await this.octokit.rest.users.getAuthenticated();
        return response.data;
      }
    );
  }

  /**
   * List repositories for the authenticated user or organization
   */
  async listRepositories(
    options?: {
      owner?: string;
    } & RepositoryListOptions
  ): Promise<Repository[]> {
    const owner = options?.owner || this.owner;
    const cacheDescriptor: CacheKeyDescriptor = {
      namespace: 'repositoryList',
      owner: this.getCacheOwner(options?.owner),
      identifier: owner ? 'organization' : 'authenticated-user',
      parameters: {
        includeArchived: options?.includeArchived ?? false,
        type: options?.type,
        sort: options?.sort,
        direction: options?.direction,
      },
    };

    return this.fetchWithCache(cacheDescriptor, async () => {
      const repos: Repository[] = [];

      try {
        if (owner) {
          const iterator = this.octokit.paginate.iterator(this.octokit.rest.repos.listForOrg, {
            org: owner,
            type:
              (options?.type as 'all' | 'public' | 'private' | 'member' | 'forks' | 'sources') ||
              'all',
            sort: options?.sort || 'updated',
            direction: options?.direction || 'desc',
            per_page: 100,
          });

          for await (const { data } of iterator) {
            for (const repo of data) {
              if (!options?.includeArchived && (repo as OctokitRepository).archived) {
                continue;
              }
              repos.push(repo as Repository);
            }
          }
        } else {
          const iterator = this.octokit.paginate.iterator(
            this.octokit.rest.repos.listForAuthenticatedUser,
            {
              type: options?.type || 'owner',
              sort: options?.sort || 'updated',
              direction: options?.direction || 'desc',
              per_page: 100,
            }
          );

          for await (const { data } of iterator) {
            for (const repo of data) {
              if (!options?.includeArchived && (repo as OctokitRepository).archived) {
                continue;
              }
              repos.push(repo as Repository);
            }
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to list repositories: ${message}`);
      }

      return repos;
    });
  }

  /**
   * Get detailed repository information
   */
  async getRepository(owner: string, repo: string): Promise<Repository> {
    const descriptor: CacheKeyDescriptor = {
      namespace: 'repository',
      owner: this.getCacheOwner(owner),
      repo,
      identifier: 'details',
    };

    return this.fetchWithCache(descriptor, async () => {
      try {
        const response = await this.octokit.rest.repos.get({
          owner,
          repo,
        });
        return response.data as Repository;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to get repository ${owner}/${repo}: ${message}`);
      }
    });
  }

  /**
   * Get information about a specific branch
   */
  async getBranch(owner: string, repo: string, branch: string): Promise<{ name: string }> {
    const descriptor: CacheKeyDescriptor = {
      namespace: 'branch',
      owner: this.getCacheOwner(owner),
      repo,
      identifier: branch,
    };

    return this.fetchWithCache(descriptor, async () => {
      try {
        const response = await this.octokit.rest.repos.getBranch({
          owner,
          repo,
          branch,
        });
        return { name: response.data.name };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to get branch ${owner}/${repo}/${branch}: ${message}`);
      }
    });
  }

  /**
   * Get branch protection rules for a specific branch
   */
  async getBranchProtection(
    owner: string,
    repo: string,
    branch: string
  ): Promise<BranchProtectionRule | null> {
    const descriptor: CacheKeyDescriptor = {
      namespace: 'branchProtection',
      owner: this.getCacheOwner(owner),
      repo,
      identifier: branch,
    };

    return this.fetchWithCache(descriptor, async () => {
      try {
        const response = await this.octokit.rest.repos.getBranchProtection({
          owner,
          repo,
          branch,
        });
        return response.data as unknown as BranchProtectionRule;
      } catch (error) {
        if (
          error instanceof Error &&
          'status' in error &&
          (error as { status: number }).status === 404
        ) {
          return null;
        }
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Failed to get branch protection for ${owner}/${repo}/${branch}: ${message}`
        );
      }
    });
  }

  /**
   * Update branch protection rules
   */
  async updateBranchProtection(
    owner: string,
    repo: string,
    branch: string,
    protection: Partial<BranchProtectionRule>
  ): Promise<BranchProtectionRule> {
    try {
      const response = await this.octokit.rest.repos.updateBranchProtection({
        owner,
        repo,
        branch,
        required_status_checks: protection.required_status_checks || null,
        enforce_admins: protection.enforce_admins === undefined ? null : protection.enforce_admins,
        required_pull_request_reviews: protection.required_pull_request_reviews || null,
        restrictions: protection.restrictions || null,
        ...(protection.allow_force_pushes !== undefined && {
          allow_force_pushes: protection.allow_force_pushes,
        }),
        ...(protection.allow_deletions !== undefined && {
          allow_deletions: protection.allow_deletions,
        }),
        ...(protection.required_conversation_resolution !== undefined && {
          required_conversation_resolution: protection.required_conversation_resolution,
        }),
        ...(protection.lock_branch !== undefined && { lock_branch: protection.lock_branch }),
        ...(protection.allow_fork_syncing !== undefined && {
          allow_fork_syncing: protection.allow_fork_syncing,
        }),
      });
      this.invalidateCache('branchProtection', owner, repo);
      return response.data as unknown as BranchProtectionRule;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to update branch protection for ${owner}/${repo}/${branch}: ${message}`
      );
    }
  }

  /**
   * Get repository collaborators with permissions
   * Note: This returns only DIRECT collaborators, not users who have access via teams
   */
  async getCollaborators(owner: string, repo: string): Promise<Collaborator[]> {
    const descriptor: CacheKeyDescriptor = {
      namespace: 'collaborators',
      owner: this.getCacheOwner(owner),
      repo,
      identifier: 'direct',
    };

    return this.fetchWithCache(descriptor, async () => {
      try {
        const collaborators: Collaborator[] = [];
        const iterator = this.octokit.paginate.iterator(this.octokit.rest.repos.listCollaborators, {
          owner,
          repo,
          affiliation: 'direct' as const,
          per_page: 100,
        });

        for await (const { data } of iterator) {
          collaborators.push(...(data as Collaborator[]));
        }

        return collaborators;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to get collaborators for ${owner}/${repo}: ${message}`);
      }
    });
  }

  /**
   * Get team permissions for a repository
   */
  async getTeamPermissions(owner: string, repo: string): Promise<TeamPermission[]> {
    const descriptor: CacheKeyDescriptor = {
      namespace: 'teamPermissions',
      owner: this.getCacheOwner(owner),
      repo,
      identifier: 'teams',
    };

    return this.fetchWithCache(descriptor, async () => {
      try {
        const teams: TeamPermission[] = [];
        const iterator = this.octokit.paginate.iterator(this.octokit.rest.repos.listTeams, {
          owner,
          repo,
          per_page: 100,
        });

        for await (const { data } of iterator) {
          teams.push(...(data as TeamPermission[]));
        }

        return teams;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to get team permissions for ${owner}/${repo}: ${message}`);
      }
    });
  }

  /**
   * Update repository settings (merge methods, etc.)
   */
  async updateRepository(
    owner: string,
    repo: string,
    settings: Partial<RepositorySettings>
  ): Promise<Repository> {
    try {
      const response = await this.octokit.rest.repos.update({
        owner,
        repo,
        ...settings,
      });
      this.invalidateCache('repository', owner, repo);
      this.invalidateCache('repositoryList', owner);
      return response.data as Repository;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to update repository settings for ${owner}/${repo}: ${message}`);
    }
  }

  /**
   * Add or update team permission for repository
   */
  async addTeamToRepository(
    owner: string,
    repo: string,
    teamSlug: string,
    permission: 'pull' | 'triage' | 'push' | 'maintain' | 'admin'
  ): Promise<void> {
    try {
      await this.octokit.rest.teams.addOrUpdateRepoPermissionsInOrg({
        org: owner,
        team_slug: teamSlug,
        owner,
        repo,
        permission,
      });
      this.invalidateCache('teamPermissions', owner, repo);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to add team ${teamSlug} to ${owner}/${repo}: ${message}`);
    }
  }

  /**
   * Remove team from repository
   */
  async removeTeamFromRepository(owner: string, repo: string, teamSlug: string): Promise<void> {
    try {
      await this.octokit.rest.teams.removeRepoInOrg({
        org: owner,
        team_slug: teamSlug,
        owner,
        repo,
      });
      this.invalidateCache('teamPermissions', owner, repo);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to remove team ${teamSlug} from ${owner}/${repo}: ${message}`);
    }
  }

  /**
   * Add or update collaborator permissions for repository
   */
  async addCollaborator(
    owner: string,
    repo: string,
    username: string,
    permission: 'pull' | 'triage' | 'push' | 'maintain' | 'admin'
  ): Promise<void> {
    try {
      await this.octokit.rest.repos.addCollaborator({
        owner,
        repo,
        username,
        permission,
      });
      this.invalidateCache('collaborators', owner, repo);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to add collaborator ${username} to ${owner}/${repo}: ${message}`);
    }
  }

  /**
   * Remove collaborator from repository
   */
  async removeCollaborator(owner: string, repo: string, username: string): Promise<void> {
    try {
      await this.octokit.rest.repos.removeCollaborator({
        owner,
        repo,
        username,
      });
      this.invalidateCache('collaborators', owner, repo);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to remove collaborator ${username} from ${owner}/${repo}: ${message}`
      );
    }
  }

  /**
   * Get security settings for a repository (best effort - some require specific scopes)
   */
  async getSecuritySettings(owner: string, repo: string): Promise<SecuritySettings> {
    const descriptor: CacheKeyDescriptor = {
      namespace: 'securitySettings',
      owner: this.getCacheOwner(owner),
      repo,
      identifier: 'settings',
    };

    return this.fetchWithCache(descriptor, async () => {
      const settings: SecuritySettings = {};

      try {
        try {
          await this.octokit.rest.secretScanning.getAlert({
            owner,
            repo,
            alert_number: 1,
          });
          settings.secret_scanning = { status: 'enabled' };
        } catch {
          settings.secret_scanning = { status: 'disabled' };
        }

        try {
          await this.octokit.rest.repos.checkVulnerabilityAlerts({
            owner,
            repo,
          });
          settings.dependabot_alerts = { enabled: true };
        } catch {
          settings.dependabot_alerts = { enabled: false };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes('403')) {
          logger.debug(`Could not fetch all security settings for ${owner}/${repo}: ${error}`);
        }
      }

      return settings;
    });
  }

  /**
   * List Dependabot vulnerability alerts for a repository
   */
  async getVulnerabilityAlerts(owner: string, repo: string): Promise<VulnerabilityAlert[]> {
    const descriptor: CacheKeyDescriptor = {
      namespace: 'vulnerabilityAlerts',
      owner: this.getCacheOwner(owner),
      repo,
      identifier: 'alerts',
    };

    return this.fetchWithCache(descriptor, async () => {
      try {
        const alerts = await this.octokit.paginate(this.octokit.rest.dependabot.listAlertsForRepo, {
          owner,
          repo,
          per_page: 100,
          state: 'all',
        });

        return alerts as unknown as VulnerabilityAlert[];
      } catch (error) {
        if (error instanceof Error && error.message.includes('403')) {
          return [];
        }
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to list vulnerability alerts for ${owner}/${repo}: ${message}`);
      }
    });
  }

  /**
   * Enable or disable Dependabot vulnerability alerts for a repository
   */
  async updateVulnerabilityAlerts(owner: string, repo: string, enabled: boolean): Promise<void> {
    try {
      if (enabled) {
        await this.octokit.rest.repos.enableVulnerabilityAlerts({ owner, repo });
      } else {
        await this.octokit.rest.repos.disableVulnerabilityAlerts({ owner, repo });
      }
      this.invalidateCache('vulnerabilityAlerts', owner, repo);
      this.invalidateCache('securitySettings', owner, repo);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to ${enabled ? 'enable' : 'disable'} vulnerability alerts for ${owner}/${repo}: ${message}`
      );
    }
  }

  /**
   * Enable or disable GitHub secret scanning for a repository
   */
  async updateSecretScanning(owner: string, repo: string, enabled: boolean): Promise<void> {
    const status = enabled ? 'enabled' : 'disabled';

    try {
      await this.octokit.request('PATCH /repos/{owner}/{repo}', {
        owner,
        repo,
        security_and_analysis: {
          secret_scanning: {
            status,
          },
        },
      });
      this.invalidateCache('securitySettings', owner, repo);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to ${enabled ? 'enable' : 'disable'} secret scanning for ${owner}/${repo}: ${message}`
      );
    }
  }

  /**
   * Enable or disable secret scanning push protection for a repository
   */
  async updateSecretScanningPushProtection(
    owner: string,
    repo: string,
    enabled: boolean
  ): Promise<void> {
    const status = enabled ? 'enabled' : 'disabled';

    try {
      await this.octokit.request('PATCH /repos/{owner}/{repo}', {
        owner,
        repo,
        security_and_analysis: {
          secret_scanning_push_protection: {
            status,
          },
        },
      });
      this.invalidateCache('securitySettings', owner, repo);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to ${enabled ? 'enable' : 'disable'} secret scanning push protection for ${owner}/${repo}: ${message}`
      );
    }
  }
}
