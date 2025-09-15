import * as core from '@actions/core';
import type { CheckContext, ComplianceCheck } from '../checks/base';
import type { ComplianceConfig } from '../config/types';
import type { GitHubClient } from '../github/client';
import type { Repository } from '../github/types';
import { getAvailableChecks, getCheck } from './check-registry';
import type { CheckExecution, RepositoryReport, RunnerOptions, RunnerReport } from './types';

export class ComplianceRunner {
  private client: GitHubClient;
  private config: ComplianceConfig;
  private options: RunnerOptions;

  constructor(client: GitHubClient, config: ComplianceConfig, options: RunnerOptions) {
    this.client = client;
    this.config = config;
    this.options = options;
  }

  /**
   * Run compliance checks on all repositories
   */
  async run(): Promise<RunnerReport> {
    const startTime = Date.now();
    core.info('🚀 Starting compliance checks...');

    // Get repositories to check
    const repositories = await this.getRepositoriesToCheck();
    core.info(`Found ${repositories.length} repositories to check`);

    // Determine which checks to run
    const checksToRun = this.getChecksToRun();
    core.info(`Will run ${checksToRun.length} checks: ${checksToRun.join(', ')}`);

    // Process each repository
    const repositoryReports: RepositoryReport[] = [];
    const concurrency = this.options.concurrency || 5;

    // Process repositories in batches for concurrency control
    for (let i = 0; i < repositories.length; i += concurrency) {
      const batch = repositories.slice(i, i + concurrency);
      const batchReports = await Promise.all(
        batch.map((repo) => this.checkRepository(repo, checksToRun))
      );
      repositoryReports.push(...batchReports);

      // Progress update
      const processed = Math.min(i + concurrency, repositories.length);
      core.info(`Progress: ${processed}/${repositories.length} repositories processed`);
    }

    // Generate summary report
    const report = this.generateReport(repositoryReports, startTime);
    this.logSummary(report);

    return report;
  }

  /**
   * Get list of repositories to check based on options
   */
  private async getRepositoriesToCheck(): Promise<Repository[]> {
    const allRepos = await this.client.listRepositories({
      includeArchived: this.options.includeArchived,
    });

    if (!this.options.repos || this.options.repos.length === 0) {
      return allRepos;
    }

    // Filter to specific repositories if requested
    return allRepos.filter(
      (repo) =>
        this.options.repos?.includes(repo.name) || this.options.repos?.includes(repo.full_name)
    );
  }

  /**
   * Determine which checks to run based on options
   */
  private getChecksToRun(): string[] {
    const availableChecks = getAvailableChecks();

    if (!this.options.checks || this.options.checks.length === 0) {
      return availableChecks;
    }

    // Validate requested checks
    const invalidChecks = this.options.checks.filter((check) => !availableChecks.includes(check));

    if (invalidChecks.length > 0) {
      core.warning(`Invalid checks requested: ${invalidChecks.join(', ')}`);
    }

    return this.options.checks.filter((check) => availableChecks.includes(check));
  }

  /**
   * Run all checks on a single repository
   */
  private async checkRepository(
    repository: Repository,
    checksToRun: string[]
  ): Promise<RepositoryReport> {
    core.group(`📦 Checking ${repository.full_name}`, async () => {
      core.info(
        `Repository: ${repository.full_name} (${repository.private ? 'private' : 'public'}${repository.archived ? ', archived' : ''})`
      );
    });

    const checkExecutions: CheckExecution[] = [];

    for (const checkName of checksToRun) {
      const execution = await this.runCheck(checkName, repository);
      if (execution) {
        checkExecutions.push(execution);
      }
    }

    // Calculate summary for this repository
    const checksPassed = checkExecutions.filter(
      (e) => e.result.compliant && !e.result.fixed
    ).length;
    const checksFixed = checkExecutions.filter((e) => e.result.fixed).length;
    const checksFailed = checkExecutions.filter(
      (e) => !e.result.compliant && !e.result.error
    ).length;
    const checksErrored = checkExecutions.filter((e) => e.result.error).length;

    const report: RepositoryReport = {
      repository: {
        name: repository.name,
        full_name: repository.full_name,
        private: repository.private,
        archived: repository.archived,
      },
      compliant: checksFailed === 0 && checksErrored === 0,
      checksRun: checkExecutions.length,
      checksPassed,
      checksFailed,
      checksFixed,
      checksErrored,
      checks: checkExecutions,
    };

    // Log repository summary
    if (report.compliant) {
      core.info(
        `✅ ${repository.full_name} is compliant (${checksPassed} passed, ${checksFixed} fixed)`
      );
    } else {
      core.warning(
        `❌ ${repository.full_name} has issues (${checksFailed} failed, ${checksErrored} errors)`
      );
    }

    core.endGroup();
    return report;
  }

  /**
   * Run a single check on a repository
   */
  private async runCheck(
    checkName: string,
    repository: Repository
  ): Promise<CheckExecution | null> {
    const startTime = Date.now();

    try {
      // Create check instance
      const CheckClass = getCheck(checkName) as new () => ComplianceCheck;
      const check: ComplianceCheck = new CheckClass();

      // Create context
      const context: CheckContext = {
        client: this.client,
        config: this.config,
        dryRun: this.options.dryRun,
        repository,
      };

      // Check if this check should run for this repository
      if (!check.shouldRun(context)) {
        core.debug(`Skipping ${checkName} for ${repository.full_name} (shouldRun = false)`);
        return null;
      }

      // Run the check
      core.debug(`Running ${checkName} for ${repository.full_name}`);
      let result = await check.check(context);

      // If check failed and we're not in dry-run mode, try to fix
      if (!result.compliant && !this.options.dryRun && check.fix) {
        core.info(`🔧 Attempting to fix ${checkName} for ${repository.full_name}`);
        result = await check.fix(context);
      }

      // Log result
      if (result.compliant) {
        if (result.fixed) {
          core.info(`✅ Fixed: ${checkName} - ${result.message}`);
        } else {
          core.debug(`✅ Pass: ${checkName} - ${result.message}`);
        }
      } else if (result.error) {
        core.error(`❌ Error: ${checkName} - ${result.message}: ${result.error}`);
      } else {
        core.warning(`⚠️ Fail: ${checkName} - ${result.message}`);
      }

      return {
        checkName,
        repository,
        result,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      core.error(`Failed to run ${checkName} for ${repository.full_name}: ${errorMessage}`);

      return {
        checkName,
        repository,
        result: {
          compliant: false,
          message: `Check failed with error`,
          error: errorMessage,
        },
        duration: Date.now() - startTime,
        error: errorMessage,
      };
    }
  }

  /**
   * Generate summary report
   */
  private generateReport(repositoryReports: RepositoryReport[], startTime: number): RunnerReport {
    const totalRepositories = repositoryReports.length;
    const compliantRepositories = repositoryReports.filter((r) => r.compliant).length;
    const nonCompliantRepositories = totalRepositories - compliantRepositories;

    const fixedRepositories = repositoryReports.filter((r) => r.checksFixed > 0).length;

    const errorRepositories = repositoryReports.filter((r) => r.checksErrored > 0).length;

    const compliancePercentage =
      totalRepositories > 0 ? Math.round((compliantRepositories / totalRepositories) * 100) : 100;

    return {
      totalRepositories,
      compliantRepositories,
      nonCompliantRepositories,
      fixedRepositories,
      errorRepositories,
      repositories: repositoryReports,
      compliancePercentage,
      executionTime: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Log summary to console
   */
  private logSummary(report: RunnerReport): void {
    core.info('');
    core.info('='.repeat(60));
    core.info('📊 COMPLIANCE CHECK SUMMARY');
    core.info('='.repeat(60));
    core.info(`Total Repositories: ${report.totalRepositories}`);
    core.info(`✅ Compliant: ${report.compliantRepositories}`);
    core.info(`❌ Non-Compliant: ${report.nonCompliantRepositories}`);
    core.info(`🔧 Fixed: ${report.fixedRepositories}`);
    core.info(`⚠️ Errors: ${report.errorRepositories}`);
    core.info(`📈 Compliance Rate: ${report.compliancePercentage}%`);
    core.info(`⏱️ Execution Time: ${(report.executionTime / 1000).toFixed(2)}s`);
    core.info('='.repeat(60));

    // List non-compliant repositories for visibility
    if (report.nonCompliantRepositories > 0) {
      core.info('');
      core.warning('Non-compliant repositories:');
      report.repositories
        .filter((r) => !r.compliant)
        .forEach((r) => {
          core.warning(
            `  - ${r.repository.full_name} (${r.checksFailed} failed, ${r.checksErrored} errors)`
          );
        });
    }
  }
}

export { getAvailableChecks } from './check-registry';
export * from './types';
