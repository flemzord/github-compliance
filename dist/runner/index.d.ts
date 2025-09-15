import type { ComplianceConfig } from '../config/types';
import type { GitHubClient } from '../github/client';
import type { RunnerOptions, RunnerReport } from './types';
export declare class ComplianceRunner {
    private client;
    private config;
    private options;
    constructor(client: GitHubClient, config: ComplianceConfig, options: RunnerOptions);
    /**
     * Run compliance checks on all repositories
     */
    run(): Promise<RunnerReport>;
    /**
     * Get list of repositories to check based on options
     */
    private getRepositoriesToCheck;
    /**
     * Determine which checks to run based on options
     */
    private getChecksToRun;
    /**
     * Run all checks on a single repository
     */
    private checkRepository;
    /**
     * Run a single check on a repository
     */
    private runCheck;
    /**
     * Generate summary report
     */
    private generateReport;
    /**
     * Log summary to console
     */
    private logSummary;
}
export { getAvailableChecks } from './check-registry';
export * from './types';
//# sourceMappingURL=index.d.ts.map