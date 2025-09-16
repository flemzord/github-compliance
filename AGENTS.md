# Repository Guidelines

## Project Structure & Module Organization
Source code lives under `src/`, grouped by domain (`checks/`, `config/`, `github/`, `logging/`, `reporting/`, `runner/`). Shared test fixtures and mocks sit in `src/__mocks__/` while unit tests mirror the structure within `src/**/__tests__/`. Generated bundles populate `dist/`; documentation lives in `docs/` and reference configs in the repo root.

## Build, Test, and Development Commands
- `npm install` — install runtime and dev dependencies.
- `npm run build` — compile TypeScript to `dist/` via `tsc` (also runs on `npm prepare`).
- `npm run pre-commit` — aggregate lint + coverage gate; must pass before any commit.
- `npm run cli -- --config <file> ...` — execute the CLI directly in TypeScript.
- `npm test` / `npm run test:coverage` — run Jest suites, the latter producing coverage reports under `coverage/`.
- `npm run dev` — start TSX watch mode for rapid CLI iteration.
- `npm run lint` — run Biome checks, Knip unused-code scan, and strict type-checking.

## Coding Style & Naming Conventions
Use TypeScript with 2-space indentation and prefer ES modules. Follow descriptive camelCase for variables/functions and PascalCase for classes (e.g., `ProgressLogger`). Keep config schemas and CLI flags aligned with the naming documented in `README.md`. Formatting and linting are enforced via Biome (`biome check`) and TypeScript’s compiler options; run `npm run lint:fix` to auto-fix supported issues.

## Testing Guidelines
Jest with `ts-jest` powers the test suite. Place unit tests in co-located `__tests__` folders and name them `<module>.test.ts`: e.g., `logging/__tests__/progress-logger.test.ts`. Maintain or exceed the global coverage thresholds (70%+ for statements, branches, functions, and lines); `npm run test:coverage` is the definitive gate. Mock external APIs using the stubs in `src/__mocks__`.

## Commit & Pull Request Guidelines
Follow conventional-style commit prefixes (`feat:`, `fix:`, `test:`, `docs:`). Keep commits focused and include relevant test updates. For PRs, provide a concise summary, link related issues, list validation steps (e.g., `npm run test:coverage`), and attach artefacts like `coverage/lcov-report/index.html` screenshots when relevant. Ensure CI can run without additional secrets beyond a GitHub token provided via environment variables.

Before staging changes, run `npm run pre-commit` and resolve any lint or test failures; commits should only be created once this command exits successfully.

## Security & Configuration Tips
Store organization policies in YAML files shaped by `compliance-schema.json`. Never commit actual tokens or organization-specific secrets; use placeholders in examples. When testing against live repositories, export `GITHUB_TOKEN` in your shell or pass `--token` explicitly, but avoid hardcoding it.


## CLI Usage

The CLI now uses subcommands for different operations:

### Run Command
Executes compliance checks on repositories:
```bash
# Basic usage
github-compliance-cli run --config compliance.yml --token ghp_xxx

# Dry-run mode (no changes)
github-compliance-cli run --config compliance.yml --token ghp_xxx --dry-run

# Check specific repositories
github-compliance-cli run -c config.yml -t ghp_xxx --repos "repo1,repo2"

# Run specific checks only
github-compliance-cli run -c config.yml -t ghp_xxx --checks "merge-methods,security-scanning"

# Generate JSON report
github-compliance-cli run -c config.yml -t ghp_xxx --format json --output report.json

# Use different output modes
github-compliance-cli run -c config.yml -t ghp_xxx --mode detailed  # or compact, json
```

### Validate Command
Validates a compliance configuration file:
```bash
# Basic validation
github-compliance-cli validate --config compliance.yml

# Verbose validation with details
github-compliance-cli validate --config compliance.yml --verbose

# Quiet mode (errors only)
github-compliance-cli validate --config compliance.yml --quiet
```

## Development Commands

### Essential Development Workflow
```bash
# Complete lint check (Style + Types + Unused code)
npm run lint

# Auto-fix lint issues
npm run lint:fix

# Run all tests
npm test

# Run tests with coverage (80% threshold required)
npm run test:coverage

# Build for production
npm run build

# Development mode
npm run dev
```

### Testing Commands
```bash
# Run specific test file
npx jest src/path/to/test.test.ts

# Run tests in watch mode
npm run test:watch

# Run tests matching pattern
npx jest --testNamePattern="should handle"
```

### Individual Lint Components
```bash
# Style and syntax (BiomeJS)
npm run lint:biome

# Dead code detection (Knip)
npm run lint:knip

# TypeScript type checking
npm run lint:types
```

## Code Architecture

### High-Level System Flow
1. **CLI Entry Point** (`src/cli.ts`) - Commander-based CLI with subcommands (run, validate)
2. **Configuration System** (`src/config/`) - YAML validation using Zod schemas
3. **Compliance Runner** (`src/runner/`) - Orchestrates repository discovery and check execution
4. **Check System** (`src/checks/`) - Pluggable compliance checks with base class
5. **GitHub Client** (`src/github/`) - Octokit wrapper with throttling and error handling
6. **Reporting** (`src/reporting/`) - JSON and Markdown report generation

### Configuration Architecture
- **Schema Definition**: `src/config/schema.ts` - Zod schemas for YAML validation
- **Type System**: `src/config/types.ts` - TypeScript interfaces for configuration
- **Rule Engine**: Supports repository-specific overrides via `match` criteria and `apply` blocks

### Check System Architecture
- **Base Class**: `src/checks/base.ts` - Abstract `BaseCheck` with common functionality
- **Check Interface**: `ComplianceCheck` interface defines `shouldRun()`, `check()`, `fix()` methods
- **Available Checks**:
  - `merge-methods` - Repository merge button settings
  - `branch-protection` - Protected branch rules
  - `team-permissions` - Team access and individual collaborator removal
  - `security-scanning` - Dependabot, secret scanning, code scanning
  - `archived-repos` - Admin team access validation for archived repositories
- **Registry**: `src/runner/check-registry.ts` maps check names to implementations

### GitHub Client Architecture
- **Throttling**: Built-in Octokit throttling plugin for API rate limiting
- **Error Handling**: Structured error handling with context
- **Repository Discovery**: Supports both organization and user repositories
- **Permission Checking**: Validates repository admin permissions before fixes

### Testing Architecture
- **Coverage Requirements**: 80% minimum across all metrics (statements, branches, functions, lines)
- **Mock Strategy**: Comprehensive mocks in `src/__mocks__/` for external dependencies
- **Test Structure**: `__tests__/` directories alongside source files
- **Integration Testing**: `src/main.test.ts` for full workflow validation

## Key Implementation Patterns

### Configuration Rule Processing
Configuration supports repository-specific rules using glob patterns:
```yaml
rules:
  - match:
      repositories: ["*-prod", "*-staging"]
      only_private: true
    apply:
      branch_protection:
        patterns: ["main", "release/*"]
```

### Check Execution Flow
1. `shouldRun(context)` - Determines if check applies to repository
2. `check(context)` - Performs compliance validation
3. `fix(context)` - Applies corrections (if not dry-run)

### Error Handling Strategy
- **Graceful Degradation**: Individual check failures don't halt entire run
- **Detailed Reporting**: Error messages include repository context and suggested actions
- **Logging**: Centralized logging module provides structured output for CLI and tests

### Type Safety Approach
- **Strict TypeScript**: `noEmit` type checking in lint pipeline
- **Zod Validation**: Runtime schema validation for YAML configuration
- **Interface Segregation**: Separate interfaces for internal types vs GitHub API types

## Development Notes

- **Linting Philosophy**: Three-tier approach (Style/Syntax via BiomeJS, Dead Code via Knip, Types via TypeScript)
- **Mock Requirements**: External dependencies (Octokit, logging layer) require comprehensive mocking
- **Coverage Strategy**: Focus on business logic coverage, not just line coverage
- **Build Process**: TypeScript compiler builds the library and CLI into `dist/`
- **Node Version**: Requires Node.js 20+ (specified in package.json engines)

## Testing Considerations

- Use `biome-ignore lint/suspicious/noExplicitAny` comments when testing private methods with `(instance as any)`
- Mock GitHub API responses should match actual API structure from Octokit
- Configuration test scenarios should cover both valid and invalid YAML structures
- Integration tests should exercise the CLI end-to-end, including argument parsing and reporting
