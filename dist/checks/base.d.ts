import type { ComplianceConfig } from '../config/types';
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
export declare abstract class BaseCheck implements ComplianceCheck {
    abstract readonly name: string;
    abstract readonly description: string;
    /**
     * Default implementation - runs for all repositories
     */
    shouldRun(_context: CheckContext): boolean;
    /**
     * Perform the compliance check
     */
    abstract check(context: CheckContext): Promise<CheckResult>;
    /**
     * Apply fixes if not in dry-run mode
     * Default implementation calls check() method
     */
    fix(context: CheckContext): Promise<CheckResult>;
    /**
     * Helper to create compliant result
     */
    protected createCompliantResult(message: string, details?: Record<string, unknown>): CheckResult;
    /**
     * Helper to create non-compliant result
     */
    protected createNonCompliantResult(message: string, details?: Record<string, unknown>): CheckResult;
    /**
     * Helper to create fixed result
     */
    protected createFixedResult(message: string, details?: Record<string, unknown>): CheckResult;
    /**
     * Helper to create error result
     */
    protected createErrorResult(message: string, error: string): CheckResult;
    /**
     * Helper to get repository owner and name
     */
    protected getRepoInfo(repository: Repository): {
        owner: string;
        repo: string;
    };
    /**
     * Helper to match repository against patterns
     */
    protected matchesPattern(repoName: string, patterns: string[]): boolean;
    /**
     * Helper to get specific config for repository based on rules
     */
    protected getRepoConfig<T extends keyof ComplianceConfig['defaults']>(context: CheckContext, configKey: T): ComplianceConfig['defaults'][T];
    /**
     * Check if repository matches a rule's criteria
     */
    private matchesRepositoryRule;
}
//# sourceMappingURL=base.d.ts.map