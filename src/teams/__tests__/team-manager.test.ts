import type { TeamsConfig } from '../../config/types';
import type { GitHubClient } from '../../github';
import type { GitHubTeamSummary } from '../../github/types';
import type { Logger } from '../../logging';
import { TeamManager } from '../manager';

const noop = (): void => {
  /* intentional no-op */
};

const testLogger: Logger = {
  info: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
  debug: noop,
  startGroup: noop,
  endGroup: noop,
};

describe('TeamManager', () => {
  const baseGithub = {
    getOwner: jest.fn().mockReturnValue('test-org'),
    listOrganizationTeams: jest.fn().mockResolvedValue([]),
    listOrganizationMembers: jest.fn().mockResolvedValue([{ login: 'octocat' }]),
    listTeamMembers: jest.fn().mockResolvedValue([]),
    createTeam: jest.fn().mockResolvedValue({
      id: 101,
      name: 'all',
      slug: 'all',
      description: 'All members',
      privacy: 'closed',
      notification_setting: 'notifications_enabled',
      parent: null,
    } satisfies GitHubTeamSummary),
    updateTeam: jest.fn(),
    addOrUpdateTeamMembership: jest.fn(),
    removeTeamMembership: jest.fn(),
    getTeamBySlug: jest.fn().mockResolvedValue({
      id: 101,
      slug: 'all',
      name: 'all',
      description: 'All members',
      privacy: 'closed',
      notification_setting: 'notifications_enabled',
      parent: null,
    }),
  } as unknown as GitHubClient;

  beforeEach(() => {
    jest.clearAllMocks();
    (baseGithub.getOwner as jest.Mock).mockReturnValue('test-org');
    (baseGithub.listOrganizationTeams as jest.Mock).mockResolvedValue([]);
    (baseGithub.listOrganizationMembers as jest.Mock).mockResolvedValue([{ login: 'octocat' }]);
    (baseGithub.createTeam as jest.Mock).mockResolvedValue({
      id: 101,
      name: 'all',
      slug: 'all',
      description: 'All members',
      privacy: 'closed',
      notification_setting: 'notifications_enabled',
      parent: null,
    });
  });

  it('returns an empty result when no config is provided', async () => {
    const manager = new TeamManager(baseGithub, undefined, testLogger);
    const result = await manager.sync();

    expect(result.hasChanges).toBe(false);
    expect(result.stats.processed).toBe(0);
    expect(result.summary).toContain('No team configuration');
  });

  it('performs dry-run synchronization for dynamic all-org-members rule', async () => {
    const config: TeamsConfig = {
      dynamic_rules: [
        {
          name: 'all',
          type: 'all_org_members',
        },
      ],
      dry_run: true,
    };

    const manager = new TeamManager(baseGithub, config, testLogger, { dryRun: true });
    const result = await manager.sync();

    expect(result.hasChanges).toBe(true);
    expect(result.stats.created).toBeGreaterThanOrEqual(1);
    expect(baseGithub.createTeam).not.toHaveBeenCalled();
  });

  it('creates team and adds members when not in dry-run', async () => {
    const config: TeamsConfig = {
      dynamic_rules: [
        {
          name: 'all',
          type: 'all_org_members',
          description: 'All organization members',
        },
      ],
    };

    const manager = new TeamManager(baseGithub, config, testLogger, { dryRun: false });
    const result = await manager.sync();

    expect(baseGithub.createTeam).toHaveBeenCalledWith(
      'test-org',
      expect.objectContaining({ name: 'all', description: 'All organization members' })
    );
    expect(baseGithub.addOrUpdateTeamMembership).toHaveBeenCalledWith(
      'test-org',
      'all',
      'octocat',
      'member'
    );
    expect(result.stats.created).toBeGreaterThanOrEqual(1);
  });

  it('updates existing team metadata and memberships', async () => {
    (baseGithub.listOrganizationTeams as jest.Mock).mockResolvedValue([
      {
        id: 10,
        name: 'platform',
        slug: 'platform',
        description: 'Old description',
        privacy: 'secret',
        notification_setting: 'notifications_enabled',
        parent: null,
      },
    ] satisfies GitHubTeamSummary[]);
    (baseGithub.listTeamMembers as jest.Mock).mockResolvedValue([
      { login: 'octocat', role: 'member' },
      { login: 'hubot', role: 'maintainer' },
    ]);

    const config: TeamsConfig = {
      definitions: [
        {
          name: 'platform',
          description: 'New description',
          privacy: 'closed',
          notification_setting: 'notifications_disabled',
          members: [{ username: 'octocat', role: 'maintainer' }],
        },
      ],
    };

    const manager = new TeamManager(baseGithub, config, testLogger);
    const result = await manager.sync();

    expect(baseGithub.updateTeam).toHaveBeenCalledWith(
      'test-org',
      'platform',
      expect.objectContaining({
        name: 'platform',
        notification_setting: 'notifications_disabled',
      })
    );
    expect(baseGithub.addOrUpdateTeamMembership).toHaveBeenCalledWith(
      'test-org',
      'platform',
      'octocat',
      'maintainer'
    );
    expect(baseGithub.removeTeamMembership).toHaveBeenCalledWith('test-org', 'platform', 'hubot');
    expect(result.stats.updated).toBeGreaterThanOrEqual(1);
  });

  it('returns error when organization owner is missing', async () => {
    const github = {
      getOwner: jest.fn().mockReturnValue(undefined),
    } as unknown as GitHubClient;

    const manager = new TeamManager(github, { definitions: [] }, testLogger);
    const result = await manager.sync();

    expect(result.hasErrors).toBe(true);
    expect(result.summary).toContain('missing organization owner');
  });

  it('warns about unmanaged teams when configured', async () => {
    (baseGithub.listOrganizationTeams as jest.Mock).mockResolvedValue([
      {
        id: 20,
        name: 'legacy',
        slug: 'legacy',
        description: 'Legacy team',
        privacy: 'closed',
        notification_setting: 'notifications_enabled',
        parent: null,
      },
    ] satisfies GitHubTeamSummary[]);

    const config: TeamsConfig = {
      definitions: [{ name: 'platform' }],
      unmanaged_teams: 'warn',
      dry_run: true,
    };

    const manager = new TeamManager(baseGithub, config, testLogger, { dryRun: true });
    const result = await manager.sync();

    expect(result.findings.some((f) => f.level === 'warning')).toBe(true);
  });
});
