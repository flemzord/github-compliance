# Configuration Reference

This document provides a comprehensive reference for all configuration options available in the GitHub Compliance CLI. The configuration is defined in a YAML file and validated using strict schemas.

## Table of Contents

- [Configuration Structure](#configuration-structure)
- [Version](#version)
- [Organization](#organization)
- [Defaults Section](#defaults-section)
  - [Merge Methods](#merge-methods)
  - [Branch Protection](#branch-protection)
  - [Security Settings](#security-settings)
  - [Permissions](#permissions)
  - [Archived Repositories](#archived-repositories)
  - [Repository Settings](#repository-settings)
- [Rules Section](#rules-section)
- [Checks Section](#checks-section)
- [Complete Configuration Example](#complete-configuration-example)

## Configuration Structure

The configuration file follows this basic structure:

```yaml
version: 1
organization: "your-org-name"
defaults:
  # Global default settings
rules:
  # Repository-specific rules
checks:
  # Enabled compliance checks
```

## Version

**Required**: Yes
**Type**: `number`
**Value**: Must be `1`

```yaml
version: 1
```

The version field ensures configuration compatibility. Currently, only version 1 is supported.

## Organization

**Required**: No
**Type**: `string`

```yaml
organization: "my-github-org"
```

The GitHub organization name to scan for compliance. If omitted, provide the organization name via the `--org` flag when running the CLI.

## Defaults Section

The `defaults` section defines global settings that apply to all repositories unless overridden by specific rules.

### Merge Methods

Controls which merge strategies are allowed for pull requests.

**Path**: `defaults.merge_methods`

| Field | Type | Description |
|-------|------|-------------|
| `allow_merge_commit` | `boolean` | Allow merge commits (creates merge commit with all commits from feature branch) |
| `allow_squash_merge` | `boolean` | Allow squash merging (combines all commits into single commit) |
| `allow_rebase_merge` | `boolean` | Allow rebase merging (adds commits onto base branch) |

**Example**:
```yaml
defaults:
  merge_methods:
    allow_merge_commit: false
    allow_squash_merge: true
    allow_rebase_merge: true
```

### Branch Protection

Configures branch protection rules for specified branch patterns.

**Path**: `defaults.branch_protection`

| Field | Type | Description |
|-------|------|-------------|
| `patterns` | `string[]` | Branch name patterns to protect (e.g., `["main", "release/*"]`) |
| `enforce_admins` | `boolean` | Apply rules to administrators |
| `allow_force_pushes` | `boolean` | Allow force pushes to protected branches |
| `allow_deletions` | `boolean` | Allow branch deletion |
| `required_conversation_resolution` | `boolean` | Require all conversations to be resolved before merging |
| `lock_branch` | `boolean` | Lock the branch (read-only) |
| `allow_fork_syncing` | `boolean` | Allow fork syncing |

#### Required Reviews

**Path**: `defaults.branch_protection.required_reviews`

| Field | Type | Description |
|-------|------|-------------|
| `dismiss_stale_reviews` | `boolean` | Dismiss approvals when new commits are pushed |
| `required_approving_review_count` | `number` | Number of required approvals (min: 0) |
| `require_code_owner_reviews` | `boolean` | Require review from code owners |
| `require_last_push_approval` | `boolean` | Require approval after last push |

#### Required Status Checks

**Path**: `defaults.branch_protection.required_status_checks`

| Field | Type | Description |
|-------|------|-------------|
| `auto_discover` | `boolean` | Automatically discover status checks from recent PRs |
| `contexts` | `string[]` | Required status check names |
| `strict` | `boolean` | Require branches to be up to date before merging |

#### Restrictions

**Path**: `defaults.branch_protection.restrictions`

| Field | Type | Description |
|-------|------|-------------|
| `users` | `string[]` | Users who can push to protected branches |
| `teams` | `string[]` | Teams who can push to protected branches |

**Complete Example**:
```yaml
defaults:
  branch_protection:
    patterns: ["main", "release/*"]
    enforce_admins: true
    allow_force_pushes: false
    allow_deletions: false
    required_conversation_resolution: true
    lock_branch: false
    allow_fork_syncing: false
    required_reviews:
      dismiss_stale_reviews: true
      required_approving_review_count: 2
      require_code_owner_reviews: true
      require_last_push_approval: false
    required_status_checks:
      auto_discover: true
      contexts: ["continuous-integration/travis-ci"]
      strict: true
    restrictions:
      users: []
      teams: ["engineering-leads"]
```

### Security Settings

Configures repository security features.

**Path**: `defaults.security`

| Field | Type | Options | Description |
|-------|------|---------|-------------|
| `secret_scanning` | `enum` | `enabled`, `disabled` | Enable secret scanning |
| `secret_scanning_push_protection` | `enum` | `enabled`, `disabled`, `auto` | Block pushes containing secrets |
| `dependabot_alerts` | `boolean` | - | Enable Dependabot vulnerability alerts |
| `dependabot_updates` | `boolean` | - | Enable Dependabot version updates |
| `code_scanning_recommended` | `boolean` | - | Enable recommended code scanning |

**Example**:
```yaml
defaults:
  security:
    secret_scanning: enabled
    secret_scanning_push_protection: enabled
    dependabot_alerts: true
    dependabot_updates: true
    code_scanning_recommended: true
```

### Permissions

Manages repository access and team permissions.

**Path**: `defaults.permissions`

| Field | Type | Description |
|-------|------|-------------|
| `remove_individual_collaborators` | `boolean` | Remove direct user access (enforce team-based access) |
| `teams` | `array` | List of teams and their permissions |
| `users` | `array` | Managed direct collaborators and their permissions |

#### Team Configuration

Each team in the `teams` array has:

| Field | Type | Options | Description |
|-------|------|---------|-------------|
| `team` | `string` | - | Team slug or name |
| `permission` | `enum` | `read`, `triage`, `write`, `maintain`, `admin`, `push` | Permission level |

**Permission Levels**:
- `read`: View code, issues, and pull requests
- `triage`: Read + manage issues and pull requests
- `write`: Triage + push to repository
- `maintain`: Write + manage repository settings
- `admin`: Full repository administration
- `push`: Legacy permission (equivalent to write)

**Example**:
```yaml
defaults:
  permissions:
    remove_individual_collaborators: true
    teams:
      - team: "frontend-team"
        permission: write
      - team: "backend-team"
        permission: write
      - team: "devops"
        permission: maintain
      - team: "security"
        permission: admin
    users:
      - user: "release-manager"
        permission: admin
      - user: "ci-service-account"
        permission: read
```

Add the `users` section when specific direct collaborators must keep access. When `remove_individual_collaborators` is `true`, only the listed users will be preserved.

### Archived Repositories

Special handling for archived repositories.

**Path**: `defaults.archived_repos`

| Field | Type | Description |
|-------|------|-------------|
| `admin_team_only` | `boolean` | Ensure only admin teams have access |
| `archive_inactive` | `boolean` | Auto-archive inactive repositories |
| `inactive_days` | `number` | Days of inactivity before archiving |
| `unarchive_active` | `boolean` | Unarchive if activity detected |
| `archive_patterns` | `string[]` | Repository name patterns to archive |
| `keep_active_patterns` | `string[]` | Patterns to never archive |
| `specific_repos` | `string[]` | Specific repositories to archive |

**Example**:
```yaml
defaults:
  archived_repos:
    admin_team_only: true
    archive_inactive: true
    inactive_days: 365
    unarchive_active: false
    archive_patterns: ["*-deprecated", "*-legacy"]
    keep_active_patterns: ["*-template", "*-docs"]
    specific_repos: ["old-project-2019"]
```

### Repository Settings

Validate and enforce repository-level options such as feature toggles, visibility, and workflow helpers.

**Path**: `defaults.repository_settings`

#### Feature Toggles (`defaults.repository_settings.features`)

| Field | Type | Description |
|-------|------|-------------|
| `has_issues` | `boolean` | Enable GitHub Issues |
| `has_projects` | `boolean` | Enable classic Projects (deprecated in some plans) |
| `has_wiki` | `boolean` | Enable the repository wiki |
| `has_discussions` | `boolean` | Enable GitHub Discussions |
| `has_pages` | `boolean` | Enable GitHub Pages |

#### Visibility Controls (`defaults.repository_settings.visibility`)

| Field | Type | Description |
|-------|------|-------------|
| `allow_public` | `boolean` | Permit repositories to remain public |
| `enforce_private` | `boolean` | Force repositories to be private (takes precedence over `allow_public`) |

#### General Options (`defaults.repository_settings.general`)

| Field | Type | Description |
|-------|------|-------------|
| `allow_auto_merge` | `boolean` | Allow pull requests to auto-merge when checks succeed |
| `delete_branch_on_merge` | `boolean` | Delete head branches automatically after merging |
| `allow_update_branch` | `boolean` | Allow maintainers to update pull request branches |
| `use_squash_pr_title_as_default` | `boolean` | Use the pull request title as the default squash commit message |
| `allow_merge_commit` | `boolean` | Allow merge commits |
| `allow_squash_merge` | `boolean` | Allow squash merging |
| `allow_rebase_merge` | `boolean` | Allow rebase merging |

#### Template Requirements (`defaults.repository_settings.templates`)

| Field | Type | Description |
|-------|------|-------------|
| `require_issue_templates` | `boolean` | Require an issue template directory or file to be present |
| `require_pr_template` | `boolean` | Require a pull request template file to be present |

> ℹ️ Template checks verify the existence of common template paths (e.g. `.github/ISSUE_TEMPLATE/`, `.github/pull_request_template.md`). They surface remediation guidance but do not create templates automatically.

**Example**:
```yaml
defaults:
  repository_settings:
    features:
      has_issues: true
      has_projects: false
      has_wiki: false
      has_discussions: false
      has_pages: false
    visibility:
      allow_public: false
      enforce_private: true
    general:
      allow_auto_merge: true
      delete_branch_on_merge: true
      allow_update_branch: true
      use_squash_pr_title_as_default: true
      allow_merge_commit: false
      allow_squash_merge: true
      allow_rebase_merge: false
    templates:
      require_issue_templates: true
      require_pr_template: true
```

## Rules Section

Rules allow you to apply different settings to specific repositories based on matching criteria.

**Path**: `rules`
**Type**: Array of rule objects

### Rule Structure

Each rule has two parts:

1. **Match Criteria**: Determines which repositories the rule applies to
2. **Apply Settings**: The settings to apply to matched repositories

#### Match Criteria

| Field | Type | Description |
|-------|------|-------------|
| `repositories` | `string[]` | Repository name patterns (supports wildcards) |
| `only_private` | `boolean` | Apply only to private repositories |

#### Apply Settings

The `apply` section can contain any of the settings from the `defaults` section, but with partial overrides allowed.

**Example**:
```yaml
rules:
  # Production repositories need stricter controls
  - match:
      repositories: ["*-prod", "*-production"]
      only_private: true
    apply:
      branch_protection:
        patterns: ["main", "hotfix/*"]
        required_reviews:
          required_approving_review_count: 3
        enforce_admins: true
      merge_methods:
        allow_merge_commit: false
        allow_squash_merge: true
        allow_rebase_merge: false

  # Documentation repositories have relaxed settings
  - match:
      repositories: ["docs-*", "*-website", "*-blog"]
    apply:
      branch_protection:
        patterns: ["main"]
        required_reviews:
          required_approving_review_count: 1
      merge_methods:
        allow_merge_commit: true

  # Archive old projects
  - match:
      repositories: ["legacy-*", "deprecated-*"]
    apply:
      archived_repos:
        admin_team_only: true
```

### Pattern Matching

Repository patterns support wildcards:
- `*` matches any characters
- `?` matches a single character
- Multiple patterns are OR'd together

Examples:
- `frontend-*` matches `frontend-app`, `frontend-lib`
- `*-service` matches `auth-service`, `api-service`
- `app-?` matches `app-1`, `app-2`, but not `app-10`

## Checks Section

Specifies which compliance checks to run.

**Path**: `checks`
**Type**: Object

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | `string[]` | List of checks to enable |

**Available Checks**:
- `org-team-sync`: Synchronizes organization teams with the desired state
- `repo-merge-strategy`: Validates merge button settings
- `repo-access-teams`: Validates team access and removes individual collaborators
- `repo-branch-protection`: Ensures branch protection rules are configured
- `repo-security-controls`: Validates security features are enabled
- `repo-archival-policy`: Validates archived repository settings
- `repository-settings`: Validates repository-level options (features, visibility, templates)

**Example**:
```yaml
checks:
  enabled:
    - org-team-sync
    - repo-merge-strategy
    - repo-access-teams
    - repo-branch-protection
    - repo-security-controls
    - repo-archival-policy
    - repository-settings
```

If not specified, all checks are enabled by default.

> Legacy identifiers (merge-methods, team-permissions, branch-protection,
> security-scanning, archived-repos, team-sync) are still accepted and
> automatically mapped to the new names.

## Complete Configuration Example

Here's a comprehensive example showing all features:

```yaml
version: 1
organization: "my-company"

# Global defaults for all repositories
defaults:
  merge_methods:
    allow_merge_commit: false
    allow_squash_merge: true
    allow_rebase_merge: true

  branch_protection:
    patterns: ["main", "develop"]
    enforce_admins: false
    allow_force_pushes: false
    allow_deletions: false
    required_conversation_resolution: true
    lock_branch: false
    allow_fork_syncing: false
    required_reviews:
      dismiss_stale_reviews: true
      required_approving_review_count: 2
      require_code_owner_reviews: true
      require_last_push_approval: false
    required_status_checks:
      auto_discover: true
      contexts: ["ci/build", "ci/test"]
      strict: true
    restrictions:
      users: []
      teams: ["senior-engineers"]

  security:
    secret_scanning: enabled
    secret_scanning_push_protection: enabled
    dependabot_alerts: true
    dependabot_updates: true
    code_scanning_recommended: true

  repository_settings:
    features:
      has_issues: true
      has_projects: false
      has_wiki: false
      has_discussions: false
      has_pages: false
    visibility:
      allow_public: false
      enforce_private: true
    general:
      allow_auto_merge: true
      delete_branch_on_merge: true
      allow_update_branch: true
      use_squash_pr_title_as_default: true
      allow_merge_commit: false
      allow_squash_merge: true
      allow_rebase_merge: false
    templates:
      require_issue_templates: true
      require_pr_template: true

  permissions:
    remove_individual_collaborators: true
    teams:
      - team: "engineering"
        permission: write
      - team: "qa"
        permission: write
      - team: "devops"
        permission: maintain
      - team: "admins"
        permission: admin
    users:
      - user: "release-manager"
        permission: admin

  archived_repos:
    admin_team_only: true
    archive_inactive: true
    inactive_days: 180
    unarchive_active: false
    archive_patterns: ["*-deprecated"]
    keep_active_patterns: ["*-template"]

# Repository-specific rules
rules:
  # Production repositories
  - match:
      repositories: ["*-prod", "api-gateway", "auth-service"]
      only_private: true
    apply:
      branch_protection:
        patterns: ["main", "release/*", "hotfix/*"]
        enforce_admins: true
        required_reviews:
          required_approving_review_count: 3
          require_last_push_approval: true
      merge_methods:
        allow_merge_commit: false
        allow_rebase_merge: false

  # Public/OSS repositories
  - match:
      repositories: ["sdk-*", "cli-tool", "docs"]
      only_private: false
    apply:
      branch_protection:
        patterns: ["main"]
        enforce_admins: false
        required_reviews:
          required_approving_review_count: 1
      permissions:
        remove_individual_collaborators: false

  # Test/staging environments
  - match:
      repositories: ["*-staging", "*-test", "*-dev"]
    apply:
      branch_protection:
        required_reviews:
          required_approving_review_count: 1
      security:
        code_scanning_recommended: false

# Enabled compliance checks
checks:
  enabled:
<<<<<<< HEAD
    - org-team-sync
    - repo-merge-strategy
    - repo-access-teams
    - repo-branch-protection
    - repo-security-controls
    - repo-archival-policy
=======
    - merge-methods
    - team-permissions
    - branch-protection
    - security-scanning
    - archived-repos
    - repository-settings
>>>>>>> 2644f36 (feat: add repository settings compliance check)
```

## Best Practices

1. **Start with Defaults**: Define sensible defaults that apply to most repositories
2. **Use Rules for Exceptions**: Override defaults only where necessary
3. **Pattern Naming**: Use consistent naming patterns to simplify rule matching
4. **Progressive Enhancement**: Start with basic checks and gradually add more
5. **Test in Dry-Run**: Always test configuration changes in dry-run mode first
6. **Document Decisions**: Comment your configuration to explain why certain settings are chosen

## Validation

The configuration is validated against a strict Zod schema. Common validation errors:

- Missing required `version` field
- Invalid enum values (e.g., wrong permission levels)
- Type mismatches (e.g., string instead of boolean)
- Invalid patterns or team names

Run the CLI in dry-run mode to validate your configuration without making changes.
