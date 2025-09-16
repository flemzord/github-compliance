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
  restrictions: RestrictionsSchema.partial().nullable().optional(),
});

// Schema for branch protection in defaults - with optional fields for flexibility
const BranchProtectionDefaultsSchema = z.object({
  patterns: z.array(z.string()), // Required - without patterns, protection is meaningless
  enforce_admins: z.boolean().optional(),
  required_reviews: RequiredReviewsSchema.optional(),
  required_status_checks: RequiredStatusChecksSchema.optional(),
  restrictions: RestrictionsSchema.nullable().optional(), // Optional - not everyone needs push restrictions, accepts null
  allow_force_pushes: z.boolean().optional(),
  allow_deletions: z.boolean().optional(),
  required_conversation_resolution: z.boolean().optional(),
  lock_branch: z.boolean().optional(),
  allow_fork_syncing: z.boolean().optional(),
});

const SecuritySchema = z.object({
  secret_scanning: z.enum(['enabled', 'disabled']),
  secret_scanning_push_protection: z.enum(['enabled', 'disabled', 'auto']),
  dependabot_alerts: z.boolean(),
  dependabot_updates: z.boolean(),
  code_scanning_recommended: z.boolean(),
});

const ConfigTeamPermissionSchema = z.object({
  team: z.string(),
  permission: z.enum(['read', 'triage', 'write', 'maintain', 'admin', 'push']),
});

const ConfigUserPermissionSchema = z.object({
  user: z.string(),
  permission: z.enum(['read', 'triage', 'write', 'maintain', 'admin', 'push']),
});

const TeamMemberSchema = z
  .object({
    username: z.string(),
    role: z.enum(['member', 'maintainer']).optional(),
  })
  .strict();

const TeamDefinitionSchema = z
  .object({
    name: z.string(),
    description: z.string().optional(),
    members: z.array(TeamMemberSchema).optional(),
    parent: z.string().optional(),
    privacy: z.enum(['secret', 'closed']).optional(),
    notification_setting: z.enum(['notifications_enabled', 'notifications_disabled']).optional(),
  })
  .strict();

const TeamMemberFilterSchema = z
  .object({
    usernames: z.array(z.string()).optional(),
    emails: z.array(z.string()).optional(),
    from_teams: z.array(z.string()).optional(),
    exclude_teams: z.array(z.string()).optional(),
    with_repo_access: z.array(z.string()).optional(),
  })
  .strict()
  .refine(
    (value) =>
      !!(
        value.usernames?.length ||
        value.emails?.length ||
        value.from_teams?.length ||
        value.exclude_teams?.length ||
        value.with_repo_access?.length
      ),
    {
      message: 'Team member filter must specify at least one criterion',
    }
  );

const TeamCompositionDifferenceSchema = z
  .object({
    from: z.string(),
    subtract: z.array(z.string()).min(1),
  })
  .strict();

const TeamCompositionSchema = z
  .object({
    union: z.array(z.string()).optional(),
    intersection: z.array(z.string()).optional(),
    difference: TeamCompositionDifferenceSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      !!(value.union?.length || value.intersection?.length || value.difference !== undefined),
    {
      message: 'Team composition must include at least one operation',
    }
  );

const DynamicTeamRuleSchema = z
  .object({
    name: z.string(),
    description: z.string().optional(),
    type: z.enum(['all_org_members', 'by_filter', 'composite']),
    filter: TeamMemberFilterSchema.optional(),
    compose: TeamCompositionSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.type === 'by_filter' && !value.filter) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'by_filter rules require a filter block',
      });
    }
    if (value.type === 'composite' && !value.compose) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'composite rules require a compose block',
      });
    }
    if (value.type !== 'by_filter' && value.filter) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Only by_filter rules may specify filter',
      });
    }
    if (value.type !== 'composite' && value.compose) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Only composite rules may specify compose',
      });
    }
  });

const TeamsConfigSchema = z
  .object({
    definitions: z.array(TeamDefinitionSchema).optional(),
    dynamic_rules: z.array(DynamicTeamRuleSchema).optional(),
    dry_run: z.boolean().optional(),
    unmanaged_teams: z.enum(['ignore', 'warn', 'remove']).optional(),
  })
  .strict();

const CacheTtlSchema = z
  .object({
    default: z.number().int().positive().optional(),
    repositoryList: z.number().int().positive().optional(),
    repository: z.number().int().positive().optional(),
    branch: z.number().int().positive().optional(),
    branchProtection: z.number().int().positive().optional(),
    collaborators: z.number().int().positive().optional(),
    teamPermissions: z.number().int().positive().optional(),
    securitySettings: z.number().int().positive().optional(),
    vulnerabilityAlerts: z.number().int().positive().optional(),
    currentUser: z.number().int().positive().optional(),
  })
  .strict();

const CacheFeatureToggleSchema = z
  .object({
    enabled: z.boolean(),
  })
  .strict();

const CacheAdaptiveSchema = CacheFeatureToggleSchema.extend({
  minTTL: z.number().int().positive().optional(),
  maxTTL: z.number().int().positive().optional(),
});

const CachePredictiveSchema = CacheFeatureToggleSchema.extend({
  threshold: z.number().min(0).max(1).optional(),
});

const CacheCompressionSchema = CacheFeatureToggleSchema.extend({
  level: z.number().int().min(1).max(9).optional(),
});

const CacheSchema = z
  .object({
    enabled: z.boolean(),
    storage: z.literal('memory').optional(),
    storagePath: z.string().optional(),
    maxSize: z.number().int().positive().optional(),
    ttl: CacheTtlSchema.optional(),
    adaptive: CacheAdaptiveSchema.optional(),
    predictive: CachePredictiveSchema.optional(),
    etag: CacheFeatureToggleSchema.optional(),
    compression: CacheCompressionSchema.optional(),
  })
  .strict();

const PermissionsSchema = z.object({
  remove_individual_collaborators: z.boolean(),
  teams: z.array(ConfigTeamPermissionSchema),
  users: z.array(ConfigUserPermissionSchema).optional(),
});

const ArchivedReposSchema = z.object({
  admin_team_only: z.boolean(),
  archive_inactive: z.boolean().optional(),
  inactive_days: z.number().optional(),
  unarchive_active: z.boolean().optional(),
  archive_patterns: z.array(z.string()).optional(),
  keep_active_patterns: z.array(z.string()).optional(),
  specific_repos: z.array(z.string()).optional(),
});

const RepositoryFeaturesSchema = z
  .object({
    has_issues: z.boolean().optional(),
    has_projects: z.boolean().optional(),
    has_wiki: z.boolean().optional(),
    has_discussions: z.boolean().optional(),
    has_pages: z.boolean().optional(),
  })
  .strict();

const RepositoryVisibilitySchema = z
  .object({
    allow_public: z.boolean().optional(),
    enforce_private: z.boolean().optional(),
  })
  .strict();

const RepositoryGeneralSettingsSchema = z
  .object({
    allow_auto_merge: z.boolean().optional(),
    delete_branch_on_merge: z.boolean().optional(),
    allow_update_branch: z.boolean().optional(),
    use_squash_pr_title_as_default: z.boolean().optional(),
    allow_merge_commit: z.boolean().optional(),
    allow_squash_merge: z.boolean().optional(),
    allow_rebase_merge: z.boolean().optional(),
  })
  .strict();

const RepositoryTemplatesSchema = z
  .object({
    require_issue_templates: z.boolean().optional(),
    require_pr_template: z.boolean().optional(),
  })
  .strict();

const RepositorySettingsSchema = z
  .object({
    features: RepositoryFeaturesSchema.optional(),
    visibility: RepositoryVisibilitySchema.optional(),
    general: RepositoryGeneralSettingsSchema.optional(),
    templates: RepositoryTemplatesSchema.optional(),
  })
  .strict();

const DefaultsSchema = z
  .object({
    merge_methods: MergeMethodsSchema,
    branch_protection: BranchProtectionDefaultsSchema,
    security: SecuritySchema,
    permissions: PermissionsSchema,
    archived_repos: ArchivedReposSchema,
    repository_settings: RepositorySettingsSchema,
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
      repository_settings: RepositorySettingsSchema.partial(),
    })
    .partial(),
});

const NEW_CHECK_NAMES = [
  'org-team-sync',
  'repo-merge-strategy',
  'repo-access-teams',
  'repo-branch-protection',
  'repo-security-controls',
  'repo-archival-policy',
] as const;

const LEGACY_CHECK_NAMES = [
  'team-sync',
  'merge-methods',
  'team-permissions',
  'branch-protection',
  'security-scanning',
  'archived-repos',
] as const;

const LEGACY_CHECK_NAME_ALIASES: Record<
  (typeof LEGACY_CHECK_NAMES)[number],
  (typeof NEW_CHECK_NAMES)[number]
> = {
  'team-sync': 'org-team-sync',
  'merge-methods': 'repo-merge-strategy',
  'team-permissions': 'repo-access-teams',
  'branch-protection': 'repo-branch-protection',
  'security-scanning': 'repo-security-controls',
  'archived-repos': 'repo-archival-policy',
};

const CheckNameSchema = z
  .union([
    z.enum(NEW_CHECK_NAMES),
    z.enum(LEGACY_CHECK_NAMES),
    z.literal('repository-settings')
  ])
  .transform(
    (value) => LEGACY_CHECK_NAME_ALIASES[value as (typeof LEGACY_CHECK_NAMES)[number]] ?? value
  );

const ChecksSchema = z.object({
  enabled: z.array(CheckNameSchema),
});

export const ComplianceConfigSchema = z.object({
  version: z.literal(1),
  organization: z.string().optional(),
  defaults: DefaultsSchema,
  rules: z.array(RuleSchema).optional(),
  checks: ChecksSchema.optional(),
  cache: CacheSchema.optional(),
  teams: TeamsConfigSchema.optional(),
});

export type ComplianceConfig = z.infer<typeof ComplianceConfigSchema>;
