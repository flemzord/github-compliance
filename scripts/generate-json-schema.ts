#!/usr/bin/env tsx

import { writeFileSync } from "fs";
import { join } from "path";

// Manual JSON Schema generation since zod-to-json-schema is not compatible with our Zod version
const jsonSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://github.com/flemzord/github-compliance/compliance-schema.json",
  title: "GitHub Compliance Configuration",
  description:
    "Configuration schema for GitHub repository compliance enforcement",
  type: "object",
  required: ["version", "defaults"],
  properties: {
    version: {
      type: "integer",
      const: 1,
      description: "Schema version (must be 1)",
    },
    organization: {
      type: "string",
      description: "GitHub organization name to apply compliance rules to",
      pattern: "^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]$",
    },
    defaults: {
      type: "object",
      description: "Default compliance settings applied to all repositories",
      properties: {
        merge_methods: {
          $ref: "#/definitions/merge_methods",
        },
        branch_protection: {
          $ref: "#/definitions/branch_protection_defaults",
        },
        security: {
          $ref: "#/definitions/security",
        },
        permissions: {
          $ref: "#/definitions/permissions",
        },
        archived_repos: {
          $ref: "#/definitions/archived_repos",
        },
        repository_settings: {
          $ref: "#/definitions/repository_settings",
        },
      },
      additionalProperties: false,
    },
    rules: {
      type: "array",
      description:
        "Repository-specific overrides based on patterns or criteria",
      items: {
        type: "object",
        required: ["match", "apply"],
        properties: {
          match: {
            type: "object",
            description: "Criteria to match repositories",
            properties: {
              repositories: {
                type: "array",
                description:
                  "List of repository name patterns (supports wildcards)",
                items: {
                  type: "string",
                },
              },
              only_private: {
                type: "boolean",
                description: "Apply only to private repositories",
              },
            },
            additionalProperties: false,
          },
          apply: {
            type: "object",
            description: "Settings to apply to matched repositories",
            properties: {
              merge_methods: {
                $ref: "#/definitions/merge_methods_partial",
              },
              branch_protection: {
                $ref: "#/definitions/branch_protection_partial",
              },
              security: {
                $ref: "#/definitions/security_partial",
              },
              permissions: {
                $ref: "#/definitions/permissions_partial",
              },
              archived_repos: {
                $ref: "#/definitions/archived_repos_partial",
              },
              repository_settings: {
                $ref: "#/definitions/repository_settings_partial",
              },
            },
            additionalProperties: false,
          },
        },
        additionalProperties: false,
      },
    },
    checks: {
      $ref: "#/definitions/checks",
    },
    cache: {
      $ref: "#/definitions/cache",
    },
    teams: {
      $ref: "#/definitions/teams",
    },
  },
  additionalProperties: false,
  definitions: {
    checks: {
      type: "object",
      description: "Configures which compliance checks to enable",
      properties: {
        enabled: {
          type: "array",
          description: "List of enabled compliance checks",
          items: {
            type: "string",
            enum: [
              "org-team-sync",
              "repo-merge-strategy",
              "repo-access-teams",
              "repo-branch-protection",
              "repo-security-controls",
              "repo-archival-policy",
              "repo-settings",
              // Legacy names (will be transformed)
              "team-sync",
              "merge-methods",
              "team-permissions",
              "branch-protection",
              "security-scanning",
              "archived-repos",
              "repository-settings",
            ],
          },
        },
      },
      additionalProperties: false,
    },
    teams: {
      type: "object",
      description: "GitHub team synchronization configuration",
      properties: {
        definitions: {
          type: "array",
          description: "Static team definitions",
          items: {
            $ref: "#/definitions/team_definition",
          },
        },
        dynamic_rules: {
          type: "array",
          description: "Dynamic team membership rules",
          items: {
            $ref: "#/definitions/dynamic_team_rule",
          },
        },
        dry_run: {
          type: "boolean",
          description: "Run in dry-run mode (no changes applied)",
        },
        unmanaged_teams: {
          type: "string",
          enum: ["ignore", "warn", "remove"],
          description: "How to handle teams not defined in configuration",
        },
      },
      additionalProperties: false,
    },
    team_definition: {
      type: "object",
      required: ["name"],
      properties: {
        name: {
          type: "string",
          description: "Team name/slug",
        },
        description: {
          type: "string",
          description: "Team description",
        },
        members: {
          type: "array",
          description: "Team members",
          items: {
            $ref: "#/definitions/team_member",
          },
        },
        parent: {
          type: "string",
          description: "Parent team slug for nested teams",
        },
        privacy: {
          type: "string",
          enum: ["secret", "closed"],
          description: "Team visibility",
        },
        notification_setting: {
          type: "string",
          enum: ["notifications_enabled", "notifications_disabled"],
          description: "Team notification settings",
        },
      },
      additionalProperties: false,
    },
    team_member: {
      type: "object",
      required: ["username"],
      properties: {
        username: {
          type: "string",
          description: "GitHub username",
        },
        role: {
          type: "string",
          enum: ["member", "maintainer"],
          description: "Role in the team",
        },
      },
      additionalProperties: false,
    },
    dynamic_team_rule: {
      type: "object",
      required: ["name", "type"],
      properties: {
        name: {
          type: "string",
          description: "Team name to create/update",
        },
        description: {
          type: "string",
          description: "Team description",
        },
        type: {
          type: "string",
          enum: ["all_org_members", "by_filter", "composite"],
          description: "Type of dynamic rule",
        },
        filter: {
          $ref: "#/definitions/team_member_filter",
        },
        compose: {
          $ref: "#/definitions/team_composition",
        },
      },
      additionalProperties: false,
    },
    team_member_filter: {
      type: "object",
      description: "Filter criteria for team members",
      properties: {
        usernames: {
          type: "array",
          items: { type: "string" },
        },
        emails: {
          type: "array",
          items: { type: "string" },
        },
        from_teams: {
          type: "array",
          items: { type: "string" },
        },
        exclude_teams: {
          type: "array",
          items: { type: "string" },
        },
        with_repo_access: {
          type: "array",
          items: { type: "string" },
        },
      },
      additionalProperties: false,
    },
    team_composition: {
      type: "object",
      description: "Team composition operations",
      properties: {
        union: {
          type: "array",
          items: { type: "string" },
        },
        intersection: {
          type: "array",
          items: { type: "string" },
        },
        difference: {
          type: "object",
          properties: {
            from: { type: "string" },
            subtract: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: ["from", "subtract"],
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
    cache: {
      type: "object",
      description: "Configures caching for GitHub API responses",
      required: ["enabled"],
      properties: {
        enabled: {
          type: "boolean",
          description: "Enable or disable the caching layer",
        },
        storage: {
          type: "string",
          enum: ["memory"],
          description: "Storage backend for cache entries",
        },
        storagePath: {
          type: "string",
          description:
            "Filesystem path when using the filesystem cache backend",
        },
        maxSize: {
          type: "integer",
          minimum: 1,
          description: "Maximum cache size in megabytes",
        },
        ttl: {
          $ref: "#/definitions/cache_ttl",
        },
        adaptive: {
          $ref: "#/definitions/cache_adaptive",
        },
        predictive: {
          $ref: "#/definitions/cache_predictive",
        },
        etag: {
          $ref: "#/definitions/cache_feature_toggle",
        },
        compression: {
          $ref: "#/definitions/cache_compression",
        },
      },
      additionalProperties: false,
    },
    cache_ttl: {
      type: "object",
      description: "Time-to-live configuration per cached resource (seconds)",
      properties: {
        default: {
          type: "integer",
          minimum: 1,
          description: "Fallback TTL when no specific value is provided",
        },
        repositoryList: {
          type: "integer",
          minimum: 1,
          description: "TTL for repository listings",
        },
        repository: {
          type: "integer",
          minimum: 1,
          description: "TTL for repository details",
        },
        branch: {
          type: "integer",
          minimum: 1,
          description: "TTL for branch metadata",
        },
        branchProtection: {
          type: "integer",
          minimum: 1,
          description: "TTL for branch protection rules",
        },
        collaborators: {
          type: "integer",
          minimum: 1,
          description: "TTL for collaborator listings",
        },
        teamPermissions: {
          type: "integer",
          minimum: 1,
          description: "TTL for team permission listings",
        },
        securitySettings: {
          type: "integer",
          minimum: 1,
          description: "TTL for security configuration data",
        },
        vulnerabilityAlerts: {
          type: "integer",
          minimum: 1,
          description: "TTL for Dependabot vulnerability alerts",
        },
        currentUser: {
          type: "integer",
          minimum: 1,
          description: "TTL for authenticated user information",
        },
      },
      additionalProperties: false,
    },
    cache_feature_toggle: {
      type: "object",
      required: ["enabled"],
      properties: {
        enabled: {
          type: "boolean",
          description: "Feature toggle switch",
        },
      },
      additionalProperties: false,
    },
    cache_adaptive: {
      allOf: [
        {
          $ref: "#/definitions/cache_feature_toggle",
        },
        {
          type: "object",
          properties: {
            minTTL: {
              type: "integer",
              minimum: 1,
              description:
                "Minimum allowed TTL when adaptive caching is enabled",
            },
            maxTTL: {
              type: "integer",
              minimum: 1,
              description:
                "Maximum allowed TTL when adaptive caching is enabled",
            },
          },
          additionalProperties: false,
        },
      ],
    },
    cache_predictive: {
      allOf: [
        {
          $ref: "#/definitions/cache_feature_toggle",
        },
        {
          type: "object",
          properties: {
            threshold: {
              type: "number",
              minimum: 0,
              maximum: 1,
              description: "Threshold for predictive cache pre-warming",
            },
          },
          additionalProperties: false,
        },
      ],
    },
    cache_compression: {
      allOf: [
        {
          $ref: "#/definitions/cache_feature_toggle",
        },
        {
          type: "object",
          properties: {
            level: {
              type: "integer",
              minimum: 1,
              maximum: 9,
              description: "Compression level for persisted cache entries",
            },
          },
          additionalProperties: false,
        },
      ],
    },
    merge_methods: {
      type: "object",
      description:
        "Controls which merge strategies are allowed for pull requests",
      required: [
        "allow_merge_commit",
        "allow_squash_merge",
        "allow_rebase_merge",
      ],
      properties: {
        allow_merge_commit: {
          type: "boolean",
          description: "Allow merge commits",
        },
        allow_squash_merge: {
          type: "boolean",
          description: "Allow squash merging",
        },
        allow_rebase_merge: {
          type: "boolean",
          description: "Allow rebase merging",
        },
      },
      additionalProperties: false,
    },
    merge_methods_partial: {
      type: "object",
      description: "Partial merge methods configuration for overrides",
      properties: {
        allow_merge_commit: {
          type: "boolean",
        },
        allow_squash_merge: {
          type: "boolean",
        },
        allow_rebase_merge: {
          type: "boolean",
        },
      },
      additionalProperties: false,
    },
    branch_protection_defaults: {
      type: "object",
      description:
        "Configures branch protection rules for repositories (defaults section - most fields optional)",
      required: ["patterns"],
      properties: {
        patterns: {
          type: "array",
          description:
            "Branch name patterns to protect (e.g., 'main', 'release/*')",
          items: {
            type: "string",
          },
          examples: [["main", "release/*", "develop"]],
        },
        enforce_admins: {
          type: "boolean",
          description: "Enforce all configured restrictions for administrators",
        },
        required_reviews: {
          $ref: "#/definitions/required_reviews",
        },
        required_status_checks: {
          $ref: "#/definitions/required_status_checks",
        },
        restrictions: {
          oneOf: [
            {
              $ref: "#/definitions/restrictions",
            },
            {
              type: "null",
            },
          ],
          description:
            "Restrict who can push to protected branches (optional - leave out or set to null if not needed)",
        },
        allow_force_pushes: {
          type: "boolean",
          description: "Permit force pushes for all users with push access",
        },
        allow_deletions: {
          type: "boolean",
          description:
            "Allow users with push access to delete protected branches",
        },
        required_conversation_resolution: {
          type: "boolean",
          description:
            "Require all conversations to be resolved before merging",
        },
        lock_branch: {
          type: "boolean",
          description: "Lock the branch (read-only)",
        },
        allow_fork_syncing: {
          type: "boolean",
          description: "Allow fork syncing",
        },
      },
      additionalProperties: false,
    },
    branch_protection: {
      type: "object",
      description:
        "Configures branch protection rules for repositories (full schema for rules)",
      required: [
        "patterns",
        "enforce_admins",
        "required_reviews",
        "required_status_checks",
        "restrictions",
        "allow_force_pushes",
        "allow_deletions",
        "required_conversation_resolution",
        "lock_branch",
        "allow_fork_syncing",
      ],
      properties: {
        patterns: {
          type: "array",
          description:
            "Branch name patterns to protect (e.g., 'main', 'release/*')",
          items: {
            type: "string",
          },
          examples: [["main", "release/*", "develop"]],
        },
        enforce_admins: {
          type: "boolean",
          description: "Enforce all configured restrictions for administrators",
        },
        required_reviews: {
          $ref: "#/definitions/required_reviews",
        },
        required_status_checks: {
          $ref: "#/definitions/required_status_checks",
        },
        restrictions: {
          $ref: "#/definitions/restrictions",
        },
        allow_force_pushes: {
          type: "boolean",
          description: "Permit force pushes for all users with push access",
        },
        allow_deletions: {
          type: "boolean",
          description:
            "Allow users with push access to delete protected branches",
        },
        required_conversation_resolution: {
          type: "boolean",
          description:
            "Require all conversations to be resolved before merging",
        },
        lock_branch: {
          type: "boolean",
          description: "Lock the branch (read-only)",
        },
        allow_fork_syncing: {
          type: "boolean",
          description: "Allow fork syncing",
        },
      },
      additionalProperties: false,
    },
    branch_protection_partial: {
      type: "object",
      description: "Partial branch protection configuration for overrides",
      properties: {
        patterns: {
          type: "array",
          items: {
            type: "string",
          },
        },
        enforce_admins: {
          type: "boolean",
        },
        required_reviews: {
          $ref: "#/definitions/required_reviews_partial",
        },
        required_status_checks: {
          $ref: "#/definitions/required_status_checks_partial",
        },
        restrictions: {
          oneOf: [
            {
              $ref: "#/definitions/restrictions_partial",
            },
            {
              type: "null",
            },
          ],
        },
        allow_force_pushes: {
          type: "boolean",
        },
        allow_deletions: {
          type: "boolean",
        },
        required_conversation_resolution: {
          type: "boolean",
        },
        lock_branch: {
          type: "boolean",
        },
        allow_fork_syncing: {
          type: "boolean",
        },
      },
      additionalProperties: false,
    },
    required_reviews: {
      type: "object",
      required: [
        "dismiss_stale_reviews",
        "require_code_owner_reviews",
        "required_approving_review_count",
        "require_last_push_approval",
      ],
      properties: {
        dismiss_stale_reviews: {
          type: "boolean",
          description: "Dismiss approved reviews when new commits are pushed",
        },
        require_code_owner_reviews: {
          type: "boolean",
          description: "Require review from code owners",
        },
        required_approving_review_count: {
          type: "integer",
          minimum: 0,
          description: "Number of required approving reviews",
        },
        require_last_push_approval: {
          type: "boolean",
          description:
            "Require approval from someone other than the last pusher",
        },
      },
      additionalProperties: false,
    },
    required_reviews_partial: {
      type: "object",
      properties: {
        dismiss_stale_reviews: {
          type: "boolean",
        },
        require_code_owner_reviews: {
          type: "boolean",
        },
        required_approving_review_count: {
          type: "integer",
          minimum: 0,
        },
        require_last_push_approval: {
          type: "boolean",
        },
      },
      additionalProperties: false,
    },
    required_status_checks: {
      type: "object",
      required: ["strict", "contexts", "auto_discover"],
      properties: {
        strict: {
          type: "boolean",
          description: "Require branches to be up to date before merging",
        },
        contexts: {
          type: "array",
          description: "List of status checks that must pass",
          items: {
            type: "string",
          },
          examples: [["continuous-integration/travis-ci", "ci/circleci"]],
        },
        auto_discover: {
          type: "boolean",
          description:
            "Automatically discover status checks from the repository",
        },
      },
      additionalProperties: false,
    },
    required_status_checks_partial: {
      type: "object",
      properties: {
        strict: {
          type: "boolean",
        },
        contexts: {
          type: "array",
          items: {
            type: "string",
          },
        },
        auto_discover: {
          type: "boolean",
        },
      },
      additionalProperties: false,
    },
    restrictions: {
      type: "object",
      description: "Restrict who can push to protected branches",
      required: ["users", "teams"],
      properties: {
        users: {
          type: "array",
          description: "GitHub usernames allowed to push",
          items: {
            type: "string",
          },
        },
        teams: {
          type: "array",
          description: "GitHub team slugs allowed to push",
          items: {
            type: "string",
          },
        },
      },
      additionalProperties: false,
      examples: [
        {
          users: [],
          teams: ["admin-team", "release-team"],
        },
        {
          users: [],
          teams: [],
        },
      ],
    },
    restrictions_partial: {
      type: "object",
      properties: {
        users: {
          type: "array",
          items: {
            type: "string",
          },
        },
        teams: {
          type: "array",
          items: {
            type: "string",
          },
        },
      },
      additionalProperties: false,
    },
    security: {
      type: "object",
      description:
        "Manages security features like secret scanning and vulnerability alerts",
      required: [
        "secret_scanning",
        "secret_scanning_push_protection",
        "dependabot_alerts",
        "dependabot_updates",
        "code_scanning_recommended",
      ],
      properties: {
        secret_scanning: {
          type: "string",
          enum: ["enabled", "disabled"],
          description: "GitHub secret scanning in code",
        },
        secret_scanning_push_protection: {
          type: "string",
          enum: ["enabled", "disabled", "auto"],
          description: "Block pushes containing secrets",
        },
        dependabot_alerts: {
          type: "boolean",
          description: "Enable vulnerability alerts",
        },
        dependabot_updates: {
          type: "boolean",
          description: "Enable automatic dependency updates",
        },
        code_scanning_recommended: {
          type: "boolean",
          description:
            "Recommend code scanning (requires GitHub Advanced Security for private repos)",
        },
      },
      additionalProperties: false,
    },
    security_partial: {
      type: "object",
      properties: {
        secret_scanning: {
          type: "string",
          enum: ["enabled", "disabled"],
        },
        secret_scanning_push_protection: {
          type: "string",
          enum: ["enabled", "disabled", "auto"],
        },
        dependabot_alerts: {
          type: "boolean",
        },
        dependabot_updates: {
          type: "boolean",
        },
        code_scanning_recommended: {
          type: "boolean",
        },
      },
      additionalProperties: false,
    },
    permissions: {
      type: "object",
      description: "Defines team access levels and collaborator management",
      required: ["remove_individual_collaborators", "teams"],
      properties: {
        remove_individual_collaborators: {
          type: "boolean",
          description:
            "Remove individual collaborators (keep only team access)",
        },
        teams: {
          type: "array",
          description: "Team permission configurations",
          items: {
            $ref: "#/definitions/team_permission",
          },
        },
        users: {
          type: "array",
          description: "Direct collaborator permissions to enforce",
          items: {
            $ref: "#/definitions/user_permission",
          },
        },
      },
      additionalProperties: false,
    },
    permissions_partial: {
      type: "object",
      properties: {
        remove_individual_collaborators: {
          type: "boolean",
        },
        teams: {
          type: "array",
          items: {
            $ref: "#/definitions/team_permission",
          },
        },
        users: {
          type: "array",
          items: {
            $ref: "#/definitions/user_permission",
          },
        },
      },
      additionalProperties: false,
    },
    team_permission: {
      type: "object",
      required: ["team", "permission"],
      properties: {
        team: {
          type: "string",
          description: "GitHub team slug",
        },
        permission: {
          type: "string",
          enum: ["read", "triage", "write", "maintain", "admin", "push"],
          description:
            "Permission level: read < triage < write/push < maintain < admin",
        },
      },
      additionalProperties: false,
    },
    user_permission: {
      type: "object",
      required: ["user", "permission"],
      properties: {
        user: {
          type: "string",
          description: "GitHub username to manage",
        },
        permission: {
          type: "string",
          enum: ["read", "triage", "write", "maintain", "admin", "push"],
          description:
            "Permission level: read < triage < write/push < maintain < admin",
        },
      },
      additionalProperties: false,
    },
    archived_repos: {
      type: "object",
      description: "Controls access and management of archived repositories",
      required: ["admin_team_only"],
      properties: {
        admin_team_only: {
          type: "boolean",
          description: "Restrict archived repos to admin team access only",
        },
        archive_inactive: {
          type: "boolean",
          description: "Automatically archive inactive repositories",
        },
        inactive_days: {
          type: "integer",
          minimum: 1,
          description: "Days of inactivity before archiving",
        },
        unarchive_active: {
          type: "boolean",
          description: "Automatically unarchive if activity detected",
        },
        archive_patterns: {
          type: "array",
          description: "Repository name patterns to archive",
          items: {
            type: "string",
          },
        },
        keep_active_patterns: {
          type: "array",
          description: "Repository name patterns to never archive",
          items: {
            type: "string",
          },
        },
        specific_repos: {
          type: "array",
          description: "Specific repositories to archive",
          items: {
            type: "string",
          },
        },
      },
      additionalProperties: false,
    },
    archived_repos_partial: {
      type: "object",
      properties: {
        admin_team_only: {
          type: "boolean",
        },
        archive_inactive: {
          type: "boolean",
        },
        inactive_days: {
          type: "integer",
          minimum: 1,
        },
        unarchive_active: {
          type: "boolean",
        },
        archive_patterns: {
          type: "array",
          items: {
            type: "string",
          },
        },
        keep_active_patterns: {
          type: "array",
          items: {
            type: "string",
          },
        },
        specific_repos: {
          type: "array",
          items: {
            type: "string",
          },
        },
      },
      additionalProperties: false,
    },
    repository_features: {
      type: "object",
      description: "Toggle availability of built-in repository features",
      properties: {
        has_issues: {
          type: "boolean",
          description: "Enable GitHub Issues",
        },
        has_projects: {
          type: "boolean",
          description: "Enable GitHub Projects",
        },
        has_wiki: {
          type: "boolean",
          description: "Enable repository wiki",
        },
        has_discussions: {
          type: "boolean",
          description: "Enable GitHub Discussions",
        },
        has_pages: {
          type: "boolean",
          description: "Enable GitHub Pages",
        },
      },
      additionalProperties: false,
    },
    repository_visibility: {
      type: "object",
      description: "Visibility requirements for repositories",
      properties: {
        allow_public: {
          type: "boolean",
          description: "Whether public repositories are allowed",
        },
        enforce_private: {
          type: "boolean",
          description: "Require repositories to be private",
        },
      },
      additionalProperties: false,
      allOf: [
        {
          not: {
            properties: {
              allow_public: {
                const: true,
              },
              enforce_private: {
                const: true,
              },
            },
            required: ["allow_public", "enforce_private"],
          },
        },
      ],
    },
    repository_general_settings: {
      type: "object",
      description: "General repository workflow preferences",
      properties: {
        allow_auto_merge: {
          type: "boolean",
          description: "Allow auto-merge for pull requests",
        },
        delete_branch_on_merge: {
          type: "boolean",
          description: "Automatically delete head branch after merging",
        },
        allow_update_branch: {
          type: "boolean",
          description: "Allow maintainers to update pull request branches",
        },
        use_squash_pr_title_as_default: {
          type: "boolean",
          description: "Default squash commit title to pull request title",
        },
      },
      additionalProperties: false,
    },
    repository_templates: {
      type: "object",
      description: "Template requirements for collaboration workflows",
      properties: {
        require_issue_templates: {
          type: "boolean",
          description: "Require issue templates to exist",
        },
        require_pr_template: {
          type: "boolean",
          description: "Require a pull request template to exist",
        },
      },
      additionalProperties: false,
    },
    repository_settings: {
      type: "object",
      description: "Repository settings compliance policy",
      properties: {
        features: {
          $ref: "#/definitions/repository_features",
        },
        visibility: {
          $ref: "#/definitions/repository_visibility",
        },
        general: {
          $ref: "#/definitions/repository_general_settings",
        },
        templates: {
          $ref: "#/definitions/repository_templates",
        },
      },
      additionalProperties: false,
    },
    repository_settings_partial: {
      type: "object",
      description:
        "Partial repository settings overrides for matched repositories",
      properties: {
        features: {
          $ref: "#/definitions/repository_features",
        },
        visibility: {
          $ref: "#/definitions/repository_visibility",
        },
        general: {
          $ref: "#/definitions/repository_general_settings",
        },
        templates: {
          $ref: "#/definitions/repository_templates",
        },
      },
      additionalProperties: false,
    },
  },
};

// Write the schema to file
const outputPath = join(process.cwd(), "compliance-schema.json");
writeFileSync(outputPath, JSON.stringify(jsonSchema, null, 2) + "\n");

console.log(`✅ JSON Schema generated at: ${outputPath}`);
