import type { TeamsConfig } from '../../config/types';
import type { GitHubClient } from '../../github';
import type { Logger } from '../../logging';
import { resolveTeams } from '../dynamic';

describe('teams/dynamic', () => {
  const logger: Logger = {
    info: jest.fn(),
    warning: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    startGroup: jest.fn(),
    endGroup: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns static and dynamic teams', async () => {
    const github = {
      listOrganizationMembers: jest.fn().mockResolvedValue([{ login: 'octocat' }]),
    } as unknown as GitHubClient;

    const config: TeamsConfig = {
      definitions: [{ name: 'platform', members: [{ username: 'octocat' }] }],
      dynamic_rules: [{ name: 'all', type: 'all_org_members' }],
    };

    const resolved = await resolveTeams(github, config, { logger, dryRun: true }, 'test-org');

    expect(resolved.staticTeams).toHaveLength(1);
    expect(resolved.dynamicTeams).toHaveLength(1);
    expect(resolved.dynamicTeams[0]?.members).toEqual([{ username: 'octocat', role: 'member' }]);
  });

  it('warns about unsupported rule types', async () => {
    const github = {
      listOrganizationMembers: jest.fn().mockResolvedValue([]),
    } as unknown as GitHubClient;

    const config: TeamsConfig = {
      dynamic_rules: [
        { name: 'filter-rule', type: 'by_filter', filter: { usernames: ['octocat'] } },
        { name: 'composite-rule', type: 'composite', compose: { union: ['team-a'] } },
      ],
    };

    const resolved = await resolveTeams(github, config, { logger, dryRun: true }, 'test-org');

    expect(resolved.dynamicTeams).toHaveLength(0);
    expect(logger.warning).toHaveBeenCalledTimes(2);
  });
});
