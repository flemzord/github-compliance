# GitHub Compliance Action

A powerful GitHub Action that automatically enforces repository compliance policies across your GitHub organization. Monitor, report, and optionally fix non-compliant repository settings with customizable rules and comprehensive reporting.

## Features

- 🔍 **Automated Compliance Scanning** - Continuously monitor repositories for compliance violations
- 🔧 **Auto-Fix Capabilities** - Automatically remediate non-compliant settings (with dry-run mode)
- 📊 **Comprehensive Reporting** - Generate detailed JSON and Markdown reports
- 🎯 **Flexible Rule Configuration** - Apply different rules to different repositories using glob patterns
- 🚀 **High Performance** - Built-in API throttling and efficient batch processing
- ✅ **Extensive Test Coverage** - 98%+ code coverage ensuring reliability

## Quick Start

```yaml
name: Repository Compliance Check
on:
  schedule:
    - cron: '0 0 * * *'  # Daily at midnight
  workflow_dispatch:

jobs:
  compliance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Compliance Checks
        uses: flemzord/github-compliance-action@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          config-file: .github/compliance-config.yml
          dry-run: true  # Set to false to enable auto-fix
```

## Configuration

📚 **[View Complete Configuration Reference](./docs/configuration-reference.md)** - Detailed documentation of all available options with examples.

Create a `.github/compliance-config.yml` file in your repository:

```yaml
# Compliance configuration version
version: 1

# Default settings applied to all repositories
defaults:
  # Merge methods configuration
  merge_methods:
    allow_merge_commit: false
    allow_squash_merge: true
    allow_rebase_merge: false

  # Branch protection rules
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

  # Security settings
  security:
    secret_scanning: "enabled"
    secret_scanning_push_protection: "enabled"
    dependabot_alerts: true
    code_scanning: true

  # Team permissions
  permissions:
    remove_individual_collaborators: true
    teams:
      - team: "admins"
        permission: "admin"
      - team: "engineering"
        permission: "write"

  # Archived repository settings
  archived_repos:
    archive_inactive: true
    inactive_days: 365

# Repository-specific rules (optional)
rules:
  # Private production repositories get stricter settings
  - match:
      repositories: ["*-prod", "*-production"]
      only_private: true
    apply:
      branch_protection:
        patterns: ["main", "release/*"]
        required_pull_request_reviews:
          required_approving_review_count: 3
        enforce_admins: true

  # Documentation repositories have different merge methods
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

## Available Compliance Checks

### Branch Protection
Ensures critical branches have appropriate protection rules:
- Required pull request reviews
- Dismiss stale reviews
- Require code owner reviews
- Enforce restrictions for administrators
- Require branches to be up to date

### Security Scanning
Validates security features are enabled:
- Dependabot alerts and updates
- Secret scanning
- Secret scanning push protection
- Code scanning (CodeQL)

### Merge Methods
Controls allowed merge strategies:
- Merge commits
- Squash merging
- Rebase merging

### Team Permissions
Manages repository access:
- Enforce team-based access (remove individual collaborators)
- Validate team permissions levels
- Ensure proper access control

### Archived Repositories
Special handling for archived repositories:
- Validate admin team access
- Report on archived repository compliance

## Action Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `github-token` | GitHub token with repo and admin:org permissions | Yes | - |
| `config-file` | Path to the compliance configuration file | No | `.github/compliance-config.yml` |
| `dry-run` | Run in dry-run mode (report only, no fixes) | No | `true` |
| `output-dir` | Directory for compliance reports | No | `compliance-reports` |

## Action Outputs

| Output | Description |
|--------|-------------|
| `compliance-report` | Path to the JSON compliance report |
| `markdown-report` | Path to the Markdown compliance report |
| `total-repositories` | Total number of repositories checked |
| `compliant-count` | Number of fully compliant repositories |
| `non-compliant-count` | Number of non-compliant repositories |
| `fixed-count` | Number of repositories with fixes applied |

## Reports

The action generates two types of reports:

### JSON Report
Detailed machine-readable report with:
- Complete compliance status for each repository
- Specific violations and fixes applied
- Error details and warnings

### Markdown Report
Human-readable summary with:
- Executive summary
- Compliance statistics
- Detailed findings by check type
- Recommended actions

## Permissions Required

The GitHub token needs the following permissions:

- `repo` - Full control of private repositories
- `admin:org` - Read and write org and team membership
- `read:org` - Read org and team membership (minimum for dry-run)

## Development

### Prerequisites
- Node.js 20+
- npm 10+

### Setup
```bash
# Install dependencies
npm install

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Lint code
npm run lint

# Build for production
npm run build
```

### Testing
```bash
# Run all tests
npm test

# Run specific test file
npx jest src/checks/__tests__/branch-protection.test.ts

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### Code Quality
- **Linting**: BiomeJS for style, Knip for dead code, TypeScript for type checking
- **Testing**: Jest with 80% minimum coverage requirement
- **Type Safety**: Strict TypeScript with Zod runtime validation

## Architecture

```
src/
├── main.ts                 # Action entry point
├── config/                 # Configuration parsing and validation
│   ├── schema.ts          # Zod schemas
│   ├── types.ts           # TypeScript interfaces
│   └── validator.ts       # YAML validation
├── checks/                 # Compliance check implementations
│   ├── base.ts            # Base check class
│   ├── branch-protection.ts
│   ├── security-scanning.ts
│   ├── merge-methods.ts
│   ├── team-permissions.ts
│   └── archived-repos.ts
├── runner/                 # Check orchestration
│   ├── runner.ts          # Main runner logic
│   └── check-registry.ts  # Check registration
├── github/                 # GitHub API client
│   └── client.ts          # Octokit wrapper with throttling
└── reporting/             # Report generation
    ├── json-reporter.ts
    └── markdown-reporter.ts
```

## Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Write tests for your changes
4. Ensure all tests pass (`npm test`)
5. Ensure linting passes (`npm run lint`)
6. Commit your changes
7. Push to the branch
8. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) file for details

## Support

- **Issues**: [GitHub Issues](https://github.com/flemzord/github-compliance-action/issues)
- **Discussions**: [GitHub Discussions](https://github.com/flemzord/github-compliance-action/discussions)

## Roadmap

- [ ] Support for GitHub Enterprise Server
- [ ] Custom check plugins
- [ ] Webhook notifications
- [ ] Compliance dashboard
- [ ] Historical compliance tracking
- [ ] SARIF output format
- [ ] Integration with policy-as-code tools

## Acknowledgments

Built with:
- [Octokit](https://github.com/octokit/octokit.js) - GitHub API client
- [Zod](https://github.com/colinhacks/zod) - TypeScript-first schema validation
- [BiomeJS](https://biomejs.dev/) - Fast formatter and linter
- [Jest](https://jestjs.io/) - Testing framework
- [@vercel/ncc](https://github.com/vercel/ncc) - Node.js compiler

---

Made with ❤️ for better GitHub repository governance