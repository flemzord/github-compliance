import type { TeamDefinition, TeamMember } from '../config/types';
import type { GitHubTeamState, TeamDiff } from './types';

interface CalculateTeamDiffParams {
  definition: TeamDefinition;
  slug: string;
  targetMembers: TeamMember[];
  manageMembers: boolean;
  existingTeam: GitHubTeamState | null;
  parentTeamId?: number | null;
  targetParentSlug?: string | null;
}

function normalizeString(value?: string | null): string | null {
  if (value === undefined || value === null || value.trim() === '') {
    return null;
  }
  return value.trim();
}

function normalizeNotificationSetting(
  value?: 'notifications_enabled' | 'notifications_disabled' | null
): 'notifications_enabled' | 'notifications_disabled' | null {
  if (!value) {
    return null;
  }
  return value;
}

function compareMembers(
  currentMembers: TeamMember[],
  targetMembers: TeamMember[],
  manageMembers: boolean
): {
  membersToAdd: TeamMember[];
  membersToRemove: string[];
  membersToUpdateRole: { username: string; newRole: 'member' | 'maintainer' }[];
} {
  if (!manageMembers) {
    return {
      membersToAdd: [],
      membersToRemove: [],
      membersToUpdateRole: [],
    };
  }

  const currentMap = new Map<string, TeamMember>();
  for (const member of currentMembers) {
    currentMap.set(member.username.toLowerCase(), member);
  }

  const targetMap = new Map<string, TeamMember>();
  for (const member of targetMembers) {
    targetMap.set(member.username.toLowerCase(), member);
  }

  const membersToAdd: TeamMember[] = [];
  const membersToRemove: string[] = [];
  const membersToUpdateRole: { username: string; newRole: 'member' | 'maintainer' }[] = [];

  for (const [username, targetMember] of targetMap.entries()) {
    const existing = currentMap.get(username);
    if (!existing) {
      membersToAdd.push(targetMember);
      continue;
    }

    const existingRole = existing.role ?? 'member';
    const desiredRole = targetMember.role ?? 'member';
    if (existingRole !== desiredRole) {
      membersToUpdateRole.push({ username: targetMember.username, newRole: desiredRole });
    }
  }

  for (const [username, member] of currentMap.entries()) {
    if (!targetMap.has(username)) {
      membersToRemove.push(member.username);
    }
  }

  return { membersToAdd, membersToRemove, membersToUpdateRole };
}

export function calculateTeamDiff({
  definition,
  slug,
  targetMembers,
  manageMembers,
  existingTeam,
  parentTeamId,
  targetParentSlug,
}: CalculateTeamDiffParams): TeamDiff {
  const currentDescription = normalizeString(existingTeam?.description);
  const targetDescription = normalizeString(definition.description ?? null);

  const currentPrivacy = existingTeam?.privacy ?? null;
  const targetPrivacy: 'closed' | 'secret' = definition.privacy
    ? definition.privacy
    : existingTeam && currentPrivacy
      ? currentPrivacy
      : 'closed';

  const currentParent = existingTeam?.parent ?? null;
  const parentSlug = targetParentSlug ?? (definition.parent ? definition.parent : null);

  const currentNotification = normalizeNotificationSetting(
    existingTeam?.notification_setting ?? null
  );
  const targetNotification = normalizeNotificationSetting(
    definition.notification_setting ?? (existingTeam ? currentNotification : null)
  );

  const membersDiff = compareMembers(existingTeam?.members ?? [], targetMembers, manageMembers);

  const changes = {
    membersToAdd: membersDiff.membersToAdd,
    membersToRemove: membersDiff.membersToRemove,
    membersToUpdateRole: membersDiff.membersToUpdateRole,
  } as TeamDiff['changes'];

  if (currentDescription !== targetDescription) {
    changes.description = {
      old: currentDescription ?? null,
      new: targetDescription ?? null,
    };
  }

  if (currentPrivacy !== targetPrivacy) {
    changes.privacy = {
      old: currentPrivacy ?? null,
      new: targetPrivacy,
    };
  }

  if (currentParent !== parentSlug) {
    changes.parent = {
      old: currentParent ?? null,
      new: parentSlug ?? null,
    };
  }

  if (currentNotification !== targetNotification) {
    changes.notification_setting = {
      old: currentNotification,
      new: targetNotification ?? null,
    };
  }

  const diff: TeamDiff = {
    team: definition.name,
    slug,
    exists: existingTeam !== null,
    definition,
    targetMembers,
    manageMembers,
    targetParentId: parentTeamId ?? null,
    changes,
  };

  if (existingTeam?.id !== undefined) {
    diff.teamId = existingTeam.id;
  }

  return diff;
}
