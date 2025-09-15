import * as core from '@actions/core';
import type { Security } from '../config/types';
import { BaseCheck, type CheckContext, type CheckResult } from './base';
import type {
  AppliedAction,
  CheckDetails,
  RepositoryWithSecurity,
  SecurityClient,
  VulnerabilityAlert,
} from './types';

export class SecurityScanningCheck extends BaseCheck {
  readonly name = 'security-scanning';
  readonly description = 'Verify repository security scanning settings';

  shouldRun(context: CheckContext): boolean {
    const config = this.getRepoConfig(context, 'security');
    return config !== undefined;
  }

  async check(context: CheckContext): Promise<CheckResult> {
    try {
      const { repository } = context;
      const { owner, repo } = this.getRepoInfo(repository);
      const config = this.getRepoConfig(context, 'security') as Security;

      if (!config) {
        return this.createCompliantResult('No security scanning configuration specified');
      }

      const issues: string[] = [];
      const details: CheckDetails = {
        current: {},
        expected: config,
        actions_needed: [],
      };

      // Get current repository settings
      const repoData = (await context.client.getRepository(
        owner,
        repo
      )) as unknown as RepositoryWithSecurity;
      if (details.current && typeof details.current === 'object') {
        (details.current as Record<string, unknown>).repository_settings = {
          security_and_analysis: repoData.security_and_analysis,
        };
      }

      // Check vulnerability alerts (Dependabot alerts)
      if (config.dependabot_alerts !== undefined) {
        const currentSetting =
          repoData.security_and_analysis?.dependency_graph?.status === 'enabled' &&
          repoData.security_and_analysis?.dependabot_security_updates?.status === 'enabled';

        if (config.dependabot_alerts !== currentSetting) {
          issues.push(
            `Dependabot alerts should be ${config.dependabot_alerts ? 'enabled' : 'disabled'} ` +
              `but is ${currentSetting ? 'enabled' : 'disabled'}`
          );
          if (details.actions_needed) {
            details.actions_needed.push({
              action: 'update_dependabot_alerts',
              enabled: config.dependabot_alerts,
            });
          }
        }
      }

      // Check secret scanning
      if (config.secret_scanning !== undefined) {
        const currentSetting =
          repoData.security_and_analysis?.secret_scanning?.status === 'enabled';
        const expectedSetting = config.secret_scanning === 'enabled';

        if (expectedSetting !== currentSetting) {
          issues.push(
            `Secret scanning should be ${config.secret_scanning} ` +
              `but is ${currentSetting ? 'enabled' : 'disabled'}`
          );
          if (details.actions_needed) {
            details.actions_needed.push({
              action: 'update_secret_scanning',
              enabled: config.secret_scanning,
            });
          }
        }
      }

      // Check secret scanning push protection
      if (config.secret_scanning_push_protection !== undefined) {
        const currentSetting =
          repoData.security_and_analysis?.secret_scanning_push_protection?.status === 'enabled';
        const expectedSetting = config.secret_scanning_push_protection === 'enabled';

        if (expectedSetting !== currentSetting) {
          issues.push(
            `Secret scanning push protection should be ${config.secret_scanning_push_protection} ` +
              `but is ${currentSetting ? 'enabled' : 'disabled'}`
          );
          if (details.actions_needed) {
            details.actions_needed.push({
              action: 'update_secret_scanning_push_protection',
              enabled: config.secret_scanning_push_protection,
            });
          }
        }
      }

      // Check code scanning (GitHub Advanced Security)
      if (config.code_scanning_recommended !== undefined) {
        try {
          // Note: This would require additional API calls to check CodeQL or other code scanning tools
          // For now, we'll just check if the feature is available for the repository
          if (repository.private && !repoData.security_and_analysis?.advanced_security?.status) {
            if (config.code_scanning_recommended) {
              issues.push(
                'Code scanning requires GitHub Advanced Security to be enabled for private repositories'
              );
              if (details.actions_needed) {
                details.actions_needed.push({
                  action: 'enable_advanced_security',
                  note: 'Required for code scanning on private repositories',
                });
              }
            }
          }
        } catch (error) {
          core.warning(
            `Could not check code scanning status: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      // Check if there are any open vulnerability alerts (informational)
      if (config.dependabot_alerts) {
        try {
          const alerts = await (context.client as unknown as SecurityClient).getVulnerabilityAlerts(
            owner,
            repo
          );
          if (details.current && typeof details.current === 'object') {
            (details.current as Record<string, unknown>).vulnerability_alerts = {
              total: alerts.length,
              open: alerts.filter((alert: VulnerabilityAlert) => alert.state === 'open').length,
              dismissed: alerts.filter((alert: VulnerabilityAlert) => alert.state === 'dismissed')
                .length,
            };
          }

          const vulnAlerts = (details.current as Record<string, unknown>)?.vulnerability_alerts as
            | { open?: number }
            | undefined;
          if (
            details.current &&
            typeof details.current === 'object' &&
            vulnAlerts &&
            vulnAlerts.open &&
            vulnAlerts.open > 0
          ) {
            core.warning(
              `Repository ${repository.full_name} has ${vulnAlerts.open} open vulnerability alerts`
            );
          }
        } catch (error) {
          core.debug(
            `Could not fetch vulnerability alerts: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      if (issues.length === 0) {
        return this.createCompliantResult(
          'Security scanning settings are configured correctly',
          details
        );
      }

      return this.createNonCompliantResult(
        `Security scanning issues found: ${issues.join('; ')}`,
        details
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      core.error(
        `Failed to check security scanning for ${context.repository.full_name}: ${errorMessage}`
      );
      return this.createErrorResult('Failed to check security scanning settings', errorMessage);
    }
  }

  async fix(context: CheckContext): Promise<CheckResult> {
    if (context.dryRun) {
      return this.check(context);
    }

    try {
      const { repository } = context;
      const { owner, repo } = this.getRepoInfo(repository);
      const config = this.getRepoConfig(context, 'security') as Security;

      if (!config) {
        return this.createCompliantResult('No security scanning configuration to apply');
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
            case 'update_dependabot_alerts':
              await (context.client as unknown as SecurityClient).updateVulnerabilityAlerts(
                owner,
                repo,
                action.enabled as boolean
              );
              appliedActions.push({
                action: 'update_dependabot_alerts',
                details: { enabled: action.enabled },
              });
              core.info(
                `✅ ${action.enabled ? 'Enabled' : 'Disabled'} Dependabot alerts for ${repository.full_name}`
              );
              break;

            case 'update_secret_scanning':
              await (context.client as unknown as SecurityClient).updateSecretScanning(
                owner,
                repo,
                action.enabled === 'enabled'
              );
              appliedActions.push({
                action: 'update_secret_scanning',
                details: { enabled: action.enabled },
              });
              core.info(
                `✅ ${action.enabled === 'enabled' ? 'Enabled' : 'Disabled'} secret scanning for ${repository.full_name}`
              );
              break;

            case 'update_secret_scanning_push_protection':
              await (
                context.client as unknown as SecurityClient
              ).updateSecretScanningPushProtection(owner, repo, action.enabled === 'enabled');
              appliedActions.push({
                action: 'update_secret_scanning_push_protection',
                details: { enabled: action.enabled },
              });
              core.info(
                `✅ ${action.enabled === 'enabled' ? 'Enabled' : 'Disabled'} secret scanning push protection for ${repository.full_name}`
              );
              break;

            case 'enable_advanced_security':
              // Note: This typically requires organization-level permissions
              // and may need to be handled differently depending on the GitHub plan
              core.warning(
                `Advanced Security needs to be enabled for ${repository.full_name} to use code scanning on private repositories. ` +
                  'This may require organization owner permissions.'
              );
              break;

            default:
              core.warning(`Unknown security scanning action: ${action.action}`);
              break;
          }
        } catch (actionError) {
          const errorMessage =
            actionError instanceof Error ? actionError.message : String(actionError);
          core.error(
            `Failed to apply ${action.action} for ${repository.full_name}: ${errorMessage}`
          );
        }
      }

      if (appliedActions.length === 0) {
        return this.createErrorResult(
          'Failed to apply any security scanning changes',
          'All actions failed or require manual intervention'
        );
      }

      return this.createFixedResult(`Applied ${appliedActions.length} security scanning changes`, {
        applied_actions: appliedActions,
        total_actions: actions_needed?.length || 0,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      core.error(
        `Failed to fix security scanning for ${context.repository.full_name}: ${errorMessage}`
      );
      return this.createErrorResult('Failed to update security scanning settings', errorMessage);
    }
  }
}
