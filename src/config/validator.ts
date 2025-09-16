import * as fs from 'node:fs';
import * as yaml from 'js-yaml';
import { ZodError } from 'zod';
import { type ComplianceConfig, ComplianceConfigSchema } from './schema';

export class ConfigValidationError extends Error {
  public readonly issues: string[];

  constructor(message: string, issues: string[] = []) {
    super(message);
    this.name = 'ConfigValidationError';
    this.issues = issues;
  }
}

export async function validateFromFile(configPath: string): Promise<ComplianceConfig> {
  if (!fs.existsSync(configPath)) {
    throw new ConfigValidationError(`Configuration file not found: ${configPath}`);
  }

  const fileContent = fs.readFileSync(configPath, 'utf8');
  return validateFromString(fileContent, configPath);
}

export async function validateFromString(
  yamlContent: string,
  sourcePath?: string
): Promise<ComplianceConfig>;
export async function validateFromString(
  configPath: string
): Promise<{ config: ComplianceConfig; warnings: string[] }>;
export async function validateFromString(
  yamlContentOrPath: string,
  sourcePath?: string
): Promise<ComplianceConfig | { config: ComplianceConfig; warnings: string[] }> {
  let yamlContent: string;
  let actualSourcePath: string | undefined;

  // Check if first argument is a file path (used by the CLI entry point)
  if (!sourcePath && fs.existsSync(yamlContentOrPath)) {
    yamlContent = fs.readFileSync(yamlContentOrPath, 'utf8');
    actualSourcePath = yamlContentOrPath;
  } else {
    yamlContent = yamlContentOrPath;
    actualSourcePath = sourcePath;
  }

  let parsedYaml: unknown;

  try {
    parsedYaml = yaml.load(yamlContent);
  } catch (error) {
    const message = `Invalid YAML syntax${actualSourcePath ? ` in ${actualSourcePath}` : ''}`;
    throw new ConfigValidationError(message, [
      error instanceof Error ? error.message : String(error),
    ]);
  }

  try {
    const config = ComplianceConfigSchema.parse(parsedYaml);

    // If called with a file path (CLI), return object with warnings
    if (!sourcePath && fs.existsSync(yamlContentOrPath)) {
      const warnings = validateDefaults(config);
      return { config, warnings };
    }

    // Otherwise return just the config for direct string validation
    return config;
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.issues.map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join('.') : 'root';
        let message = issue.message;
        let helpText = '';

        // Add more context for common errors
        const issueWithDetails = issue as unknown as {
          code: string;
          expected?: unknown;
          received?: unknown;
          options?: string[];
          keys?: string[];
        };

        // Provide helpful context based on the field path
        const fieldContext = getFieldContext(path);

        if (issue.code === 'invalid_type') {
          message = `Expected ${issue.expected}, but received ${issueWithDetails.received}`;

          // Add specific help for common fields
          if (path.includes('restrictions')) {
            helpText = `\n    → The 'restrictions' field defines who can push to protected branches.
    → Example: restrictions: { users: [], teams: ['admin-team'] }
    → If no restrictions needed: restrictions: { users: [], teams: [] }`;
          } else if (path.includes('required_reviews')) {
            helpText = `\n    → The 'required_reviews' field configures pull request review requirements.
    → Example: required_reviews: { dismiss_stale_reviews: true, require_code_owner_reviews: true, required_approving_review_count: 2 }`;
          } else if (path.includes('required_status_checks')) {
            helpText = `\n    → The 'required_status_checks' field ensures CI/CD checks pass before merging.
    → Example: required_status_checks: { strict: true, contexts: ['continuous-integration/travis-ci'] }`;
          } else if (path.includes('patterns')) {
            helpText = `\n    → The 'patterns' field specifies which branches to protect.
    → Example: patterns: ['main', 'release/*', 'develop']`;
          }
        } else if (issueWithDetails.code === 'invalid_enum_value' && issueWithDetails.options) {
          message = `Invalid value. Expected one of: ${issueWithDetails.options.join(', ')}`;

          if (path.includes('secret_scanning')) {
            helpText = `\n    → 'secret_scanning': Controls GitHub's secret detection in code
    → 'enabled': Scans for secrets and alerts on findings
    → 'disabled': No secret scanning
    → 'secret_scanning_push_protection' can be 'enabled', 'disabled', or 'auto'`;
          } else if (path.includes('permission')) {
            helpText = `\n    → Team permissions control repository access levels:
    → 'read': View code and clone repository
    → 'triage': Read + manage issues and PRs
    → 'write': Triage + push code changes
    → 'maintain': Write + manage repository settings
    → 'admin': Full control including security settings`;
          }
        } else if (issue.code === 'unrecognized_keys' && issueWithDetails.keys) {
          message = `Unrecognized key(s): ${issueWithDetails.keys.join(', ')}`;
          helpText = `\n    → These fields are not valid in this context. Check for typos or consult the schema.`;
        } else if (issueWithDetails.code === 'invalid_literal' && issueWithDetails.expected) {
          message = `Must be exactly: ${issueWithDetails.expected}`;
          if (path === 'version') {
            helpText = `\n    → The 'version' field must be exactly 1 (current schema version)`;
          }
        }

        // Add field context if available
        if (fieldContext && !helpText) {
          helpText = `\n    → ${fieldContext}`;
        }

        return `${path}: ${message}${helpText}`;
      });

      const message = `Configuration validation failed${actualSourcePath ? ` for ${actualSourcePath}` : ''}`;
      throw new ConfigValidationError(message, issues);
    }

    throw error;
  }
}

// Helper function to provide context for common fields
function getFieldContext(path: string): string {
  const fieldDescriptions: Record<string, string> = {
    'defaults.branch_protection': 'Configures branch protection rules for repositories',
    'defaults.merge_methods': 'Controls which merge strategies are allowed for pull requests',
    'defaults.security': 'Manages security features like secret scanning and vulnerability alerts',
    'defaults.permissions': 'Defines team access levels and collaborator management',
    'defaults.archived_repos': 'Controls access and management of archived repositories',
    'defaults.repository_settings': 'Governs repository features, visibility, and workflow helpers',
    organization: 'The GitHub organization name to apply compliance rules to',
    rules: 'Repository-specific overrides based on patterns or criteria',
    checks: 'List of compliance checks to run (deprecated - checks are determined by defaults)',
    cache: 'Configures caching for GitHub API responses to reduce rate limit usage',
  };

  // Check for exact matches first
  if (fieldDescriptions[path]) {
    return fieldDescriptions[path];
  }

  // Check for partial matches
  for (const [key, description] of Object.entries(fieldDescriptions)) {
    if (path.startsWith(key)) {
      return description;
    }
  }

  return '';
}

export function validateDefaults(config: ComplianceConfig): string[] {
  const warnings: string[] = [];

  // Vérification de cohérence pour merge methods
  if (config.defaults.merge_methods) {
    const mm = config.defaults.merge_methods;
    if (!mm.allow_merge_commit && !mm.allow_squash_merge && !mm.allow_rebase_merge) {
      warnings.push(
        'All merge methods are disabled, repositories will not be able to merge pull requests'
      );
    }
  }

  // Vérification de cohérence pour branch protection
  if (config.defaults.branch_protection) {
    const bp = config.defaults.branch_protection;
    if (bp.patterns.length === 0) {
      warnings.push('Branch protection is configured but no patterns are specified');
    }

    if (
      bp.required_reviews &&
      bp.required_reviews.required_approving_review_count === 0 &&
      !bp.required_reviews.require_code_owner_reviews
    ) {
      warnings.push(
        'Branch protection requires no reviews and no code owner reviews - consider requiring at least one'
      );
    }
  }

  // Vérification pour les permissions d'équipes
  if (config.defaults.permissions?.teams) {
    const adminTeams = config.defaults.permissions.teams.filter((t) => t.permission === 'admin');
    if (adminTeams.length === 0) {
      warnings.push('No admin teams configured - ensure at least one team has admin access');
    }
  }

  return warnings;
}
