import type { GitHubClient } from '../../github';
import type { Logger } from '../../logging';
import { applyTeamDiffs } from '../sync';
import type { TeamDiff } from '../types';

describe('teams/sync', () => {
  const github = {} as unknown as GitHubClient;

  const logger: Logger = {
    info: jest.fn(),
    warning: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    startGroup: jest.fn(),
    endGroup: jest.fn(),
  };

  const diff: TeamDiff = {
    team: 'platform',
    exists: false,
    changes: {
      membersToAdd: [],
      membersToRemove: [],
      membersToUpdateRole: [],
    },
  };

  it('logs a warning when synchronization is not implemented in dry run', async () => {
    await applyTeamDiffs(github, diff, { logger, dryRun: true });

    expect(logger.warning).toHaveBeenCalledWith(
      '[dry-run] Team synchronization for platform is not implemented; skipping apply step.'
    );
  });

  it('logs a warning when synchronization is not implemented for real changes', async () => {
    await applyTeamDiffs(github, diff, { logger, dryRun: false });

    expect(logger.warning).toHaveBeenCalledWith(
      'Team synchronization for platform is not implemented; skipping apply step.'
    );
  });
});
