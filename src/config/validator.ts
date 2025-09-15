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

  // Check if first argument is a file path (used by main-integrated.ts)
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

    // If called with file path (main-integrated.ts), return object with warnings
    if (!sourcePath && fs.existsSync(yamlContentOrPath)) {
      const warnings = validateDefaults(config);
      return { config, warnings };
    }

    // Otherwise return just the config (main-simple.ts)
    return config;
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.issues.map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join('.') : 'root';
        return `${path}: ${issue.message}`;
      });

      const message = `Configuration validation failed${actualSourcePath ? ` for ${actualSourcePath}` : ''}`;
      throw new ConfigValidationError(message, issues);
    }

    throw error;
  }
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
