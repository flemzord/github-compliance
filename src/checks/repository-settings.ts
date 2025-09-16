import type { GitHubClient } from '../github';
import * as logger from '../logging';
import { BaseCheck, type CheckContext, type CheckResult } from './base';
import type {
  CheckAction,
  CheckDetails,
  RepositoryUpdateSettings,
  RepositoryWithSettings,
} from './types';

interface VisibilityState {
  private: boolean;
  visibility: string;
}

export class RepositorySettingsCheck extends BaseCheck {
  readonly name = 'repository-settings';
  readonly description = 'Verify repository feature toggles, visibility, and workflow settings';

  private readonly issueTemplatePaths = [
    '.github/ISSUE_TEMPLATE',
    '.github/ISSUE_TEMPLATE.md',
    'ISSUE_TEMPLATE.md',
  ];

  private readonly pullRequestTemplatePaths = [
    '.github/pull_request_template.md',
    '.github/PULL_REQUEST_TEMPLATE.md',
    'PULL_REQUEST_TEMPLATE.md',
    '.github/PULL_REQUEST_TEMPLATE',
  ];

  shouldRun(context: CheckContext): boolean {
    const config = this.getRepoConfig(context, 'repository_settings');
    return config !== undefined;
  }

  async check(context: CheckContext): Promise<CheckResult> {
    try {
      const config = this.getRepoConfig(context, 'repository_settings');
      if (!config) {
        return this.createCompliantResult('No repository settings configuration specified');
      }

      const { owner, repo } = this.getRepoInfo(context.repository);
      const repository = (await context.client.getRepository(
        owner,
        repo
      )) as unknown as RepositoryWithSettings;
      const issues: string[] = [];
      const actions: CheckAction[] = [];

      const featureState = this.getFeatureState(repository);
      const visibilityState = this.getVisibilityState(repository, context.repository.private);
      const generalState = this.getGeneralState(repository);
      const templateState: Record<string, unknown> = {};

      if (config.features) {
        for (const [key, expected] of Object.entries(config.features)) {
          if (expected === undefined) continue;
          const current = featureState[key];
          if (current === undefined) {
            issues.push(`Unable to determine current value for ${key}`);
            continue;
          }
          if (current !== expected) {
            issues.push(
              `${key.replace(/_/g, ' ')} should be ${expected ? 'enabled' : 'disabled'} but is ${
                current ? 'enabled' : 'disabled'
              }`
            );
          }
        }
      }

      if (config.visibility) {
        if (config.visibility.enforce_private && !visibilityState.private) {
          issues.push('Repository must be private but is not');
        }

        if (config.visibility.allow_public === false && visibilityState.visibility === 'public') {
          issues.push('Public repositories are not allowed by policy');
        }
      }

      if (config.general) {
        for (const [key, expected] of Object.entries(config.general)) {
          if (expected === undefined) continue;
          const current = generalState[key];
          if (current === undefined) {
            issues.push(`Unable to determine current value for ${key}`);
            continue;
          }
          if (current !== expected) {
            issues.push(
              `${key.replace(/_/g, ' ')} should be ${expected ? 'enabled' : 'disabled'} but is ${
                current ? 'enabled' : 'disabled'
              }`
            );
          }
        }
      }

      if (config.templates) {
        if (config.templates.require_issue_templates !== undefined) {
          const hasTemplates = await this.hasIssueTemplates(context.client, owner, repo);
          templateState.issue_templates_present = hasTemplates;
          if (config.templates.require_issue_templates && !hasTemplates) {
            issues.push('Issue templates are required but were not found');
            actions.push({
              action: 'create_issue_templates',
              recommended_paths: this.issueTemplatePaths,
            });
          }
        }

        if (config.templates.require_pr_template !== undefined) {
          const hasTemplate = await this.hasPullRequestTemplate(context.client, owner, repo);
          templateState.pull_request_template_present = hasTemplate;
          if (config.templates.require_pr_template && !hasTemplate) {
            issues.push('Pull request template is required but was not found');
            actions.push({
              action: 'create_pull_request_template',
              recommended_paths: this.pullRequestTemplatePaths,
            });
          }
        }
      }

      const details: CheckDetails = {
        current: {
          features: featureState,
          visibility: visibilityState,
          general: generalState,
          templates: templateState,
        },
        expected: config,
      };

      if (actions.length > 0) {
        details.actions_needed = actions;
      }

      if (issues.length === 0) {
        return this.createCompliantResult('Repository settings comply with policy', details);
      }

      return this.createNonCompliantResult(
        `Repository settings configuration issues: ${issues.join('; ')}`,
        details
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        `Failed to check repository settings for ${context.repository.full_name}: ${errorMessage}`
      );
      return this.createErrorResult(
        'Failed to evaluate repository settings configuration',
        errorMessage
      );
    }
  }

  async fix(context: CheckContext): Promise<CheckResult> {
    if (context.dryRun) {
      return this.check(context);
    }

    try {
      const config = this.getRepoConfig(context, 'repository_settings');
      if (!config) {
        return this.createCompliantResult('No repository settings configuration to apply');
      }

      const initialResult = await this.check({ ...context, dryRun: true });
      if (initialResult.compliant) {
        return initialResult;
      }

      const { owner, repo } = this.getRepoInfo(context.repository);
      const repository = (await context.client.getRepository(
        owner,
        repo
      )) as unknown as RepositoryWithSettings;
      const updateData: RepositoryUpdateSettings = {};

      if (config.features) {
        if (
          config.features.has_issues !== undefined &&
          repository.has_issues !== config.features.has_issues
        ) {
          updateData.has_issues = config.features.has_issues;
        }
        if (
          config.features.has_projects !== undefined &&
          repository.has_projects !== config.features.has_projects
        ) {
          updateData.has_projects = config.features.has_projects;
        }
        if (
          config.features.has_wiki !== undefined &&
          repository.has_wiki !== config.features.has_wiki
        ) {
          updateData.has_wiki = config.features.has_wiki;
        }
        if (
          config.features.has_discussions !== undefined &&
          repository.has_discussions !== config.features.has_discussions
        ) {
          updateData.has_discussions = config.features.has_discussions;
        }
        if (
          config.features.has_pages !== undefined &&
          repository.has_pages !== config.features.has_pages
        ) {
          updateData.has_pages = config.features.has_pages;
        }
      }

      if (config.general) {
        if (
          config.general.allow_auto_merge !== undefined &&
          repository.allow_auto_merge !== config.general.allow_auto_merge
        ) {
          updateData.allow_auto_merge = config.general.allow_auto_merge;
        }
        if (
          config.general.delete_branch_on_merge !== undefined &&
          repository.delete_branch_on_merge !== config.general.delete_branch_on_merge
        ) {
          updateData.delete_branch_on_merge = config.general.delete_branch_on_merge;
        }
        if (
          config.general.allow_update_branch !== undefined &&
          repository.allow_update_branch !== config.general.allow_update_branch
        ) {
          updateData.allow_update_branch = config.general.allow_update_branch;
        }
        if (
          config.general.use_squash_pr_title_as_default !== undefined &&
          repository.use_squash_pr_title_as_default !==
            config.general.use_squash_pr_title_as_default
        ) {
          updateData.use_squash_pr_title_as_default = config.general.use_squash_pr_title_as_default;
        }
        if (
          config.general.allow_merge_commit !== undefined &&
          repository.allow_merge_commit !== config.general.allow_merge_commit
        ) {
          updateData.allow_merge_commit = config.general.allow_merge_commit;
        }
        if (
          config.general.allow_squash_merge !== undefined &&
          repository.allow_squash_merge !== config.general.allow_squash_merge
        ) {
          updateData.allow_squash_merge = config.general.allow_squash_merge;
        }
        if (
          config.general.allow_rebase_merge !== undefined &&
          repository.allow_rebase_merge !== config.general.allow_rebase_merge
        ) {
          updateData.allow_rebase_merge = config.general.allow_rebase_merge;
        }
      }

      if (config.visibility) {
        const visibilityState = this.getVisibilityState(repository, context.repository.private);
        if (config.visibility.enforce_private && !visibilityState.private) {
          updateData.private = true;
        } else if (
          config.visibility.allow_public === false &&
          visibilityState.visibility === 'public'
        ) {
          updateData.private = true;
        }
      }

      if (Object.keys(updateData).length === 0) {
        return initialResult;
      }

      await context.client.updateRepository(owner, repo, updateData);
      logger.info(`✅ Updated repository settings for ${context.repository.full_name}`);

      const postCheck = await this.check({ ...context, dryRun: true });
      if (!postCheck.compliant) {
        return postCheck;
      }

      return this.createFixedResult('Repository settings configuration has been updated', {
        applied: updateData,
        previous: initialResult.details?.current,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        `Failed to update repository settings for ${context.repository.full_name}: ${errorMessage}`
      );
      return this.createErrorResult(
        'Failed to apply repository settings configuration',
        errorMessage
      );
    }
  }

  private getFeatureState(repository: RepositoryWithSettings): Record<string, boolean | undefined> {
    return {
      has_issues: repository.has_issues,
      has_projects: repository.has_projects,
      has_wiki: repository.has_wiki,
      has_discussions: repository.has_discussions,
      has_pages: repository.has_pages,
    };
  }

  private getGeneralState(repository: RepositoryWithSettings): Record<string, boolean | undefined> {
    return {
      allow_auto_merge: repository.allow_auto_merge,
      delete_branch_on_merge: repository.delete_branch_on_merge,
      allow_update_branch: repository.allow_update_branch,
      use_squash_pr_title_as_default: repository.use_squash_pr_title_as_default,
      allow_merge_commit: repository.allow_merge_commit,
      allow_squash_merge: repository.allow_squash_merge,
      allow_rebase_merge: repository.allow_rebase_merge,
    };
  }

  private getVisibilityState(
    repository: RepositoryWithSettings,
    fallbackPrivate: boolean
  ): VisibilityState {
    const isPrivate = repository.private ?? fallbackPrivate;
    const visibility = repository.visibility || (isPrivate ? 'private' : 'public');
    return {
      private: Boolean(isPrivate),
      visibility,
    };
  }

  private async hasIssueTemplates(
    client: GitHubClient,
    owner: string,
    repo: string
  ): Promise<boolean> {
    for (const path of this.issueTemplatePaths) {
      if (await client.pathExists(owner, repo, path)) {
        return true;
      }
    }
    return false;
  }

  private async hasPullRequestTemplate(
    client: GitHubClient,
    owner: string,
    repo: string
  ): Promise<boolean> {
    for (const path of this.pullRequestTemplatePaths) {
      if (await client.pathExists(owner, repo, path)) {
        return true;
      }
    }
    return false;
  }
}
