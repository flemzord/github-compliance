import { GitHubClient } from '../client';
import * as GithubModule from '../index';
import type { BranchProtectionRule, GitHubClientOptions, Repository } from '../types';

describe('GitHub Module Index', () => {
  it('should export GitHubClient from client module', () => {
    expect(GithubModule.GitHubClient).toBe(GitHubClient);
    expect(typeof GithubModule.GitHubClient).toBe('function');
  });

  it('should export types from types module', () => {
    // Test that types are available (TypeScript will validate)
    const clientOptions: GitHubClientOptions = {
      token: 'test-token',
    };

    const repository: Repository = {
      id: 1,
      name: 'test',
      full_name: 'owner/test',
      private: false,
      archived: false,
      disabled: false,
      fork: false,
      default_branch: 'main',
      updated_at: '2023-01-01T00:00:00Z',
      pushed_at: '2023-01-01T00:00:00Z',
      stargazers_count: 0,
      forks_count: 0,
      open_issues_count: 0,
      size: 0,
      language: null,
    };

    const protection: BranchProtectionRule = {
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

    expect(clientOptions.token).toBe('test-token');
    expect(repository.id).toBe(1);
    expect(protection.enforce_admins).toBe(false);
  });

  it('should create GitHubClient instance from exported class', () => {
    const client = new GithubModule.GitHubClient({ token: 'test-token' });
    expect(client).toBeInstanceOf(GitHubClient);
  });
});
