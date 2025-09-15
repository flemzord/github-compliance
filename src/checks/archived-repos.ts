import * as core from '@actions/core';
import { BaseCheck, type CheckContext, type CheckResult } from './base';
import type { AppliedAction, CheckAction, CheckDetails, SpecificRepoConfig } from './types';

export class ArchivedReposCheck extends BaseCheck {
  readonly name = 'archived-repos';
  readonly description = 'Verify repository archival status and cleanup';

  shouldRun(context: CheckContext): boolean {
    const config = this.getRepoConfig(context, 'archived_repos');
    return config !== undefined;
  }

  async check(context: CheckContext): Promise<CheckResult> {
    try {
      const { repository } = context;
      const config = this.getRepoConfig(context, 'archived_repos');

      if (!config) {
        return this.createCompliantResult('No archived repositories configuration specified');
      }

      const issues: string[] = [];
      const details: CheckDetails = {
        current: {
          archived: repository.archived,
          updated_at: repository.updated_at,
          pushed_at: repository.pushed_at,
        },
        expected: config,
        actions_needed: [],
      };

      // Check if repository should be archived based on inactivity
      if (config.archive_inactive !== undefined && config.archive_inactive) {
        const inactiveThresholdDays = config.inactive_days || 365; // Default to 1 year
        const lastActivity = new Date(repository.pushed_at || repository.updated_at);
        const daysSinceActivity = Math.floor(
          (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (!details.current || typeof details.current !== 'object') {
          details.current = {};
        }
        if (!details.expected || typeof details.expected !== 'object') {
          details.expected = {};
        }
        if (!details.actions_needed || !Array.isArray(details.actions_needed)) {
          details.actions_needed = [];
        }

        if (details.current) {
          (details.current as Record<string, unknown>).days_since_activity = daysSinceActivity;
        }
        if (details.expected) {
          (details.expected as Record<string, unknown>).inactive_threshold_days =
            inactiveThresholdDays;
        }

        if (daysSinceActivity >= inactiveThresholdDays && !repository.archived) {
          issues.push(
            `Repository has been inactive for ${daysSinceActivity} days (threshold: ${inactiveThresholdDays}) and should be archived`
          );
          (details.actions_needed as CheckAction[]).push({
            action: 'archive_repository',
            reason: 'inactive',
            days_inactive: daysSinceActivity,
          });
        }
      }

      // Check if repository should be unarchived
      if (config.unarchive_active !== undefined && config.unarchive_active && repository.archived) {
        // Note: We can't easily detect recent activity on an archived repo
        // This would typically be handled manually or through specific criteria
        core.info(
          `Repository ${repository.full_name} is archived. Consider if it should be unarchived based on your criteria.`
        );
      }

      // Check repository name patterns for archival
      if (config.archive_patterns) {
        const shouldBeArchived = this.matchesPattern(repository.name, config.archive_patterns);

        if (shouldBeArchived && !repository.archived) {
          issues.push(`Repository name matches archival pattern but is not archived`);
          if (!details.actions_needed || !Array.isArray(details.actions_needed)) {
            details.actions_needed = [];
          }
          (details.actions_needed as CheckAction[]).push({
            action: 'archive_repository',
            reason: 'name_pattern',
            matched_pattern: config.archive_patterns.find((pattern: string) =>
              this.matchesPattern(repository.name, [pattern])
            ),
          });
        }
      }

      // Check for repositories that should remain active
      if (config.keep_active_patterns) {
        const shouldStayActive = this.matchesPattern(repository.name, config.keep_active_patterns);

        if (shouldStayActive && repository.archived) {
          issues.push(`Repository name matches keep-active pattern but is archived`);
          if (!details.actions_needed || !Array.isArray(details.actions_needed)) {
            details.actions_needed = [];
          }
          (details.actions_needed as CheckAction[]).push({
            action: 'unarchive_repository',
            reason: 'keep_active_pattern',
            matched_pattern: config.keep_active_patterns.find((pattern: string) =>
              this.matchesPattern(repository.name, [pattern])
            ),
          });
        }
      }

      // Check for specific repositories to archive/unarchive
      if (
        config.specific_repos &&
        typeof config.specific_repos === 'object' &&
        !Array.isArray(config.specific_repos)
      ) {
        const specificConfig = (config.specific_repos as Record<string, SpecificRepoConfig>)[
          repository.name
        ];

        if (specificConfig !== undefined) {
          if (specificConfig.archived !== repository.archived) {
            const action = specificConfig.archived ? 'archive' : 'unarchive';
            issues.push(
              `Repository should be ${specificConfig.archived ? 'archived' : 'unarchived'} ` +
                `but is ${repository.archived ? 'archived' : 'active'}`
            );
            if (!details.actions_needed || !Array.isArray(details.actions_needed)) {
              details.actions_needed = [];
            }
            (details.actions_needed as CheckAction[]).push({
              action: `${action}_repository`,
              reason: 'specific_configuration',
            });
          }
        }
      }

      // Informational: Check repository metrics for decision making
      if (!repository.archived) {
        try {
          const { owner, repo } = this.getRepoInfo(repository);
          const repoData = await context.client.getRepository(owner, repo);

          if (!details.current || typeof details.current !== 'object') {
            details.current = {};
          }
          (details.current as Record<string, unknown>).metrics = {
            stars: repoData?.stargazers_count || 0,
            forks: repoData?.forks_count || 0,
            open_issues: repoData?.open_issues_count || 0,
            size: repoData?.size || 0,
            language: repoData?.language || null,
          };

          // Provide recommendations based on metrics
          const recommendations: string[] = [];

          if (
            (repoData?.stargazers_count || 0) === 0 &&
            (repoData?.forks_count || 0) === 0 &&
            details.current &&
            typeof details.current === 'object' &&
            (((details.current as Record<string, unknown>).days_since_activity as number) || 0) >
              180
          ) {
            recommendations.push(
              'Repository has no stars or forks and has been inactive for 6+ months - consider archiving'
            );
          }

          if ((repoData?.open_issues_count || 0) > 0 && repository.archived) {
            recommendations.push(
              `Repository is archived but has ${repoData?.open_issues_count || 0} open issues - consider closing issues before archiving`
            );
          }

          if (recommendations.length > 0) {
            details.recommendations = recommendations;
            for (const recommendation of recommendations) {
              core.info(`💡 ${recommendation}`);
            }
          }
        } catch (error) {
          core.debug(
            `Could not fetch repository metrics: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      if (issues.length === 0) {
        return this.createCompliantResult(
          'Repository archival status is configured correctly',
          details
        );
      }

      return this.createNonCompliantResult(
        `Repository archival issues found: ${issues.join('; ')}`,
        details
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      core.error(
        `Failed to check archived repos for ${context.repository.full_name}: ${errorMessage}`
      );
      return this.createErrorResult('Failed to check repository archival status', errorMessage);
    }
  }

  async fix(context: CheckContext): Promise<CheckResult> {
    if (context.dryRun) {
      return this.check(context);
    }

    try {
      const { repository } = context;
      const { owner, repo } = this.getRepoInfo(repository);
      const config = this.getRepoConfig(context, 'archived_repos');

      if (!config) {
        return this.createCompliantResult('No archived repositories configuration to apply');
      }

      // First check current state
      const checkResult = await this.check({ ...context, dryRun: true });
      if (checkResult.compliant) {
        return checkResult;
      }

      const appliedActions: AppliedAction[] = [];
      const details = checkResult.details as CheckDetails;
      const actions_needed = details?.actions_needed;

      if (!actions_needed || !Array.isArray(actions_needed)) {
        return this.createCompliantResult('No actions needed to apply');
      }

      // Apply each needed action
      for (const action of actions_needed) {
        try {
          switch (action.action) {
            case 'archive_repository':
              await context.client.updateRepository(owner, repo, { archived: true });
              appliedActions.push({
                action: 'archive_repository',
                details: { reason: action.reason, repository: repository.full_name },
              });
              core.info(
                `✅ Archived repository ${repository.full_name} (reason: ${action.reason})`
              );
              break;

            case 'unarchive_repository':
              await context.client.updateRepository(owner, repo, { archived: false });
              appliedActions.push({
                action: 'unarchive_repository',
                details: { reason: action.reason, repository: repository.full_name },
              });
              core.info(
                `✅ Unarchived repository ${repository.full_name} (reason: ${action.reason})`
              );
              break;

            default:
              core.warning(`Unknown archived repos action: ${action.action}`);
              break;
          }
        } catch (actionError) {
          const errorMessage =
            actionError instanceof Error ? actionError.message : String(actionError);
          core.error(
            `Failed to apply ${action.action} for ${repository.full_name}: ${errorMessage}`
          );

          // Some common error scenarios
          if (errorMessage.includes('archived')) {
            core.error(
              'Cannot modify an archived repository. Manual intervention may be required.'
            );
          }
          if (errorMessage.includes('permission')) {
            core.error('Insufficient permissions to archive/unarchive repository.');
          }
        }
      }

      if (appliedActions.length === 0) {
        return this.createErrorResult('Failed to apply any archival changes', 'All actions failed');
      }

      return this.createFixedResult(`Applied ${appliedActions.length} archival changes`, {
        applied_actions: appliedActions,
        total_actions: actions_needed?.length || 0,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      core.error(
        `Failed to fix archived repos for ${context.repository.full_name}: ${errorMessage}`
      );
      return this.createErrorResult('Failed to update repository archival status', errorMessage);
    }
  }
}
