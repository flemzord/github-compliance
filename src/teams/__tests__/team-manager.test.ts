import type { TeamsConfig } from '../../config/types';
import type { GitHubClient } from '../../github';
import type { Logger } from '../../logging';
import { TeamManager } from '../manager';

const noop = (): void => {
  /* intentional no-op */
};

const testLogger: Logger = {
  info: noop,
  warning: noop,
  error: noop,
  debug: noop,
  startGroup: noop,
  endGroup: noop,
};

describe('TeamManager', () => {
  const github = {} as unknown as GitHubClient;

  it('returns an empty result when no config is provided', async () => {
    const manager = new TeamManager(github, undefined, testLogger);
    const result = await manager.sync();

    expect(result.hasChanges).toBe(false);
    expect(result.stats.processed).toBe(0);
    expect(result.summary).toContain('No team configuration');
  });

  it('reports that synchronization is not implemented yet', async () => {
    const config: TeamsConfig = {
      definitions: [
        {
          name: 'platform',
          members: [{ username: 'octocat' }],
        },
      ],
    };

    const manager = new TeamManager(github, config, testLogger);
    const result = await manager.sync();

    expect(result.stats.processed).toBe(1);
    expect(result.summary).toContain('not yet implemented');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.level).toBe('info');
  });
});
