import { z } from 'zod';

const MergeMethodsSchema = z.object({
  allow_merge_commit: z.boolean(),
  allow_squash_merge: z.boolean(),
  allow_rebase_merge: z.boolean(),
});

const RequiredReviewsSchema = z.object({
  dismiss_stale_reviews: z.boolean(),
  required_approving_review_count: z.number().min(0),
  require_code_owner_reviews: z.boolean(),
  require_last_push_approval: z.boolean(),
});

const RequiredStatusChecksSchema = z.object({
  auto_discover: z.boolean(),
  contexts: z.array(z.string()),
  strict: z.boolean(),
});

const RestrictionsSchema = z.object({
  users: z.array(z.string()),
  teams: z.array(z.string()),
});

const BranchProtectionSchema = z.object({
  patterns: z.array(z.string()),
  enforce_admins: z.boolean(),
  required_reviews: RequiredReviewsSchema,
  required_status_checks: RequiredStatusChecksSchema,
  restrictions: RestrictionsSchema,
  allow_force_pushes: z.boolean(),
  allow_deletions: z.boolean(),
  required_conversation_resolution: z.boolean(),
  lock_branch: z.boolean(),
  allow_fork_syncing: z.boolean(),
});

const PartialBranchProtectionSchema = BranchProtectionSchema.partial().extend({
  required_reviews: RequiredReviewsSchema.partial().optional(),
  required_status_checks: RequiredStatusChecksSchema.partial().optional(),
  restrictions: RestrictionsSchema.partial().optional(),
});

const SecuritySchema = z.object({
  secret_scanning: z.enum(['enabled', 'disabled']),
  secret_scanning_push_protection: z.enum(['enabled', 'disabled', 'auto']),
  dependabot_alerts: z.boolean(),
  dependabot_updates: z.boolean(),
  code_scanning_recommended: z.boolean(),
});

const TeamPermissionSchema = z.object({
  team: z.string(),
  permission: z.enum(['read', 'triage', 'write', 'maintain', 'admin', 'push']),
});

const PermissionsSchema = z.object({
  remove_individual_collaborators: z.boolean(),
  teams: z.array(TeamPermissionSchema),
});

const ArchivedReposSchema = z.object({
  admin_team_only: z.boolean(),
});

const DefaultsSchema = z
  .object({
    merge_methods: MergeMethodsSchema,
    branch_protection: BranchProtectionSchema,
    security: SecuritySchema,
    permissions: PermissionsSchema,
    archived_repos: ArchivedReposSchema,
  })
  .partial();

const MatchCriteriaSchema = z.object({
  repositories: z.array(z.string()).optional(),
  only_private: z.boolean().optional(),
});

const RuleSchema = z.object({
  match: MatchCriteriaSchema,
  apply: z
    .object({
      merge_methods: MergeMethodsSchema.partial(),
      branch_protection: PartialBranchProtectionSchema,
      security: SecuritySchema.partial(),
      permissions: PermissionsSchema.partial(),
      archived_repos: ArchivedReposSchema.partial(),
    })
    .partial(),
});

const ChecksSchema = z.object({
  enabled: z.array(
    z.enum([
      'merge-methods',
      'team-permissions',
      'branch-protection',
      'security-scanning',
      'archived-repos',
    ])
  ),
});

export const ComplianceConfigSchema = z.object({
  version: z.literal(1),
  organization: z.string().optional(),
  defaults: DefaultsSchema,
  rules: z.array(RuleSchema).optional(),
  checks: ChecksSchema.optional(),
});

export type ComplianceConfig = z.infer<typeof ComplianceConfigSchema>;
