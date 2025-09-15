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

```bash
compliance-cli --config <path> --token <token> [options]
```

| Flag | Description |
|------|-------------|
| `--config`, `-c` | Path to the compliance configuration YAML file (required) |
| `--token`, `-t` | GitHub personal access token (required unless `GITHUB_TOKEN` is set) |
| `--org` | GitHub organization name (falls back to `organization` value in config) |
| `--dry-run`, `-d` | Report issues without applying changes |
| `--repos` | Comma-separated list of repository names to check |
| `--checks` | Comma-separated list of checks to run (`merge-methods`, `branch-protection`, `security-scanning`, `team-permissions`, `archived-repos`) |
| `--include-archived` | Include archived repositories in the run |
| `--format` | Report format (`markdown` or `json`, default `markdown`) |
| `--output`, `-o` | Custom output file path |
| `--verbose`, `-v` | Enable verbose logging |
| `--quiet`, `-q` | Suppress informational logs |

### Examples

```bash
# Dry-run across the entire organization
compliance-cli --config .github/compliance.yml --token $GITHUB_TOKEN --dry-run

# Audit only selected repositories
compliance-cli -c compliance.yml -t ghp_xxx --repos "frontend,backend"

# Run a subset of checks and output JSON
compliance-cli -c compliance.yml -t ghp_xxx --checks "merge-methods,security-scanning" \
  --format json --output compliance-report.json

# Apply fixes (no dry-run) and include archived repositories
compliance-cli -c compliance.yml -t ghp_xxx --include-archived
```

## Configuration

📚 **[Configuration Reference](./docs/configuration-reference.md)** – Full documentation covering every option.

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
    required_pull_request_reviews:
      dismiss_stale_reviews: true
      required_approving_review_count: 2
      require_code_owner_reviews: true
    required_status_checks:
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
    code_scanning: true

  permissions:
    remove_individual_collaborators: true
    teams:
      - team: "admins"
        permission: "admin"
      - team: "engineering"
        permission: "write"

  archived_repos:
    archive_inactive: true
    inactive_days: 365

rules:
  - match:
      repositories: ["*-prod", "*-production"]
      only_private: true
    apply:
      branch_protection:
        patterns: ["main", "release/*"]
        required_pull_request_reviews:
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
```

## Reports

Two output formats are available:

- **Markdown** – Human-readable summary ideal for sharing with stakeholders
- **JSON** – Structured data for dashboards or additional automation

By default the CLI writes `compliance-report.md` (or `.json` when `--format json` is used). Supply `--output` to override the file name.

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

For more details see [DEVELOPMENT.md](./DEVELOPMENT.md).

---

Made with ❤️ for better GitHub repository governance