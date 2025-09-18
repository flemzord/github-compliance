import type { CacheConfig } from '../cache';

export interface MergeMethods {
  allow_merge_commit: boolean;
  allow_squash_merge: boolean;
  allow_rebase_merge: boolean;
}

export interface RequiredReviews {
  dismiss_stale_reviews: boolean;
  required_approving_review_count: number;
  require_code_owner_reviews: boolean;
  require_last_push_approval: boolean;
}

export interface RequiredStatusChecks {
  auto_discover: boolean;
  contexts: string[];
  strict: boolean;
}

export interface Restrictions {
  users: string[];
  teams: string[];
}

export interface BranchProtection {
  patterns: string[];
  enforce_admins: boolean;
  required_reviews: RequiredReviews;
  required_status_checks: RequiredStatusChecks;
  restrictions: Restrictions;
  allow_force_pushes: boolean;
  allow_deletions: boolean;
  required_conversation_resolution: boolean;
  lock_branch: boolean;
  allow_fork_syncing: boolean;
}

// Branch protection for defaults - most fields are optional
export interface BranchProtectionDefaults {
  patterns: string[];
  enforce_admins?: boolean;
  required_reviews?: RequiredReviews;
  required_status_checks?: RequiredStatusChecks;
  restrictions?: Restrictions | null;
  allow_force_pushes?: boolean;
  allow_deletions?: boolean;
  required_conversation_resolution?: boolean;
  lock_branch?: boolean;
  allow_fork_syncing?: boolean;
}

export interface Security {
  secret_scanning: string;
  secret_scanning_push_protection: string;
  dependabot_alerts: boolean;
  dependabot_updates: boolean;
  code_scanning_recommended: boolean;
}

export interface ConfigTeamPermission {
  team: string;
  permission: string;
}

export interface ConfigUserPermission {
  user: string;
  permission: string;
}

export interface Permissions {
  remove_individual_collaborators: boolean;
  teams: ConfigTeamPermission[];
  users?: ConfigUserPermission[];
}

export type TeamPrivacy = 'secret' | 'closed';

export type TeamNotificationSetting = 'notifications_enabled' | 'notifications_disabled';

export interface TeamMember {
  username: string;
  role?: 'member' | 'maintainer';
}

export interface TeamDefinition {
  name: string;
  description?: string;
  members?: TeamMember[];
  parent?: string;
  privacy?: TeamPrivacy;
  notification_setting?: TeamNotificationSetting;
}

export interface TeamMemberFilter {
  usernames?: string[];
  emails?: string[];
  from_teams?: string[];
  exclude_teams?: string[];
  with_repo_access?: string[];
}

export interface TeamCompositionDifference {
  from: string;
  subtract: string[];
}

export interface TeamComposition {
  union?: string[];
  intersection?: string[];
  difference?: TeamCompositionDifference;
}

export interface DynamicTeamRule {
  name: string;
  description?: string;
  type: 'all_org_members' | 'by_filter' | 'composite';
  filter?: TeamMemberFilter;
  compose?: TeamComposition;
}

export type UnmanagedTeamsMode = 'ignore' | 'warn' | 'remove';

export interface TeamsConfig {
  definitions?: TeamDefinition[];
  dynamic_rules?: DynamicTeamRule[];
  dry_run?: boolean;
  unmanaged_teams?: UnmanagedTeamsMode;
}

export interface ArchivedRepos {
  admin_team_only: boolean;
  archive_inactive?: boolean;
  inactive_days?: number;
  unarchive_active?: boolean;
  archive_patterns?: string[];
  keep_active_patterns?: string[];
  specific_repos?: string[];
}

export interface Defaults {
  merge_methods?: MergeMethods;
  branch_protection?: BranchProtectionDefaults;
  security?: Security;
  permissions?: Permissions;
  archived_repos?: ArchivedRepos;
}

export interface MatchCriteria {
  repositories?: string[];
  only_private?: boolean;
}

export interface Rule {
  match: MatchCriteria;
  apply: Partial<Defaults>;
}

export interface Checks {
  enabled: string[];
}

export interface ComplianceConfig {
  version: number;
  organization?: string;
  defaults: Defaults;
  rules?: Rule[];
  checks?: Checks;
  cache?: CacheConfig;
  teams?: TeamsConfig;
}
