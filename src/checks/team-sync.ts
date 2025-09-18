import type { Logger } from '../logging';
import * as rootLogger from '../logging';
import { TeamManager, type TeamSyncOptions } from '../teams';
import { BaseCheck, type CheckContext, type CheckResult } from './base';

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

export class TeamSyncCheck extends BaseCheck {
  readonly name = 'org-team-sync';
  readonly description = 'Preview of GitHub team synchronization based on configuration.';

  shouldRun(context: CheckContext): boolean {
    return context.config.teams !== undefined;
  }

  async check(context: CheckContext): Promise<CheckResult> {
    if (!context.config.teams) {
      return this.createCompliantResult('No team configuration defined for this run.');
    }

    const baseOptions: TeamSyncOptions = {
      dryRun: true,
    };
    if (context.config.organization) {
      baseOptions.owner = context.config.organization;
    }
    const unmanagedTeams = context.config.teams.unmanaged_teams;
    const manager = new TeamManager(
      context.client,
      context.config.teams,
      createLoggerAdapter(),
      unmanagedTeams !== undefined ? { ...baseOptions, unmanagedTeams } : baseOptions
    );

    const result = await manager.sync();

    if (result.hasErrors) {
      return this.createErrorResult('Team synchronization encountered errors', result.summary);
    }

    if (result.hasChanges) {
      return this.createNonCompliantResult(result.summary, {
        findings: result.findings,
        stats: result.stats,
      });
    }

    return this.createCompliantResult(result.summary, {
      findings: result.findings,
      stats: result.stats,
    });
  }

  async fix(context: CheckContext): Promise<CheckResult> {
    if (!context.config.teams) {
      return this.createCompliantResult('No team configuration defined for this run.');
    }

    if (context.dryRun) {
      return this.check(context);
    }

    const baseOptions: TeamSyncOptions = {
      dryRun: false,
    };
    if (context.config.organization) {
      baseOptions.owner = context.config.organization;
    }
    const unmanagedTeams = context.config.teams.unmanaged_teams;
    const manager = new TeamManager(
      context.client,
      context.config.teams,
      createLoggerAdapter(),
      unmanagedTeams !== undefined ? { ...baseOptions, unmanagedTeams } : baseOptions
    );

    const result = await manager.sync();

    if (result.hasErrors) {
      return this.createErrorResult('Team synchronization encountered errors', result.summary);
    }

    return this.createFixedResult(result.summary, {
      findings: result.findings,
      stats: result.stats,
    });
  }
}
