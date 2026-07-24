# GitHub Compliance CLI

Command-line tool to audit and enforce repository compliance across your GitHub organization. Run targeted or organization-wide checks, generate detailed reports, and optionally remediate issues in a single workflow.

## Features

- 🔍 **Automated Compliance Scanning** – Evaluate repositories against a shared YAML configuration
- 🔧 **Auto-Fix Capabilities** – Apply fixes when run without `--dry-run`
- 📊 **Comprehensive Reporting** – Output Markdown or JSON reports ready for auditing
- 🎯 **Flexible Rules** – Target specific repositories or checks with simple flags
- 🚀 **High Performance** – Built-in API throttling and concurrent execution

## Installation

### Global (from npm)

```bash
npm install -g @flemzord/github-compliance
```

> ℹ️ The package is being prepared for release. Until it is published you can run the CLI locally as shown below.

### From Source

```bash
npm install
npm run build
# optional: make the CLI globally available from this checkout
npm link
```

Or run without building by using the TypeScript entry point:

```bash
npm run cli -- --config compliance.yml --token ghp_xxx --dry-run
```

## Usage

The CLI provides two main commands:

### `run` - Execute compliance checks

```bash
github-compliance-cli run --config <path> --token <token> [options]
```

| Flag | Description |
|------|-------------|
| `--config`, `-c` | Path to the compliance configuration YAML file (required) |
| `--token`, `-t` | GitHub personal access token (required unless `GITHUB_TOKEN` is set) |
| `--org` | GitHub organization name (falls back to `organization` value in config) |
| `--dry-run`, `-d` | Report issues without applying changes |
| `--fail-on-changes` | With `--dry-run`, exit with code 2 when changes are proposed |
| `--repos` | Comma-separated list of repository names to check |
| `--checks` | Comma-separated list of checks to run |
| `--include-archived` | Include archived repositories in the run |
| `--format` | Report format (`markdown` or `json`, default `markdown`) |
| `--output`, `-o` | Custom output file path |
| `--mode` | Output mode (`compact`, `detailed`, or `json`, default `compact`) |
| `--verbose`, `-v` | Enable verbose logging |
| `--quiet`, `-q` | Suppress informational logs |

### `validate` - Validate configuration file

```bash
github-compliance-cli validate --config <path> [options]
```

| Flag | Description |
|------|-------------|
| `--config`, `-c` | Path to the compliance configuration YAML file (required) |
| `--verbose`, `-v` | Show detailed configuration summary |
| `--quiet`, `-q` | Show only errors |

### Examples

```bash
# Validate configuration file
github-compliance-cli validate --config compliance.yml

# Dry-run across the entire organization
github-compliance-cli run --config .github/compliance.yml --token $GITHUB_TOKEN --dry-run

# CI audit: distinguish proposed changes from execution errors
github-compliance-cli run --config .github/compliance.yml --token $GITHUB_TOKEN \
  --dry-run --fail-on-changes

# Audit only selected repositories
github-compliance-cli run -c compliance.yml -t ghp_xxx --repos "frontend,backend"

# Run specific checks with JSON output
github-compliance-cli run -c compliance.yml -t ghp_xxx \
  --checks "repo-merge-strategy,repo-security-controls" \
  --format json --output compliance-report.json

# Apply fixes (no dry-run) and include archived repositories
github-compliance-cli run -c compliance.yml -t ghp_xxx --include-archived
```

## Available Checks

The CLI can perform the following compliance checks:

| Check ID | Description |
|----------|-------------|
| `org-team-sync` | Synchronizes organization teams once per CLI run |
| `repo-merge-strategy` | Validates allowed merge strategies (merge commit, squash, rebase) |
| `repo-branch-protection` | Ensures branch protection rules are properly configured |
| `repo-access-teams` | Manages repository team access and individual collaborators |
| `repo-security-controls` | Verifies security features (secret scanning, Dependabot, code scanning) |
| `repo-archival-policy` | Controls access to archived repositories |
| `repo-settings` | Enforces repository feature toggles, visibility, and collaboration templates |
| `repo-rulesets-observe` | Observes applicable rulesets and reports overlaps with legacy branch protections |

Legacy identifiers (merge-methods, team-permissions, branch-protection, security-scanning, archived-repos, team-sync, repository-settings) are still accepted and automatically mapped to the new names.

Each check can be configured in the `defaults` section of your configuration file and selectively applied using the `--checks` flag.

## Configuration

📚 **[Configuration Reference](./docs/configuration-reference.md)** – Full documentation covering every option.

### IDE Integration with JSON Schema

This project provides a JSON Schema for the compliance configuration file. This enables:
- ✨ **Autocompletion** in your IDE
- ✅ **Real-time validation** as you type
- 📝 **Inline documentation** for all fields

#### VSCode / Other YAML-aware editors

Add this comment at the top of your YAML file:

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/flemzord/github-compliance/main/compliance-schema.json
```

Or for local development:

```yaml
# yaml-language-server: $schema=../path/to/compliance-schema.json
```

#### IntelliJ IDEA / WebStorm

1. Go to **Settings → Languages & Frameworks → Schemas and DTDs → JSON Schema Mappings**
2. Add a new mapping:
   - Name: `GitHub Compliance`
   - Schema file: Point to `compliance-schema.json`
   - File pattern: `*compliance*.yml` or `*compliance*.yaml`

Create a configuration file (for example `compliance.yml`):

```yaml
version: 1

defaults:
  merge_methods:
    allow_merge_commit: false
    allow_squash_merge: true
    allow_rebase_merge: false

  branch_protection:
    patterns: ["main", "master", "release/*"]
    enforce_admins: true
    required_reviews:
      dismiss_stale_reviews: true
      required_approving_review_count: 2
      require_code_owner_reviews: true
      require_last_push_approval: false
    required_status_checks:
      auto_discover: false
      strict: true
      contexts: ["ci/tests", "ci/lint"]
    restrictions:
      users: []
      teams: ["maintainers"]
    allow_force_pushes: false
    allow_deletions: false
    required_conversation_resolution: true

  security:
    secret_scanning: "enabled"
    secret_scanning_push_protection: "enabled"
    dependabot_alerts: true
    dependabot_updates: true
    code_scanning_recommended: true

  permissions:
    remove_individual_collaborators: true
    manage_teams: true
    teams:
      - team: "admins"
        permission: "admin"
      - team: "engineering"
        permission: "write"

  archived_repos:
    admin_team_only: false
    archive_inactive: true
    inactive_days: 365

rules:
  - match:
      repositories: ["*-prod", "*-production"]
      only_private: true
    apply:
      branch_protection:
        patterns: ["main", "release/*"]
        required_reviews:
          required_approving_review_count: 3
        enforce_admins: true

  - match:
      repositories: ["docs-*", "*-website"]
    apply:
      merge_methods:
        allow_merge_commit: true
      permissions:
        teams:
          - team: "docs-team"
            permission: "maintain"

teams:
  dynamic_rules:
    - name: "all"
      type: all_org_members
      membership_authoritative: false
      preserve_maintainers: true
      include_bots: false

# Observe GitHub rulesets without changing them
rulesets:
  mode: observe
```

Repository team access and individual collaborators are independent. Set
`remove_individual_collaborators: true` without `teams` to manage only direct users. Team
permissions are managed when `manage_teams: true`, or for backward compatibility when a non-empty
`teams` list is provided without `manage_teams`. An omitted `teams` field or `teams: []` without the
explicit opt-in does not remove team access. With `manage_teams: true`, `teams` is required and an
empty list explicitly removes all direct repository team permissions.

Team permissions inherited from Organization Roles (`access_source: organization`) are always
ignored. Only direct repository grants (`access_source: repository`, or responses without the field
for backward compatibility) are managed.

## Reports

Two output formats are available:

- **Markdown** – Human-readable summary ideal for sharing with stakeholders
- **JSON** – Structured data for dashboards or additional automation

By default the CLI writes `compliance-report.md` (or `.json` when `--format json` is used). Supply `--output` to override the file name.

Reports separate configuration validity, execution success, and organization compliance. They also
include organization-scoped checks and an action summary grouped by category with `proposed`,
`applied`, and `ignored` counts. In particular, inherited Organization Role permissions appear as
ignored actions rather than removals.

For CI, combine `--dry-run` with `--fail-on-changes`. In this strict mode, exit code `0` means the run
succeeded with no proposed changes, `2` means the run succeeded but proposed changes, and `1` means
configuration, execution, or GitHub API failure. Without `--fail-on-changes`, a successful dry-run
returns `0` even when it reports proposed changes.

## Development

All development commands work locally:

```bash
# Install dependencies
npm install

# Run tests
npm test

# Build the CLI
npm run build

# Execute the CLI from source
npm run cli -- --config compliance.yml --token ghp_xxx
```

### Adding a New Compliance Check

To add a new compliance check to the project, follow these steps:

1. **Create the check class** in `src/checks/`:
   ```typescript
   // src/checks/your-check.ts
   import { BaseCheck, type CheckContext, type CheckResult } from './base';

   export class YourCheck extends BaseCheck {
     readonly name = 'your-check-name';
     readonly description = 'Description of what your check validates';

     shouldRun(context: CheckContext): boolean {
       // Determine if this check should run for the repository
       const config = this.getRepoConfig(context, 'your_config_key');
       return config !== undefined;
     }

     async check(context: CheckContext): Promise<CheckResult> {
       // Implement your validation logic
       const { repository } = context;
       const config = this.getRepoConfig(context, 'your_config_key');

       // Perform checks and return result
       if (/* check passes */) {
         return this.createCompliantResult('Check passed successfully');
       }

       return this.createNonCompliantResult('Check failed: reason');
     }

     async fix(context: CheckContext): Promise<CheckResult> {
       // Optional: Implement auto-fix logic
       if (context.dryRun) {
         return this.check(context);
       }

       // Apply fixes using context.client
       // Return result with fixed: true if successful
     }
   }
   ```

2. **Register the check** in `src/runner/check-registry.ts`:
   ```typescript
   import { YourCheck } from '../checks/your-check';

   const checkRegistry: CheckRegistry = {
     // ... existing checks
     'your-check-name': YourCheck,
   };
   ```

3. **Define configuration types** in `src/config/types.ts`:
   ```typescript
   export interface YourCheckConfig {
     // Define your configuration structure
   }

   export interface ComplianceDefaults {
     // ... existing configs
     your_config_key?: YourCheckConfig;
   }
   ```

4. **Update the JSON Schema** in `compliance-schema.json`:
   - Add your check configuration to the `defaults` properties
   - Ensure proper validation rules are defined

5. **Add tests** for your check in `src/checks/__tests__/your-check.test.ts`:
   ```typescript
   import { YourCheck } from '../your-check';

   describe('YourCheck', () => {
     it('should detect non-compliance', async () => {
       // Test non-compliant scenarios
     });

     it('should pass for compliant repositories', async () => {
       // Test compliant scenarios
     });

     it('should fix issues when not in dry-run mode', async () => {
       // Test fix functionality if implemented
     });
   });
   ```

6. **Update documentation**:
   - Add your check to the "Available Checks" table in this README
   - Include configuration examples in the sample YAML

For more details see [DEVELOPMENT.md](./DEVELOPMENT.md).

---

Made with ❤️ for better GitHub repository governance
