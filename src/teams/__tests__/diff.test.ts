import type { TeamDefinition, TeamMember } from '../../config/types';
import { calculateTeamDiff } from '../diff';
import type { GitHubTeamState } from '../types';

describe('teams/diff', () => {
  const baseDefinition: TeamDefinition = {
    name: 'platform',
    description: 'Platform team',
    privacy: 'closed',
  };

  it('includes new members and metadata changes', () => {
    const definition: TeamDefinition = {
      ...baseDefinition,
      parent: 'engineering',
      notification_setting: 'notifications_disabled',
      members: [{ username: 'octocat', role: 'maintainer' }, { username: 'hubot' }],
    };

    const diff = calculateTeamDiff({
      definition,
      slug: 'platform',
      targetMembers: definition.members as TeamMember[],
      manageMembers: true,
      existingTeam: null,
      parentTeamId: null,
      targetParentSlug: 'engineering',
    });

    expect(diff.exists).toBe(false);
    expect(diff.changes.description?.new).toBe('Platform team');
    expect(diff.changes.privacy?.new).toBe('closed');
    expect(diff.changes.parent?.new).toBe('engineering');
    expect(diff.changes.notification_setting?.new).toBe('notifications_disabled');
    expect(diff.changes.membersToAdd).toHaveLength(2);
    expect(diff.changes.membersToRemove).toEqual([]);
    expect(diff.changes.membersToUpdateRole).toEqual([]);
  });

  it('finds differences for existing team', () => {
    const existingTeam: GitHubTeamState = {
      id: 42,
      name: 'platform',
      slug: 'platform',
      description: 'Old description',
      parent: 'engineering',
      privacy: 'secret',
      notification_setting: 'notifications_enabled',
      members: [
        { username: 'octocat', role: 'member' },
        { username: 'hubot', role: 'maintainer' },
      ],
    };

    const definition: TeamDefinition = {
      ...baseDefinition,
      description: 'New description',
      privacy: 'closed',
      notification_setting: 'notifications_disabled',
      members: [{ username: 'octocat', role: 'maintainer' }],
    };

    const diff = calculateTeamDiff({
      definition,
      slug: 'platform',
      targetMembers: definition.members ?? [],
      manageMembers: true,
      existingTeam,
      parentTeamId: null,
      targetParentSlug: null,
    });

    expect(diff.exists).toBe(true);
    expect(diff.changes.description?.old).toBe('Old description');
    expect(diff.changes.description?.new).toBe('New description');
    expect(diff.changes.privacy?.old).toBe('secret');
    expect(diff.changes.privacy?.new).toBe('closed');
    expect(diff.changes.notification_setting?.new).toBe('notifications_disabled');
    expect(diff.changes.membersToAdd).toEqual([]);
    expect(diff.changes.membersToRemove).toEqual(['hubot']);
    expect(diff.changes.membersToUpdateRole).toEqual([
      { username: 'octocat', newRole: 'maintainer' },
    ]);
  });
});
