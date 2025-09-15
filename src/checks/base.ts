import type { ComplianceConfig, MatchCriteria } from '../config/types';
import type { GitHubClient, Repository } from '../github';

export interface CheckResult {
  compliant: boolean;
  message: string;
  details?: Record<string, unknown>;
  fixed?: boolean;
  error?: string;
}

export interface CheckContext {
  client: GitHubClient;
  config: ComplianceConfig;
  dryRun: boolean;
  repository: Repository;
}

export interface ComplianceCheck {
  readonly name: string;
  readonly description: string;

  /**
   * Check if this check should run for the given repository
   */
  shouldRun(context: CheckContext): boolean;

  /**
   * Perform the compliance check
   */
  check(context: CheckContext): Promise<CheckResult>;

  /**
   * Apply fixes if not in dry-run mode
   */
  fix?(context: CheckContext): Promise<CheckResult>;
}

export abstract class BaseCheck implements ComplianceCheck {
  abstract readonly name: string;
  abstract readonly description: string;

  /**
   * Default implementation - runs for all repositories
   */
  shouldRun(_context: CheckContext): boolean {
    return true;
  }

  /**
   * Perform the compliance check
   */
  abstract check(context: CheckContext): Promise<CheckResult>;

  /**
   * Apply fixes if not in dry-run mode
   * Default implementation calls check() method
   */
  async fix(context: CheckContext): Promise<CheckResult> {
    if (context.dryRun) {
      return this.check(context);
    }

    // Override in subclasses to implement actual fixes
    return this.check(context);
  }

  /**
   * Helper to create compliant result
   */
  protected createCompliantResult(message: string, details?: Record<string, unknown>): CheckResult {
    const result: CheckResult = {
      compliant: true,
      message,
    };
    if (details !== undefined) {
      result.details = details;
    }
    return result;
  }

  /**
   * Helper to create non-compliant result
   */
  protected createNonCompliantResult(
    message: string,
    details?: Record<string, unknown>
  ): CheckResult {
    const result: CheckResult = {
      compliant: false,
      message,
    };
    if (details !== undefined) {
      result.details = details;
    }
    return result;
  }

  /**
   * Helper to create fixed result
   */
  protected createFixedResult(message: string, details?: Record<string, unknown>): CheckResult {
    const result: CheckResult = {
      compliant: true,
      message,
      fixed: true,
    };
    if (details !== undefined) {
      result.details = details;
    }
    return result;
  }

  /**
   * Helper to create error result
   */
  protected createErrorResult(message: string, error: string): CheckResult {
    return {
      compliant: false,
      message,
      error,
    };
  }

  /**
   * Helper to get repository owner and name
   */
  protected getRepoInfo(repository: Repository): { owner: string; repo: string } {
    const [owner, repo] = repository.full_name.split('/');
    return { owner, repo };
  }

  /**
   * Helper to match repository against patterns
   */
  protected matchesPattern(repoName: string, patterns: string[]): boolean {
    return patterns.some((pattern) => {
      // Simple glob matching - convert * to .* and ? to .
      const regex = new RegExp(`^${pattern.replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i');
      return regex.test(repoName);
    });
  }

  /**
   * Helper to get specific config for repository based on rules
   */
  protected getRepoConfig<T extends keyof ComplianceConfig['defaults']>(
    context: CheckContext,
    configKey: T
  ): ComplianceConfig['defaults'][T] {
    const { config, repository } = context;
    let repoConfig = config.defaults[configKey];

    // Apply rules that match this repository
    if (config.rules) {
      for (const rule of config.rules) {
        const matches = this.matchesRepositoryRule(repository, rule.match);
        if (matches && rule.apply[configKey]) {
          // Merge rule config with defaults
          repoConfig = { ...repoConfig, ...rule.apply[configKey] } as typeof repoConfig;
        }
      }
    }

    return repoConfig;
  }

  /**
   * Check if repository matches a rule's criteria
   */
  private matchesRepositoryRule(repository: Repository, match: MatchCriteria): boolean {
    // Check repository patterns
    if (match.repositories) {
      const matches = this.matchesPattern(repository.name, match.repositories);
      if (!matches) return false;
    }

    // Check privacy requirement
    if (match.only_private !== undefined) {
      if (match.only_private && !repository.private) return false;
      if (!match.only_private && repository.private) return false;
    }

    return true;
  }
}
