import type { GitHubClient } from '../github';
import type { Logger } from '../logging';
import type { TeamDiff } from './types';

interface ApplyTeamDiffOptions {
  dryRun: boolean;
  logger: Logger;
  owner: string;
}

export interface ApplyTeamDiffOutcome {
  created: boolean;
  updatedMetadata: boolean;
  updatedMembers: boolean;
  slug: string;
}

function describeChanges(diff: TeamDiff): string {
  const changes: string[] = [];

  if (!diff.exists) {
    changes.push('create team');
  }
  if (diff.changes.description) {
    changes.push('update description');
  }
  if (diff.changes.privacy) {
    changes.push('update privacy');
  }
  if (diff.changes.parent) {
    changes.push('update parent');
  }
  if (diff.changes.notification_setting) {
    changes.push('update notifications');
  }
  if (diff.manageMembers) {
    if (diff.changes.membersToAdd.length > 0) {
      changes.push(`add ${diff.changes.membersToAdd.length} member(s)`);
    }
    if (diff.changes.membersToRemove.length > 0) {
      changes.push(`remove ${diff.changes.membersToRemove.length} member(s)`);
    }
    if (diff.changes.membersToUpdateRole.length > 0) {
      changes.push(`update ${diff.changes.membersToUpdateRole.length} role(s)`);
    }
  }

  if (changes.length === 0) {
    return 'no changes required';
  }

  return changes.join(', ');
}

export async function applyTeamDiffs(
  github: GitHubClient,
  diff: TeamDiff,
  options: ApplyTeamDiffOptions
): Promise<ApplyTeamDiffOutcome> {
  const { logger, dryRun, owner } = options;

  const summary = describeChanges(diff);

  if (dryRun) {
    logger.info(`[dry-run] Team ${diff.slug}: ${summary}`);
    return {
      created: !diff.exists && summary !== 'no changes required',
      updatedMetadata:
        !!diff.exists &&
        Boolean(
          diff.changes.description ||
            diff.changes.privacy ||
            diff.changes.parent ||
            diff.changes.notification_setting
        ),
      updatedMembers:
        diff.manageMembers &&
        (diff.changes.membersToAdd.length > 0 ||
          diff.changes.membersToRemove.length > 0 ||
          diff.changes.membersToUpdateRole.length > 0),
      slug: diff.slug,
    };
  }

  logger.info(`Synchronizing team ${diff.slug}: ${summary}`);

  let currentSlug = diff.slug;
  let created = false;
  let updatedMetadata = false;
  let updatedMembers = false;

  // Create team if needed
  if (!diff.exists) {
    const createParams: {
      name: string;
      description?: string;
      privacy?: 'secret' | 'closed';
      parent_team_id?: number;
      notification_setting?: 'notifications_enabled' | 'notifications_disabled';
    } = {
      name: diff.definition.name,
    };

    if (diff.definition.description !== undefined) {
      createParams.description = diff.definition.description;
    }
    if (diff.definition.privacy !== undefined) {
      createParams.privacy = diff.definition.privacy;
    }
    if (diff.definition.notification_setting !== undefined) {
      createParams.notification_setting = diff.definition.notification_setting;
    }
    if (diff.targetParentId !== undefined && diff.targetParentId !== null) {
      createParams.parent_team_id = diff.targetParentId;
    }

    const createdTeam = await github.createTeam(owner, createParams);
    currentSlug = createdTeam.slug;
    created = true;
  } else if (
    diff.changes.description ||
    diff.changes.privacy ||
    diff.changes.parent ||
    diff.changes.notification_setting
  ) {
    const updateParams: {
      name?: string;
      description?: string | null;
      privacy?: 'secret' | 'closed';
      parent_team_id?: number | null;
      notification_setting?: 'notifications_enabled' | 'notifications_disabled';
    } = {};

    updateParams.name = diff.definition.name;

    if (diff.definition.description !== undefined) {
      updateParams.description = diff.definition.description;
    }
    if (diff.definition.privacy !== undefined) {
      updateParams.privacy = diff.definition.privacy;
    }
    if (diff.definition.notification_setting !== undefined) {
      updateParams.notification_setting = diff.definition.notification_setting;
    }
    if (diff.targetParentId !== undefined) {
      updateParams.parent_team_id = diff.targetParentId;
    }

    await github.updateTeam(owner, currentSlug, updateParams);
    updatedMetadata = true;
  }

  if (diff.manageMembers) {
    for (const member of diff.changes.membersToAdd) {
      await github.addOrUpdateTeamMembership(
        owner,
        currentSlug,
        member.username,
        member.role ?? 'member'
      );
      updatedMembers = true;
    }

    for (const member of diff.changes.membersToUpdateRole) {
      await github.addOrUpdateTeamMembership(owner, currentSlug, member.username, member.newRole);
      updatedMembers = true;
    }

    for (const username of diff.changes.membersToRemove) {
      await github.removeTeamMembership(owner, currentSlug, username);
      updatedMembers = true;
    }
  }

  return {
    created,
    updatedMetadata,
    updatedMembers,
    slug: currentSlug,
  };
}
