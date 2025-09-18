import type { TeamDefinition } from '../../config/types';
import type { GitHubClient } from '../../github';
import { calculateTeamDiff } from '../diff';

describe('teams/diff', () => {
  const github = {} as unknown as GitHubClient;

  it('includes new members and metadata changes', async () => {
    const definition: TeamDefinition = {
      name: 'platform',
      description: 'Platform team',
      privacy: 'closed',
      parent: 'engineering',
      members: [{ username: 'octocat', role: 'maintainer' }, { username: 'hubot' }],
    };

    const diff = await calculateTeamDiff(github, definition);

    expect(diff.team).toBe('platform');
    expect(diff.exists).toBe(false);
    expect(diff.changes.description).toEqual({ new: 'Platform team' });
    expect(diff.changes.privacy).toEqual({ new: 'closed' });
    expect(diff.changes.parent).toEqual({ new: 'engineering' });
    expect(diff.changes.membersToAdd).toHaveLength(2);
    expect(diff.changes.membersToRemove).toEqual([]);
    expect(diff.changes.membersToUpdateRole).toEqual([]);
  });

  it('omits optional metadata when not provided', async () => {
    const definition: TeamDefinition = {
      name: 'support',
    };

    const diff = await calculateTeamDiff(github, definition);

    expect(diff.changes.description).toBeUndefined();
    expect(diff.changes.privacy).toBeUndefined();
    expect(diff.changes.parent).toBeUndefined();
    expect(diff.changes.membersToAdd).toEqual([]);
  });
});
