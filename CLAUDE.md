# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
1. **Entry Point** (`src/main.ts`) - GitHub Action entry, parses inputs, validates config
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
- **Integration Testing**: `src/main-integrated.test.ts` for full workflow validation

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
- **GitHub Actions Integration**: Uses `@actions/core` for structured logging

### Type Safety Approach
- **Strict TypeScript**: `noEmit` type checking in lint pipeline
- **Zod Validation**: Runtime schema validation for YAML configuration
- **Interface Segregation**: Separate interfaces for internal types vs GitHub API types

## Development Notes

- **Linting Philosophy**: Three-tier approach (Style/Syntax via BiomeJS, Dead Code via Knip, Types via TypeScript)
- **Mock Requirements**: External dependencies (Octokit, @actions/core) require comprehensive mocking
- **Coverage Strategy**: Focus on business logic coverage, not just line coverage
- **Build Process**: Uses `@vercel/ncc` to create single-file distributables for GitHub Actions
- **Node Version**: Requires Node.js 20+ (specified in package.json engines)

## Testing Considerations

- Use `biome-ignore lint/suspicious/noExplicitAny` comments when testing private methods with `(instance as any)`
- Mock GitHub API responses should match actual API structure from Octokit
- Configuration test scenarios should cover both valid and invalid YAML structures
- Integration tests should verify the complete GitHub Action input/output flow