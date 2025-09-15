import * as core from '@actions/core';
import { BaseCheck, type CheckContext, type CheckResult } from './base';
import type { AppliedAction, CheckDetails } from './types';

export class BranchProtectionCheck extends BaseCheck {
  readonly name = 'branch-protection';
  readonly description = 'Verify repository branch protection rules';

  shouldRun(context: CheckContext): boolean {
    const config = this.getRepoConfig(context, 'branch_protection');
    return config !== undefined;
  }

  async check(context: CheckContext): Promise<CheckResult> {
    try {
      const { repository } = context;
      const { owner, repo } = this.getRepoInfo(repository);
      const config = this.getRepoConfig(context, 'branch_protection');

      if (!config) {
        return this.createCompliantResult('No branch protection configuration specified');
      }

      const issues: string[] = [];
      const details: CheckDetails = {
        branches: {} as Record<string, unknown>,
        expected: config,
        actions_needed: [],
      };

      // Check each configured branch
      for (const [branchName, expectedRules] of Object.entries(config)) {
        const currentProtection = await context.client.getBranchProtection(owner, repo, branchName);
        (details.branches as Record<string, unknown>)[branchName] = {
          current: currentProtection,
          expected: expectedRules,
        };

        if (!currentProtection) {
          if (expectedRules) {
            issues.push(`Branch '${branchName}' should have protection rules but has none`);
            if (details.actions_needed) {
              details.actions_needed.push({
                action: 'enable_protection',
                branch: branchName,
                rules: expectedRules,
              });
            }
          }
          continue;
        }

        // Check required status checks
        if (expectedRules.required_status_checks !== undefined) {
          const current = currentProtection.required_status_checks;
          const expected = expectedRules.required_status_checks;

          if (!current && expected) {
            issues.push(`Branch '${branchName}' should require status checks`);
            if (details.actions_needed) {
              details.actions_needed.push({
                action: 'update_protection',
                branch: branchName,
                field: 'required_status_checks',
                expected: expected,
              });
            }
          } else if (current && expected) {
            // Check strict mode
            if (expected.strict !== undefined && current.strict !== expected.strict) {
              issues.push(
                `Branch '${branchName}' strict status checks should be ${expected.strict ? 'enabled' : 'disabled'} ` +
                  `but is ${current.strict ? 'enabled' : 'disabled'}`
              );
            }

            // Check required contexts
            if (expected.contexts) {
              const missingContexts = expected.contexts.filter(
                (ctx: string) => !current.contexts?.includes(ctx)
              );
              if (missingContexts.length > 0) {
                issues.push(
                  `Branch '${branchName}' missing required status check contexts: ${missingContexts.join(', ')}`
                );
              }
            }
          } else if (current && !expected) {
            issues.push(`Branch '${branchName}' should not require status checks but does`);
            if (details.actions_needed) {
              details.actions_needed.push({
                action: 'update_protection',
                branch: branchName,
                field: 'required_status_checks',
                expected: null,
              });
            }
          }
        }

        // Check enforce admins
        if (
          expectedRules.enforce_admins !== undefined &&
          (currentProtection.enforce_admins as unknown as { enabled?: boolean } | undefined)
            ?.enabled !== expectedRules.enforce_admins
        ) {
          issues.push(
            `Branch '${branchName}' admin enforcement should be ${expectedRules.enforce_admins ? 'enabled' : 'disabled'} ` +
              `but is ${(currentProtection.enforce_admins as unknown as { enabled?: boolean } | undefined)?.enabled ? 'enabled' : 'disabled'}`
          );
          if (details.actions_needed) {
            details.actions_needed.push({
              action: 'update_protection',
              branch: branchName,
              field: 'enforce_admins',
              expected: expectedRules.enforce_admins,
            });
          }
        }

        // Check required pull request reviews
        if (expectedRules.required_pull_request_reviews !== undefined) {
          const current = currentProtection.required_pull_request_reviews;
          const expected = expectedRules.required_pull_request_reviews;

          if (!current && expected) {
            issues.push(`Branch '${branchName}' should require pull request reviews`);
            if (details.actions_needed) {
              details.actions_needed.push({
                action: 'update_protection',
                branch: branchName,
                field: 'required_pull_request_reviews',
                expected: expected,
              });
            }
          } else if (current && expected) {
            // Check required reviewers count
            if (
              expected.required_approving_review_count !== undefined &&
              current.required_approving_review_count !== expected.required_approving_review_count
            ) {
              issues.push(
                `Branch '${branchName}' should require ${expected.required_approving_review_count} approving reviews ` +
                  `but requires ${current.required_approving_review_count}`
              );
            }

            // Check dismiss stale reviews
            if (
              expected.dismiss_stale_reviews !== undefined &&
              current.dismiss_stale_reviews !== expected.dismiss_stale_reviews
            ) {
              issues.push(
                `Branch '${branchName}' dismiss stale reviews should be ${expected.dismiss_stale_reviews ? 'enabled' : 'disabled'} ` +
                  `but is ${current.dismiss_stale_reviews ? 'enabled' : 'disabled'}`
              );
            }

            // Check require code owner reviews
            if (
              expected.require_code_owner_reviews !== undefined &&
              current.require_code_owner_reviews !== expected.require_code_owner_reviews
            ) {
              issues.push(
                `Branch '${branchName}' code owner reviews should be ${expected.require_code_owner_reviews ? 'required' : 'not required'} ` +
                  `but is ${current.require_code_owner_reviews ? 'required' : 'not required'}`
              );
            }
          } else if (current && !expected) {
            issues.push(`Branch '${branchName}' should not require pull request reviews but does`);
            if (details.actions_needed) {
              details.actions_needed.push({
                action: 'update_protection',
                branch: branchName,
                field: 'required_pull_request_reviews',
                expected: null,
              });
            }
          }
        }

        // Check restrictions
        if (expectedRules.restrictions !== undefined) {
          const current = currentProtection.restrictions;
          const expected = expectedRules.restrictions;

          if (!current && expected) {
            issues.push(`Branch '${branchName}' should have push restrictions`);
            if (details.actions_needed) {
              details.actions_needed.push({
                action: 'update_protection',
                branch: branchName,
                field: 'restrictions',
                expected: expected,
              });
            }
          } else if (current && !expected) {
            issues.push(`Branch '${branchName}' should not have push restrictions but does`);
            if (details.actions_needed) {
              details.actions_needed.push({
                action: 'update_protection',
                branch: branchName,
                field: 'restrictions',
                expected: null,
              });
            }
          }
        }
      }

      if (issues.length === 0) {
        return this.createCompliantResult(
          'Branch protection rules are configured correctly',
          details
        );
      }

      return this.createNonCompliantResult(
        `Branch protection issues found: ${issues.join('; ')}`,
        details
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      core.error(
        `Failed to check branch protection for ${context.repository.full_name}: ${errorMessage}`
      );
      return this.createErrorResult('Failed to check branch protection rules', errorMessage);
    }
  }

  async fix(context: CheckContext): Promise<CheckResult> {
    if (context.dryRun) {
      return this.check(context);
    }

    try {
      const { repository } = context;
      const { owner, repo } = this.getRepoInfo(repository);
      const config = this.getRepoConfig(context, 'branch_protection');

      if (!config) {
        return this.createCompliantResult('No branch protection configuration to apply');
      }

      // First check current state
      const checkResult = await this.check({ ...context, dryRun: true });
      if (checkResult.compliant) {
        return checkResult;
      }

      const appliedActions: AppliedAction[] = [];
      const details = checkResult.details as CheckDetails;
      const actions_needed = details?.actions_needed;

      if (!actions_needed || !Array.isArray(actions_needed)) {
        return this.createCompliantResult('No actions needed to apply');
      }

      // Apply each needed action
      for (const action of actions_needed) {
        try {
          switch (action.action) {
            case 'enable_protection':
            case 'update_protection':
              await context.client.updateBranchProtection(
                owner,
                repo,
                action.branch as string,
                this.buildProtectionRules(
                  (action.rules ||
                    (config as unknown as Record<string, unknown>)[
                      action.branch as string
                    ]) as Record<string, unknown>
                )
              );
              appliedActions.push({
                action: action.action,
                details: {
                  branch: action.branch,
                  rules:
                    action.rules ||
                    (config as unknown as Record<string, unknown>)[action.branch as string],
                },
              });
              core.info(
                `✅ ${action.action === 'enable_protection' ? 'Enabled' : 'Updated'} protection for ${action.branch} in ${repository.full_name}`
              );
              break;
          }
        } catch (actionError) {
          const errorMessage =
            actionError instanceof Error ? actionError.message : String(actionError);
          core.error(
            `Failed to apply ${action.action} for ${action.branch} in ${repository.full_name}: ${errorMessage}`
          );
        }
      }

      if (appliedActions.length === 0) {
        return this.createErrorResult(
          'Failed to apply any branch protection changes',
          'All actions failed'
        );
      }

      return this.createFixedResult(`Applied ${appliedActions.length} branch protection changes`, {
        applied_actions: appliedActions,
        total_actions: actions_needed?.length || 0,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      core.error(
        `Failed to fix branch protection for ${context.repository.full_name}: ${errorMessage}`
      );
      return this.createErrorResult('Failed to update branch protection rules', errorMessage);
    }
  }

  private buildProtectionRules(config: Record<string, unknown>): Record<string, unknown> {
    const rules: Record<string, unknown> = {};

    if (config.required_status_checks !== undefined) {
      rules.required_status_checks = config.required_status_checks;
    }

    if (config.enforce_admins !== undefined) {
      rules.enforce_admins = config.enforce_admins;
    }

    if (config.required_pull_request_reviews !== undefined) {
      rules.required_pull_request_reviews = config.required_pull_request_reviews;
    }

    if (config.restrictions !== undefined) {
      rules.restrictions = config.restrictions;
    }

    return rules;
  }
}
