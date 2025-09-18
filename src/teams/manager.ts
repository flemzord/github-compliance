import type { TeamDefinition, TeamMember, TeamsConfig } from '../config/types';
import type { GitHubClient } from '../github';
import type { GitHubTeamMember, GitHubTeamSummary } from '../github/types';
import type { Logger } from '../logging';
import { calculateTeamDiff } from './diff';
import { resolveTeams } from './dynamic';
import { applyTeamDiffs } from './sync';
import type {
  GitHubTeamState,
  ResolvedTeams,
  SyncFinding,
  SyncResult,
  TeamDiff,
  TeamSyncOptions,
} from './types';

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

function slugifyTeamName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-\s]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function mapGitHubMembers(members: GitHubTeamMember[]): TeamMember[] {
  return members.map((member) => ({
    username: member.login,
    role: member.role,
  }));
}

function buildTeamState(summary: GitHubTeamSummary, members: TeamMember[]): GitHubTeamState {
  const state: GitHubTeamState = {
    id: summary.id,
    name: summary.name,
    slug: summary.slug,
    description: summary.description ?? null,
    parent: summary.parent?.slug ?? null,
    members,
  };

  if (summary.privacy) {
    state.privacy = summary.privacy;
  }
  if (summary.notification_setting ?? null) {
    state.notification_setting = summary.notification_setting ?? null;
  }

  return state;
}

function hasTeamChanges(diff: TeamDiff): boolean {
  if (!diff.exists) {
    return true;
  }

  const { changes, manageMembers } = diff;
  if (changes.description || changes.privacy || changes.parent || changes.notification_setting) {
    return true;
  }

  if (!manageMembers) {
    return false;
  }

  return (
    changes.membersToAdd.length > 0 ||
    changes.membersToRemove.length > 0 ||
    changes.membersToUpdateRole.length > 0
  );
}

export class TeamManager {
  constructor(
    private readonly github: GitHubClient,
    private readonly config: TeamsConfig | undefined,
    private readonly logger: Logger,
    private readonly options: TeamSyncOptions = {}
  ) {}

  private getOwner(): string | undefined {
    return this.options.owner ?? this.github.getOwner();
  }

  private async resolveDynamicRules(owner: string): Promise<ResolvedTeams> {
    return resolveTeams(
      this.github,
      this.config ?? {},
      {
        logger: this.logger,
        dryRun: this.options.dryRun ?? this.config?.dry_run ?? false,
      },
      owner
    );
  }

  private async fetchExistingTeams(owner: string): Promise<Map<string, GitHubTeamSummary>> {
    const summaries = await this.github.listOrganizationTeams(owner);
    const map = new Map<string, GitHubTeamSummary>();
    for (const summary of summaries) {
      map.set(summary.slug, summary);
    }
    return map;
  }

  private async buildExistingTeamState(
    owner: string,
    summary: GitHubTeamSummary | undefined
  ): Promise<GitHubTeamState | null> {
    if (!summary) {
      return null;
    }

    const members = await this.github.listTeamMembers(owner, summary.slug);
    return buildTeamState(summary, mapGitHubMembers(members));
  }

  private determineTargetMembers(
    team: TeamDefinition,
    members: TeamMember[]
  ): {
    members: TeamMember[];
    manageMembers: boolean;
  } {
    if (members.length > 0) {
      return { members, manageMembers: true };
    }

    if (team.members && team.members.length > 0) {
      return { members: team.members, manageMembers: true };
    }

    if (team.members && team.members.length === 0) {
      return { members: [], manageMembers: true };
    }

    return { members: [], manageMembers: false };
  }

  private recordFinding(
    findings: SyncFinding[],
    level: 'info' | 'warning' | 'error',
    message: string,
    team?: string,
    details?: Record<string, unknown>
  ): void {
    const finding: SyncFinding = {
      level,
      message,
    };
    if (team !== undefined) {
      finding.team = team;
    }
    if (details !== undefined) {
      finding.details = details;
    }
    findings.push(finding);
  }

  async sync(): Promise<SyncResult> {
    if (!this.config) {
      return EMPTY_RESULT;
    }

    const owner = this.getOwner();
    if (!owner) {
      this.logger.error('Cannot synchronize teams: organization owner is not set.');
      return {
        hasChanges: false,
        hasErrors: true,
        findings: [
          {
            level: 'error',
            message: 'Organization owner is required to synchronize teams.',
          },
        ],
        summary: 'Failed to synchronize teams: missing organization owner.',
        stats: { ...EMPTY_RESULT.stats },
      };
    }

    const dryRun = this.options.dryRun ?? this.config.dry_run ?? false;

    const findings: SyncFinding[] = [];
    const stats = {
      processed: 0,
      created: 0,
      updated: 0,
      removed: 0,
      skipped: 0,
    };

    let hasChanges = false;
    let hasErrors = false;

    let resolved: ResolvedTeams;
    try {
      resolved = await this.resolveDynamicRules(owner);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to resolve dynamic team rules: ${message}`);
      return {
        hasChanges: false,
        hasErrors: true,
        findings: [
          {
            level: 'error',
            message: 'Failed to resolve dynamic team rules.',
            details: { error: message },
          },
        ],
        summary: 'Failed to synchronize teams due to dynamic rule resolution error.',
        stats: { ...EMPTY_RESULT.stats },
      };
    }

    const teamsToProcess = [
      ...(this.config.definitions?.map((definition) => ({
        definition,
        members: definition.members ?? [],
        source: 'definition' as const,
      })) ?? []),
      ...resolved.dynamicTeams,
    ];

    if (teamsToProcess.length === 0) {
      return {
        hasChanges: false,
        hasErrors: false,
        findings,
        summary: 'No teams defined in configuration; nothing to synchronize.',
        stats,
      };
    }

    let existingTeamsMap: Map<string, GitHubTeamSummary>;
    try {
      existingTeamsMap = await this.fetchExistingTeams(owner);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to list teams for ${owner}: ${message}`);
      return {
        hasChanges: false,
        hasErrors: true,
        findings: [
          {
            level: 'error',
            message: 'Failed to retrieve existing teams from GitHub.',
            details: { error: message },
          },
        ],
        summary: 'Failed to synchronize teams due to GitHub API error.',
        stats,
      };
    }

    for (const team of teamsToProcess) {
      stats.processed += 1;

      const slug = slugifyTeamName(team.definition.name);
      const existingSummary = existingTeamsMap.get(slug);
      let existingState: GitHubTeamState | null = null;

      try {
        existingState = await this.buildExistingTeamState(owner, existingSummary);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to load current state for team ${slug}: ${message}`);
        hasErrors = true;
        this.recordFinding(
          findings,
          'error',
          'Failed to load current team state.',
          team.definition.name,
          {
            error: message,
          }
        );
        continue;
      }

      const parentSlug = team.definition.parent ? slugifyTeamName(team.definition.parent) : null;
      let parentTeamId: number | null | undefined;
      if (parentSlug) {
        const parentSummary = existingTeamsMap.get(parentSlug);
        if (parentSummary) {
          parentTeamId = parentSummary.id;
        } else {
          this.logger.warning(
            `Parent team ${parentSlug} for ${slug} not found. Parent relationship will be skipped.`
          );
          this.recordFinding(
            findings,
            'warning',
            `Parent team ${parentSlug} not found.`,
            team.definition.name
          );
        }
      }

      const { members: targetMembers, manageMembers } = this.determineTargetMembers(
        team.definition,
        team.members
      );

      const diff: TeamDiff = calculateTeamDiff({
        definition: team.definition,
        slug,
        targetMembers,
        manageMembers,
        existingTeam: existingState,
        parentTeamId: parentTeamId ?? null,
        targetParentSlug: parentSlug,
      });

      if (!hasTeamChanges(diff)) {
        stats.skipped += 1;
        this.recordFinding(findings, 'info', 'Team is already in desired state.', diff.team);
        continue;
      }

      hasChanges = true;

      try {
        const outcome = await applyTeamDiffs(this.github, diff, {
          dryRun,
          logger: this.logger,
          owner,
        });

        if (!dryRun) {
          // Refresh cache for newly created or updated teams
          const teamSummary = await this.github.getTeamBySlug(owner, outcome.slug);
          if (teamSummary) {
            existingTeamsMap.set(outcome.slug, teamSummary);
          }
        }

        if (outcome.created) {
          stats.created += 1;
          this.recordFinding(findings, 'info', 'Team created.', diff.team);
        }
        const wasUpdated = !outcome.created && (outcome.updatedMetadata || outcome.updatedMembers);

        if (outcome.updatedMetadata) {
          this.recordFinding(findings, 'info', 'Team metadata updated.', diff.team);
        }

        if (outcome.updatedMembers) {
          this.recordFinding(findings, 'info', 'Team memberships updated.', diff.team);
        }

        if (wasUpdated) {
          stats.updated += 1;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        hasErrors = true;
        this.logger.error(`Failed to synchronize team ${slug}: ${message}`);
        this.recordFinding(findings, 'error', 'Failed to synchronize team.', diff.team, {
          error: message,
        });
      }
    }

    if (this.config.unmanaged_teams === 'warn') {
      const configuredSlugs = new Set(
        teamsToProcess.map((team) => slugifyTeamName(team.definition.name))
      );
      const unmanaged = [...existingTeamsMap.keys()].filter((slug) => !configuredSlugs.has(slug));
      if (unmanaged.length > 0) {
        this.recordFinding(
          findings,
          'warning',
          'Teams exist in GitHub that are not managed by configuration.',
          undefined,
          { teams: unmanaged }
        );
      }
    } else if (this.config.unmanaged_teams === 'remove') {
      this.recordFinding(
        findings,
        'warning',
        'Removal of unmanaged teams is not implemented yet.',
        undefined
      );
    }

    const summary = dryRun
      ? `Preview: processed ${stats.processed} team(s) (created ${stats.created}, updated ${stats.updated}, skipped ${stats.skipped}).`
      : `Processed ${stats.processed} team(s) (created ${stats.created}, updated ${stats.updated}, skipped ${stats.skipped}).`;

    return {
      hasChanges,
      hasErrors,
      findings,
      summary,
      stats,
    };
  }
}
