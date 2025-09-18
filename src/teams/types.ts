import type {
  DynamicTeamRule,
  TeamDefinition,
  TeamMember,
  TeamsConfig,
  UnmanagedTeamsMode,
} from '../config/types';

export type TeamSource = 'definition' | 'dynamic';

export interface ResolvedTeam {
  definition: TeamDefinition;
  members: TeamMember[];
  source: TeamSource;
  rule?: DynamicTeamRule;
}

export interface ResolvedTeams {
  staticTeams: ResolvedTeam[];
  dynamicTeams: ResolvedTeam[];
}

export interface GitHubTeamState {
  name: string;
  slug: string;
  description?: string | null;
  parent?: string | null;
  privacy?: 'closed' | 'secret';
  members: TeamMember[];
}

export interface TeamDiffChangeSet {
  description?: { old?: string | null; new?: string };
  privacy?: { old?: 'closed' | 'secret' | null; new?: 'closed' | 'secret' };
  parent?: { old?: string | null; new?: string | null };
  membersToAdd: TeamMember[];
  membersToRemove: string[];
  membersToUpdateRole: { username: string; newRole: 'member' | 'maintainer' }[];
}

export interface TeamDiff {
  team: string;
  exists: boolean;
  changes: TeamDiffChangeSet;
}

export type SyncFindingLevel = 'info' | 'warning' | 'error';

export interface SyncFinding {
  level: SyncFindingLevel;
  message: string;
  team?: string;
  details?: Record<string, unknown>;
}

export interface SyncStats {
  processed: number;
  created: number;
  updated: number;
  removed: number;
  skipped: number;
}

export interface SyncResult {
  hasChanges: boolean;
  hasErrors: boolean;
  findings: SyncFinding[];
  summary: string;
  stats: SyncStats;
}

export interface TeamSyncOptions {
  dryRun?: boolean;
  unmanagedTeams?: UnmanagedTeamsMode;
}

export interface TeamSynchronizationContext {
  config: TeamsConfig;
  owner?: string;
}
