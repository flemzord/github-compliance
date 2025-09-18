import type { TeamDefinition, TeamsConfig } from '../config/types';
import type { GitHubClient } from '../github';
import type { Logger } from '../logging';
import { calculateTeamDiff } from './diff';
import { resolveTeams } from './dynamic';
import { applyTeamDiffs } from './sync';
import type { ResolvedTeams, SyncResult, TeamDiff, TeamSyncOptions } from './types';

const EMPTY_RESULT: SyncResult = {
  hasChanges: false,
  hasErrors: false,
  findings: [],
  summary: 'No team configuration defined; skipping synchronization.',
  stats: {
    processed: 0,
    created: 0,
    updated: 0,
    removed: 0,
    skipped: 0,
  },
};

export class TeamManager {
  constructor(
    private readonly github: GitHubClient,
    private readonly config: TeamsConfig | undefined,
    private readonly logger: Logger,
    private readonly options: TeamSyncOptions = {}
  ) {}

  async sync(): Promise<SyncResult> {
    if (!this.config) {
      return EMPTY_RESULT;
    }

    const resolved = await this.resolveDynamicRules();
    const totalTeams = resolved.staticTeams.length + resolved.dynamicTeams.length;

    if (totalTeams === 0) {
      return {
        ...EMPTY_RESULT,
        summary: 'No teams defined in configuration; nothing to sync.',
        stats: {
          processed: 0,
          created: 0,
          updated: 0,
          removed: 0,
          skipped: 0,
        },
      };
    }

    this.logger.warning(
      'Team synchronization is under active development. No changes were applied during this run.'
    );

    return {
      hasChanges: false,
      hasErrors: false,
      findings: [
        {
          level: 'info',
          message: 'Resolved team configuration without applying changes.',
          details: { totalTeams },
        },
      ],
      summary: `Team synchronization is not yet implemented (${totalTeams} team configurations detected).`,
      stats: {
        processed: totalTeams,
        created: 0,
        updated: 0,
        removed: 0,
        skipped: totalTeams,
      },
    };
  }

  async getTeamDiff(teamDef: TeamDefinition): Promise<TeamDiff> {
    return calculateTeamDiff(this.github, teamDef);
  }

  async applyTeamChanges(diff: TeamDiff): Promise<void> {
    await applyTeamDiffs(this.github, diff, {
      dryRun: this.options.dryRun ?? this.config?.dry_run ?? false,
      logger: this.logger,
    });
  }

  async resolveDynamicRules(): Promise<ResolvedTeams> {
    if (!this.config) {
      return { staticTeams: [], dynamicTeams: [] };
    }

    return resolveTeams(this.github, this.config, {
      logger: this.logger,
      dryRun: this.options.dryRun ?? this.config.dry_run ?? false,
    });
  }
}
