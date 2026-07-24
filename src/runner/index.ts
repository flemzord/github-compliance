import type {
  CheckContext,
  CheckResult,
  ComplianceCheck,
  OrganizationCheck,
  OrganizationCheckContext,
} from '../checks/base';
import type {
  ActionCategory,
  ActionDisposition,
  CheckAction,
  ComplianceAction,
} from '../checks/types';
import type { ComplianceConfig } from '../config/types';
import type { GitHubClient } from '../github/client';
import type { Repository } from '../github/types';
import type { CheckSummary, ProgressLogger } from '../logging';
import * as logger from '../logging';
import {
  getAvailableChecks,
  getCheckScope,
  getOrganizationCheck,
  getRepositoryCheck,
  normalizeCheckName,
} from './check-registry';
import type {
  ActionSummary,
  CheckExecution,
  OrganizationCheckExecution,
  RepositoryReport,
  RunnerOptions,
  RunnerReport,
} from './types';

export class ComplianceRunner {
  private client: GitHubClient;
  private config: ComplianceConfig;
  private options: RunnerOptions;
  private progressLogger?: ProgressLogger;
  private repositoriesToCheck: Repository[] = [];
  private processedRepositories: Map<string, number> = new Map();

  constructor(
    client: GitHubClient,
    config: ComplianceConfig,
    options: RunnerOptions,
    progressLogger?: ProgressLogger
  ) {
    this.client = client;
    this.config = config;
    this.options = options;
    if (progressLogger !== undefined) {
      this.progressLogger = progressLogger;
    }
  }

  /**
   * Run compliance checks on all repositories
   */
  async run(): Promise<RunnerReport> {
    const startTime = Date.now();

    // Only log if not using ProgressLogger
    if (!this.progressLogger) {
      logger.info('🚀 Starting compliance checks...');
    }

    // Get repositories to check
    const repositories = await this.getRepositoriesToCheck();
    this.repositoriesToCheck = repositories;

    if (!this.progressLogger) {
      logger.info(`Found ${repositories.length} repositories to check`);
    }

    // Determine which checks to run
    const checksToRun = this.getChecksToRun();
    const organizationChecks = checksToRun.filter(
      (check) => getCheckScope(check) === 'organization'
    );
    const repositoryChecks = checksToRun.filter((check) => getCheckScope(check) === 'repository');

    if (!this.progressLogger) {
      logger.info(`Will run ${checksToRun.length} checks: ${checksToRun.join(', ')}`);
    } else {
      // Initialize check summaries
      for (const check of checksToRun) {
        this.progressLogger.updateCheckSummary(check, {
          status: 'pending',
        });
      }
    }

    const organizationCheckExecutions: OrganizationCheckExecution[] = [];
    for (const checkName of organizationChecks) {
      const execution = await this.runOrganizationCheck(checkName);
      if (execution) {
        organizationCheckExecutions.push(execution);
        this.updateProgressCheckSummary(checkName, execution.result);
      }
    }

    // Start progress tracking
    if (this.progressLogger) {
      this.progressLogger.startProgress(
        repositories.length,
        `Scanning ${repositories.length} repositories...`
      );
    }

    // Process each repository
    const repositoryReports: RepositoryReport[] = [];
    const concurrency = this.options.concurrency || 5;

    // Process repositories in batches for concurrency control
    let processedCount = 0;
    for (let i = 0; i < repositories.length; i += concurrency) {
      const batch = repositories.slice(i, i + concurrency);
      const batchReports = await Promise.all(
        batch.map(async (repo) => {
          processedCount++;
          this.processedRepositories.set(repo.full_name, processedCount);

          const report = await this.checkRepository(repo, repositoryChecks);

          // Update progress
          if (this.progressLogger) {
            this.progressLogger.updateProgress({
              current: processedCount,
              total: repositories.length,
              repository: repo.name,
              status: 'completed',
            });
          }

          return report;
        })
      );
      repositoryReports.push(...batchReports);

      // Progress update for non-ProgressLogger
      if (!this.progressLogger) {
        const processed = Math.min(i + concurrency, repositories.length);
        logger.info(`Progress: ${processed}/${repositories.length} repositories processed`);
      }
    }

    // Stop progress tracking
    if (this.progressLogger) {
      this.progressLogger.stopProgress(true);
    }

    // Generate summary report
    const report = this.generateReport(repositoryReports, organizationCheckExecutions, startTime);
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
    const configuredChecks = this.config.checks?.enabled;
    const requestedChecks =
      this.options.checks && this.options.checks.length > 0
        ? this.options.checks
        : configuredChecks && configuredChecks.length > 0
          ? configuredChecks
          : availableChecks;
    const normalizedChecks = requestedChecks.map((check) => normalizeCheckName(check));
    const invalidChecks = normalizedChecks.filter((check) => !availableChecks.includes(check));

    if (invalidChecks.length > 0) {
      logger.warning(`Invalid checks requested: ${invalidChecks.join(', ')}`);
    }

    return normalizedChecks.filter((check) => availableChecks.includes(check));
  }

  private updateProgressCheckSummary(
    checkName: string,
    result: CheckResult,
    existing?: CheckSummary
  ): void {
    if (!this.progressLogger) return;
    const summary = existing ??
      this.progressLogger.checkSummaries?.get(checkName) ?? {
        name: checkName,
        compliant: 0,
        issues: 0,
        fixed: 0,
        status: 'running' as const,
      };
    if (result.compliant) summary.compliant += 1;
    else summary.issues += 1;
    if (result.fixed) summary.fixed += 1;
    this.progressLogger.updateCheckSummary(checkName, summary);
  }

  private async runOrganizationCheck(
    checkName: string
  ): Promise<OrganizationCheckExecution | null> {
    const startTime = Date.now();
    const organization = this.config.organization ?? this.client.getOwner();
    if (!organization) {
      return {
        checkName,
        organization: 'unknown',
        result: {
          compliant: false,
          message: 'Organization check failed with error',
          error: 'Organization owner is required',
        },
        duration: Date.now() - startTime,
        error: 'Organization owner is required',
      };
    }

    try {
      const CheckClass = getOrganizationCheck(checkName) as new () => OrganizationCheck;
      const check = new CheckClass();
      const context: OrganizationCheckContext = {
        client: this.client,
        config: this.config,
        dryRun: this.options.dryRun,
        organization,
      };
      if (!check.shouldRun(context)) {
        logger.debug(`Skipping ${checkName} for ${organization} (shouldRun = false)`);
        return null;
      }

      logger.debug(`Running ${checkName} for organization ${organization}`);
      const result = await check.execute(context);
      if (result.error) logger.error(`❌ Error: ${checkName} - ${result.message}: ${result.error}`);
      else if (result.fixed) logger.info(`✅ Fixed: ${checkName} - ${result.message}`);
      else if (!result.compliant) logger.warning(`⚠️ Fail: ${checkName} - ${result.message}`);
      else logger.debug(`✅ Pass: ${checkName} - ${result.message}`);

      return {
        checkName,
        organization,
        result,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to run ${checkName} for organization ${organization}: ${message}`);
      return {
        checkName,
        organization,
        result: {
          compliant: false,
          message: 'Organization check failed with error',
          error: message,
        },
        duration: Date.now() - startTime,
        error: message,
      };
    }
  }

  /**
   * Run all checks on a single repository
   */
  private async checkRepository(
    repository: Repository,
    checksToRun: string[]
  ): Promise<RepositoryReport> {
    // Only log for non-ProgressLogger
    if (!this.progressLogger) {
      await logger.group(`📦 Checking ${repository.full_name}`, async () => {
        logger.info(
          `Repository: ${repository.full_name} (${repository.private ? 'private' : 'public'}${repository.archived ? ', archived' : ''})`
        );
      });
    }

    const checkExecutions: CheckExecution[] = [];

    for (const checkName of checksToRun) {
      // Update progress for current check
      if (this.progressLogger) {
        const currentIndex = this.processedRepositories.get(repository.full_name) || 1;
        this.progressLogger.updateProgress({
          current: currentIndex,
          total: this.repositoriesToCheck.length,
          repository: repository.name,
          check: checkName,
          status: 'running',
        });
      }

      const execution = await this.runCheck(checkName, repository);
      if (execution) {
        checkExecutions.push(execution);

        // Update check summary
        if (this.progressLogger) {
          const currentSummary = this.progressLogger.checkSummaries?.get(checkName) || {
            name: checkName,
            compliant: 0,
            issues: 0,
            fixed: 0,
            status: 'running' as const,
          };

          this.updateProgressCheckSummary(checkName, execution.result, currentSummary);
        }
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
      logger.info(
        `✅ ${repository.full_name} is compliant (${checksPassed} passed, ${checksFixed} fixed)`
      );
    } else {
      logger.warning(
        `❌ ${repository.full_name} has issues (${checksFailed} failed, ${checksErrored} errors)`
      );
    }

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
      const CheckClass = getRepositoryCheck(checkName) as new () => ComplianceCheck;
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
        logger.debug(`Skipping ${checkName} for ${repository.full_name} (shouldRun = false)`);
        return null;
      }

      // Run the check
      logger.debug(`Running ${checkName} for ${repository.full_name}`);
      let result = await check.check(context);

      // If check failed and we're not in dry-run mode, try to fix
      if (!result.compliant && !this.options.dryRun && check.fix) {
        logger.info(`🔧 Attempting to fix ${checkName} for ${repository.full_name}`);
        result = await check.fix(context);
      }

      // Log result
      if (result.compliant) {
        if (result.fixed) {
          logger.info(`✅ Fixed: ${checkName} - ${result.message}`);
        } else {
          logger.debug(`✅ Pass: ${checkName} - ${result.message}`);
        }
      } else if (result.error) {
        logger.error(`❌ Error: ${checkName} - ${result.message}: ${result.error}`);
      } else {
        logger.warning(`⚠️ Fail: ${checkName} - ${result.message}`);
      }

      return {
        checkName,
        repository,
        result,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to run ${checkName} for ${repository.full_name}: ${errorMessage}`);

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
  private generateReport(
    repositoryReports: RepositoryReport[],
    organizationChecks: OrganizationCheckExecution[],
    startTime: number
  ): RunnerReport {
    // Mark all checks as completed in ProgressLogger
    if (this.progressLogger) {
      for (const [checkName, summary] of this.progressLogger.checkSummaries) {
        this.progressLogger.updateCheckSummary(checkName, {
          ...summary,
          status: 'completed',
        });
      }
    }
    const totalRepositories = repositoryReports.length;
    const compliantRepositories = repositoryReports.filter((r) => r.compliant).length;
    const nonCompliantRepositories = totalRepositories - compliantRepositories;

    const fixedRepositories = repositoryReports.filter((r) => r.checksFixed > 0).length;

    const errorRepositories = repositoryReports.filter((r) => r.checksErrored > 0).length;
    const organizationHasErrors = organizationChecks.some((execution) => !!execution.result.error);
    const organizationIsNonCompliant = organizationChecks.some(
      (execution) => !execution.result.compliant && !execution.result.error
    );
    const actions = this.collectActions(repositoryReports, organizationChecks);
    const actionSummary = this.summarizeActions(actions);
    const hasErrors = errorRepositories > 0 || organizationHasErrors;
    const isNonCompliant = nonCompliantRepositories > 0 || organizationIsNonCompliant;

    const compliancePercentage =
      totalRepositories > 0 ? Math.round((compliantRepositories / totalRepositories) * 100) : 100;

    return {
      totalRepositories,
      compliantRepositories,
      nonCompliantRepositories,
      fixedRepositories,
      errorRepositories,
      repositories: repositoryReports,
      organizationChecks,
      actions,
      actionSummary,
      status: {
        configuration: 'valid',
        execution: hasErrors ? 'error' : 'success',
        compliance: hasErrors ? 'unknown' : isNonCompliant ? 'non_compliant' : 'compliant',
      },
      compliancePercentage,
      executionTime: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }

  private collectActions(
    repositoryReports: RepositoryReport[],
    organizationChecks: OrganizationCheckExecution[]
  ): ComplianceAction[] {
    const actions: ComplianceAction[] = [];
    for (const execution of organizationChecks) {
      actions.push(...(execution.result.actions ?? []));
    }
    for (const report of repositoryReports) {
      for (const execution of report.checks) {
        if (execution.result.actions !== undefined) {
          actions.push(...execution.result.actions);
          continue;
        }
        actions.push(...this.normalizeLegacyActions(execution));
      }
    }
    return actions;
  }

  private normalizeLegacyActions(execution: CheckExecution): ComplianceAction[] {
    const details = execution.result.details;
    if (!details) return [];
    const proposed = Array.isArray(details.actions_needed)
      ? (details.actions_needed as CheckAction[])
      : [];
    const applied = Array.isArray(details.applied_actions)
      ? (details.applied_actions as CheckAction[])
      : [];
    const category = this.categoryForCheck(execution.checkName);
    const normalize = (action: CheckAction, disposition: ActionDisposition): ComplianceAction => ({
      scope: 'repository',
      category,
      operation: String(action.action),
      disposition,
      target: this.legacyActionTarget(execution.repository.full_name, action),
      details: { ...action },
    });
    return [
      ...proposed.map((action) => normalize(action, 'proposed')),
      ...applied.map((action) => normalize(action, 'applied')),
    ];
  }

  private categoryForCheck(checkName: string): ActionCategory {
    const categories: Record<string, ActionCategory> = {
      'repo-branch-protection': 'branch_protection',
      'repo-access-teams': 'direct_team_permission',
      'repo-merge-strategy': 'merge_strategy',
      'repo-security-controls': 'security_control',
      'repo-archival-policy': 'archival_policy',
      'repo-settings': 'repository_setting',
      'repo-rulesets-observe': 'ruleset_observation',
    };
    return categories[checkName] ?? 'repository_setting';
  }

  private legacyActionTarget(repository: string, action: CheckAction): string {
    const identifier = action.team ?? action.username ?? action.branch ?? action.field;
    return identifier === undefined ? repository : `${repository}:${String(identifier)}`;
  }

  private summarizeActions(actions: ComplianceAction[]): ActionSummary {
    const categories: ActionCategory[] = [
      'branch_protection',
      'organization_role_permission',
      'direct_team_permission',
      'individual_collaborator',
      'team_synchronization',
      'ruleset_observation',
      'merge_strategy',
      'security_control',
      'archival_policy',
      'repository_setting',
    ];
    const summary = Object.fromEntries(
      categories.map((category) => [category, { proposed: 0, applied: 0, ignored: 0 }])
    ) as ActionSummary;
    for (const action of actions) summary[action.category][action.disposition] += 1;
    return summary;
  }

  /**
   * Log summary to console
   */
  private logSummary(report: RunnerReport): void {
    logger.info('');
    logger.info('='.repeat(60));
    logger.info('📊 COMPLIANCE CHECK SUMMARY');
    logger.info('='.repeat(60));
    logger.info(`Total Repositories: ${report.totalRepositories}`);
    logger.info(`✅ Compliant: ${report.compliantRepositories}`);
    logger.info(`❌ Non-Compliant: ${report.nonCompliantRepositories}`);
    logger.info(`🔧 Fixed: ${report.fixedRepositories}`);
    logger.info(`⚠️ Errors: ${report.errorRepositories}`);
    logger.info(`Execution: ${report.status.execution}`);
    logger.info(`Compliance: ${report.status.compliance}`);
    logger.info(`📈 Compliance Rate: ${report.compliancePercentage}%`);
    logger.info(`⏱️ Execution Time: ${(report.executionTime / 1000).toFixed(2)}s`);
    logger.info('='.repeat(60));

    const proposed = report.actions.filter((action) => action.disposition === 'proposed').length;
    const applied = report.actions.filter((action) => action.disposition === 'applied').length;
    const ignored = report.actions.filter((action) => action.disposition === 'ignored').length;
    logger.info(`Actions: ${proposed} proposed, ${applied} applied, ${ignored} ignored`);

    // List non-compliant repositories for visibility
    if (report.nonCompliantRepositories > 0) {
      logger.info('');
      logger.warning('Non-compliant repositories:');
      report.repositories
        .filter((r) => !r.compliant)
        .forEach((r) => {
          logger.warning(
            `  - ${r.repository.full_name} (${r.checksFailed} failed, ${r.checksErrored} errors)`
          );
        });
    }
  }
}

export { getAvailableChecks } from './check-registry';
export * from './types';
