import type { Logger } from '../logging';
import * as rootLogger from '../logging';
import { TeamManager, type TeamSyncOptions } from '../teams';
import type { CheckResult, OrganizationCheck, OrganizationCheckContext } from './base';
import type { CheckFinding, ComplianceAction } from './types';

function createLoggerAdapter(): Logger {
  const noop = (): void => {
    /* intentional no-op */
  };
  return {
    info: rootLogger.info,
    warning: rootLogger.warning,
    error: rootLogger.error,
    debug: rootLogger.debug,
    startGroup: noop,
    endGroup: noop,
  };
}

function createResult(
  result: CheckResult,
  actions: ComplianceAction[],
  findings: CheckFinding[]
): CheckResult {
  return { ...result, actions, findings };
}

export class TeamSyncCheck implements OrganizationCheck {
  readonly name = 'org-team-sync';
  readonly description = 'Preview of GitHub team synchronization based on configuration.';

  shouldRun(context: OrganizationCheckContext): boolean {
    return context.config.teams !== undefined;
  }

  async execute(context: OrganizationCheckContext): Promise<CheckResult> {
    if (!context.config.teams) {
      return { compliant: true, message: 'No team configuration defined for this run.' };
    }

    const effectiveDryRun = context.dryRun || context.config.teams.dry_run === true;
    const baseOptions: TeamSyncOptions = {
      dryRun: effectiveDryRun,
      owner: context.organization,
    };
    const unmanagedTeams = context.config.teams.unmanaged_teams;
    const manager = new TeamManager(
      context.client,
      context.config.teams,
      createLoggerAdapter(),
      unmanagedTeams !== undefined ? { ...baseOptions, unmanagedTeams } : baseOptions
    );

    const result = await manager.sync();
    const actions: ComplianceAction[] = result.actions.map((action) => ({
      scope: 'organization',
      category: 'team_synchronization',
      operation: action.operation,
      disposition: effectiveDryRun ? 'proposed' : 'applied',
      target: `${context.organization}:${action.team}`,
      ...(action.details && { details: action.details }),
    }));
    const findings: CheckFinding[] = result.findings.map((finding) => ({
      level: finding.level,
      message: finding.message,
      details: {
        ...(finding.team && { team: finding.team }),
        ...(finding.details ?? {}),
      },
    }));

    if (result.hasErrors) {
      return createResult(
        {
          compliant: false,
          message: 'Team synchronization encountered errors',
          error: result.summary,
          details: { stats: result.stats },
        },
        actions,
        findings
      );
    }

    if (result.hasChanges) {
      return createResult(
        effectiveDryRun
          ? { compliant: false, message: result.summary, details: { stats: result.stats } }
          : {
              compliant: true,
              fixed: true,
              message: result.summary,
              details: { stats: result.stats },
            },
        actions,
        findings
      );
    }

    return createResult(
      { compliant: true, message: result.summary, details: { stats: result.stats } },
      actions,
      findings
    );
  }
}
