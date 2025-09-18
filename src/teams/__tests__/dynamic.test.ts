import type { TeamsConfig } from '../../config/types';
import type { GitHubClient } from '../../github';
import type { Logger } from '../../logging';
import { resolveTeams } from '../dynamic';

describe('teams/dynamic', () => {
  const github = {} as unknown as GitHubClient;

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
    const config: TeamsConfig = {
      definitions: [{ name: 'platform', members: [{ username: 'octocat' }] }],
      dynamic_rules: [{ name: 'all-members', type: 'all_org_members' }],
    };

    const resolved = await resolveTeams(github, config, { logger, dryRun: true });

    expect(resolved.staticTeams).toHaveLength(1);
    expect(resolved.staticTeams[0]?.definition.name).toBe('platform');
    expect(resolved.staticTeams[0]?.members).toEqual([{ username: 'octocat' }]);

    expect(resolved.dynamicTeams).toHaveLength(1);
    expect(resolved.dynamicTeams[0]?.definition.name).toBe('all-members');
    expect(resolved.dynamicTeams[0]?.rule?.name).toBe('all-members');
    expect(logger.debug).toHaveBeenCalledWith(
      'Dynamic team rules detected but the resolution engine is not implemented yet.'
    );
  });

  it('handles missing team definitions gracefully', async () => {
    const config: TeamsConfig = {};

    const resolved = await resolveTeams(github, config, { logger, dryRun: false });

    expect(resolved.staticTeams).toEqual([]);
    expect(resolved.dynamicTeams).toEqual([]);
    expect(logger.debug).not.toHaveBeenCalled();
  });
});
