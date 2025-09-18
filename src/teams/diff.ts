import type { TeamDefinition } from '../config/types';
import type { GitHubClient } from '../github';
import type { TeamDiff } from './types';

export async function calculateTeamDiff(
  _github: GitHubClient,
  definition: TeamDefinition
): Promise<TeamDiff> {
  const changes: TeamDiff['changes'] = {
    membersToAdd: definition.members ?? [],
    membersToRemove: [],
    membersToUpdateRole: [],
  };

  if (definition.description !== undefined) {
    changes.description = { new: definition.description };
  }

  if (definition.privacy !== undefined) {
    changes.privacy = { new: definition.privacy };
  }

  if (definition.parent !== undefined) {
    changes.parent = { new: definition.parent ?? null };
  }

  return {
    team: definition.name,
    exists: false,
    changes,
  };
}
