import * as logger from '../logging';
import { BaseCheck, type CheckContext, type CheckResult } from './base';
import type { CheckDetails, RepositoryUpdateSettings, RepositoryWithMergeMethods } from './types';

export class MergeMethodsCheck extends BaseCheck {
  readonly name = 'merge-methods';
  readonly description = 'Verify repository merge methods configuration';

  shouldRun(context: CheckContext): boolean {
    const config = this.getRepoConfig(context, 'merge_methods');
    return config !== undefined;
  }

  async check(context: CheckContext): Promise<CheckResult> {
    try {
      const { repository } = context;
      const { owner, repo } = this.getRepoInfo(repository);
      const config = this.getRepoConfig(context, 'merge_methods');

      if (!config) {
        return this.createCompliantResult('No merge methods configuration specified');
      }

      // Get current repository settings
      const repoData = await context.client.getRepository(owner, repo);

      const issues: string[] = [];
      const repoWithMethods = repoData as unknown as RepositoryWithMergeMethods;
      const details: CheckDetails = {
        current: {
          allow_merge_commit: repoWithMethods.allow_merge_commit,
          allow_squash_merge: repoWithMethods.allow_squash_merge,
          allow_rebase_merge: repoWithMethods.allow_rebase_merge,
        },
        expected: config,
      };

      // Check merge commit
      if (
        config.allow_merge_commit !== undefined &&
        repoWithMethods.allow_merge_commit !== config.allow_merge_commit
      ) {
        issues.push(
          `Merge commits should be ${config.allow_merge_commit ? 'enabled' : 'disabled'} ` +
            `but is ${repoWithMethods.allow_merge_commit ? 'enabled' : 'disabled'}`
        );
      }

      // Check squash merge
      if (
        config.allow_squash_merge !== undefined &&
        repoWithMethods.allow_squash_merge !== config.allow_squash_merge
      ) {
        issues.push(
          `Squash merges should be ${config.allow_squash_merge ? 'enabled' : 'disabled'} ` +
            `but is ${repoWithMethods.allow_squash_merge ? 'enabled' : 'disabled'}`
        );
      }

      // Check rebase merge
      if (
        config.allow_rebase_merge !== undefined &&
        repoWithMethods.allow_rebase_merge !== config.allow_rebase_merge
      ) {
        issues.push(
          `Rebase merges should be ${config.allow_rebase_merge ? 'enabled' : 'disabled'} ` +
            `but is ${repoWithMethods.allow_rebase_merge ? 'enabled' : 'disabled'}`
        );
      }

      if (issues.length === 0) {
        return this.createCompliantResult(
          'Repository merge methods are configured correctly',
          details
        );
      }

      return this.createNonCompliantResult(
        `Merge methods configuration issues: ${issues.join(', ')}`,
        details
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        `Failed to check merge methods for ${context.repository.full_name}: ${errorMessage}`
      );
      return this.createErrorResult('Failed to check merge methods configuration', errorMessage);
    }
  }

  async fix(context: CheckContext): Promise<CheckResult> {
    if (context.dryRun) {
      return this.check(context);
    }

    try {
      const { repository } = context;
      const { owner, repo } = this.getRepoInfo(repository);
      const config = this.getRepoConfig(context, 'merge_methods');

      if (!config) {
        return this.createCompliantResult('No merge methods configuration to apply');
      }

      // First check current state
      const checkResult = await this.check({ ...context, dryRun: true });
      if (checkResult.compliant) {
        return checkResult;
      }

      // Apply fixes
      const updateData: RepositoryUpdateSettings = {};

      if (config.allow_merge_commit !== undefined) {
        updateData.allow_merge_commit = config.allow_merge_commit;
      }

      if (config.allow_squash_merge !== undefined) {
        updateData.allow_squash_merge = config.allow_squash_merge;
      }

      if (config.allow_rebase_merge !== undefined) {
        updateData.allow_rebase_merge = config.allow_rebase_merge;
      }

      // Update repository settings
      await context.client.updateRepository(owner, repo, updateData);

      logger.info(`✅ Updated merge methods for ${repository.full_name}`);

      return this.createFixedResult('Merge methods configuration has been updated', {
        applied: updateData,
        previous: checkResult.details?.current,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        `Failed to fix merge methods for ${context.repository.full_name}: ${errorMessage}`
      );
      return this.createErrorResult('Failed to update merge methods configuration', errorMessage);
    }
  }
}
