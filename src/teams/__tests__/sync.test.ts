import type { GitHubClient } from '../../github';
import type { Logger } from '../../logging';
import { applyTeamDiffs } from '../sync';
import type { TeamDiff } from '../types';

describe('teams/sync', () => {
  const github = {
    createTeam: jest.fn(),
    updateTeam: jest.fn(),
    addOrUpdateTeamMembership: jest.fn(),
    removeTeamMembership: jest.fn(),
  } as unknown as GitHubClient;

  const logger: Logger = {
    info: jest.fn(),
    warning: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    startGroup: jest.fn(),
    endGroup: jest.fn(),
  };

  const baseDiff: TeamDiff = {
    team: 'platform',
    slug: 'platform',
    definition: {
      name: 'platform',
    },
    targetMembers: [],
    manageMembers: false,
    exists: false,
    changes: {
      membersToAdd: [],
      membersToRemove: [],
      membersToUpdateRole: [],
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('logs a warning when synchronization is in dry run mode', async () => {
    const result = await applyTeamDiffs(github, baseDiff, {
      logger,
      dryRun: true,
      owner: 'test-org',
    });

    expect(logger.info).toHaveBeenCalledWith('[dry-run] Team platform: create team');
    expect(result.created).toBe(true);
    expect(result.slug).toBe('platform');
  });

  it('creates team when not existing', async () => {
    const diff: TeamDiff = {
      ...baseDiff,
      exists: false,
      manageMembers: true,
      targetMembers: [{ username: 'octocat', role: 'maintainer' }],
      changes: {
        description: { new: 'Platform team' },
        membersToAdd: [{ username: 'octocat', role: 'maintainer' }],
        membersToRemove: [],
        membersToUpdateRole: [],
      },
    };

    (github.createTeam as jest.Mock).mockResolvedValue({ slug: 'platform' });

    const result = await applyTeamDiffs(github, diff, {
      logger,
      dryRun: false,
      owner: 'test-org',
    });

    expect(github.createTeam).toHaveBeenCalledWith('test-org', expect.any(Object));
    expect(result.created).toBe(true);
  });

  it('updates metadata and memberships for existing team', async () => {
    const diff: TeamDiff = {
      ...baseDiff,
      exists: true,
      manageMembers: true,
      slug: 'platform',
      definition: {
        name: 'platform',
        description: 'Updated description',
        notification_setting: 'notifications_disabled',
      },
      targetMembers: [{ username: 'hubot', role: 'member' }],
      changes: {
        description: { old: 'Old', new: 'Updated description' },
        notification_setting: { old: 'notifications_enabled', new: 'notifications_disabled' },
        membersToAdd: [{ username: 'hubot', role: 'member' }],
        membersToRemove: ['octocat'],
        membersToUpdateRole: [],
      },
    };

    const result = await applyTeamDiffs(github, diff, {
      logger,
      dryRun: false,
      owner: 'test-org',
    });

    expect(github.updateTeam).toHaveBeenCalledWith(
      'test-org',
      'platform',
      expect.objectContaining({ notification_setting: 'notifications_disabled' })
    );
    expect(github.addOrUpdateTeamMembership).toHaveBeenCalledWith(
      'test-org',
      'platform',
      'hubot',
      'member'
    );
    expect(github.removeTeamMembership).toHaveBeenCalledWith('test-org', 'platform', 'octocat');
    expect(result.updatedMetadata).toBe(true);
    expect(result.updatedMembers).toBe(true);
  });
});
