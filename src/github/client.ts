import { throttling } from '@octokit/plugin-throttling';
import { Octokit } from '@octokit/rest';
import type { OctokitRepository, RepositoryListOptions } from '../checks/types';
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

export class GitHubClient {
  private octokit: Octokit;
  private owner?: string;

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
    const response = await this.octokit.rest.users.getAuthenticated();
    return response.data;
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
    const repos: Repository[] = [];

    try {
      if (owner) {
        // Organization repositories
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
        // User repositories
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
  }

  /**
   * Get detailed repository information
   */
  async getRepository(owner: string, repo: string): Promise<Repository> {
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
  }

  /**
   * Get information about a specific branch
   */
  async getBranch(owner: string, repo: string, branch: string): Promise<{ name: string }> {
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
  }

  /**
   * Get branch protection rules for a specific branch
   */
  async getBranchProtection(
    owner: string,
    repo: string,
    branch: string
  ): Promise<BranchProtectionRule | null> {
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
        return null; // No protection rules
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get branch protection for ${owner}/${repo}/${branch}: ${message}`);
    }
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
  }

  /**
   * Get team permissions for a repository
   */
  async getTeamPermissions(owner: string, repo: string): Promise<TeamPermission[]> {
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to remove team ${teamSlug} from ${owner}/${repo}: ${message}`);
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
    const settings: SecuritySettings = {};

    try {
      // Try to get secret scanning status
      try {
        await this.octokit.rest.secretScanning.getAlert({
          owner,
          repo,
          alert_number: 1,
        });
        settings.secret_scanning = { status: 'enabled' };
      } catch {
        // If we can't fetch an alert, assume it might be disabled or no alerts exist
        settings.secret_scanning = { status: 'disabled' };
      }

      // These endpoints might require specific scopes
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
      logger.warning(`Could not fetch all security settings for ${owner}/${repo}: ${error}`);
    }

    return settings;
  }
}
