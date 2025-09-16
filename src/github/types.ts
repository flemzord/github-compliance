import type { CacheConfig, CacheManager } from '../cache';

export type GitHubClientCacheOptions = CacheConfig | CacheManager;

export interface Repository {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  archived: boolean;
  disabled: boolean;
  fork: boolean;
  default_branch: string;
  updated_at: string;
  pushed_at: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  size: number;
  language: string | null;
  permissions?: {
    admin: boolean;
    maintain: boolean;
    push: boolean;
    triage: boolean;
    pull: boolean;
  };
}

export interface BranchProtectionRule {
  required_status_checks: {
    strict: boolean;
    contexts: string[];
    checks: { context: string; app_id?: number }[];
  } | null;
  enforce_admins: boolean;
  required_pull_request_reviews: {
    dismiss_stale_reviews: boolean;
    require_code_owner_reviews: boolean;
    required_approving_review_count: number;
    require_last_push_approval: boolean;
    dismissal_restrictions?: {
      users: string[];
      teams: string[];
    };
  } | null;
  restrictions: {
    users: string[];
    teams: string[];
    apps: string[];
  } | null;
  allow_force_pushes: boolean;
  allow_deletions: boolean;
  required_conversation_resolution: boolean;
  lock_branch: boolean;
  allow_fork_syncing: boolean;
}

export interface TeamPermission {
  id: number;
  name: string;
  slug: string;
  permission: 'read' | 'triage' | 'write' | 'maintain' | 'admin';
}

export interface Collaborator {
  id: number;
  login: string;
  type: 'User' | 'Bot';
  permissions: {
    admin: boolean;
    maintain: boolean;
    push: boolean;
    triage: boolean;
    pull: boolean;
  };
}

export interface SecuritySettings {
  secret_scanning?: {
    status: 'enabled' | 'disabled';
  };
  secret_scanning_push_protection?: {
    status: 'enabled' | 'disabled';
  };
  dependabot_alerts?: {
    enabled: boolean;
  };
  dependabot_security_updates?: {
    enabled: boolean;
  };
  dependency_graph?: {
    enabled: boolean;
  };
}

export interface RepositorySettings {
  name: string;
  allow_merge_commit: boolean;
  allow_squash_merge: boolean;
  allow_rebase_merge: boolean;
  delete_branch_on_merge: boolean;
  archived: boolean;
  disabled: boolean;
}

export interface GitHubClientOptions {
  token: string;
  baseUrl?: string;
  throttle?: {
    enabled: boolean;
    retries: number;
    retryDelay: number;
  };
  cache?: GitHubClientCacheOptions;
}

// Re-export GitHubClient class from client module
export { GitHubClient } from './client';
