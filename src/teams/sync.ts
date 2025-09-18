import type { GitHubClient } from '../github';
import type { Logger } from '../logging';
import type { TeamDiff } from './types';

interface ApplyTeamDiffOptions {
  dryRun: boolean;
  logger: Logger;
}

export async function applyTeamDiffs(
  _github: GitHubClient,
  diff: TeamDiff,
  options: ApplyTeamDiffOptions
): Promise<void> {
  const { logger, dryRun } = options;
  const prefix = dryRun ? '[dry-run] ' : '';
  logger.warning(
    `${prefix}Team synchronization for ${diff.team} is not implemented; skipping apply step.`
  );
}
