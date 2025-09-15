import * as logger from '../logging';
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

      // Extract patterns and other protection rules
      const { patterns, ...protectionRules } = config as unknown as {
        patterns?: string[];
        [key: string]: unknown;
      };

      if (!patterns || patterns.length === 0) {
        logger.warning('No branch patterns specified in branch protection configuration');
        return this.createCompliantResult('No branch patterns to protect');
      }

      // For now, we'll check exact branch names (wildcards would need branch listing)
      // In a production scenario, you'd want to list all branches and match against patterns
      for (const branchPattern of patterns) {
        // For simplicity, treat patterns as exact branch names for now
        // TODO: Implement wildcard matching by listing branches
        const branchName = branchPattern;

        // First check if the branch exists by trying to get it
        try {
          await context.client.getBranch(owner, repo, branchName);
        } catch (_branchError) {
          logger.warning(
            `Branch '${branchName}' does not exist in ${repository.full_name}, skipping protection check`
          );
          continue;
        }

        const currentProtection = await context.client.getBranchProtection(owner, repo, branchName);
        (details.branches as Record<string, unknown>)[branchName] = {
          current: currentProtection,
          expected: protectionRules,
        };

        if (!currentProtection) {
          if (Object.keys(protectionRules).length > 0) {
            issues.push(`Branch '${branchName}' should have protection rules but has none`);
            if (details.actions_needed) {
              details.actions_needed.push({
                action: 'enable_protection',
                branch: branchName,
                rules: protectionRules,
              });
            }
          }
          continue;
        }

        // Check required status checks
        if (protectionRules.required_status_checks !== undefined) {
          const current = currentProtection.required_status_checks;
          const expected = protectionRules.required_status_checks as {
            strict?: boolean;
            contexts?: string[];
          } | null;

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
          protectionRules.enforce_admins !== undefined &&
          (currentProtection.enforce_admins as unknown as { enabled?: boolean } | undefined)
            ?.enabled !== protectionRules.enforce_admins
        ) {
          issues.push(
            `Branch '${branchName}' admin enforcement should be ${protectionRules.enforce_admins ? 'enabled' : 'disabled'} ` +
              `but is ${(currentProtection.enforce_admins as unknown as { enabled?: boolean } | undefined)?.enabled ? 'enabled' : 'disabled'}`
          );
          if (details.actions_needed) {
            details.actions_needed.push({
              action: 'update_protection',
              branch: branchName,
              field: 'enforce_admins',
              expected: protectionRules.enforce_admins,
            });
          }
        }

        // Check required pull request reviews
        if (protectionRules.required_pull_request_reviews !== undefined) {
          const current = currentProtection.required_pull_request_reviews;
          const expected = protectionRules.required_pull_request_reviews as {
            required_approving_review_count?: number;
            dismiss_stale_reviews?: boolean;
            require_code_owner_reviews?: boolean;
          } | null;

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
        if (protectionRules.restrictions !== undefined) {
          const current = currentProtection.restrictions;
          const expected = protectionRules.restrictions;

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
      logger.error(
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

      if (!actions_needed || !Array.isArray(actions_needed) || actions_needed.length === 0) {
        return this.createCompliantResult('No actions needed to apply');
      }

      // Apply each needed action
      for (const action of actions_needed) {
        try {
          // Debug logging
          logger.debug(`Processing action: ${JSON.stringify(action)}`);

          switch (action.action) {
            case 'enable_protection':
            case 'update_protection': {
              const branchName = action.branch as string;

              // For update_protection with specific field, we need to build the full rules
              let rulesToApply: Record<string, unknown>;

              if (action.action === 'enable_protection' && action.rules) {
                // For enable_protection, use the provided rules
                rulesToApply = action.rules as Record<string, unknown>;
              } else if (action.action === 'update_protection' && action.field) {
                // For update_protection with a specific field, extract the protection rules
                // (excluding patterns) and update only the specific field
                const { patterns: _patterns, ...baseProtectionRules } = config as unknown as {
                  patterns?: string[];
                  [key: string]: unknown;
                };
                rulesToApply = { ...baseProtectionRules };

                // Update the specific field
                if (action.expected !== undefined) {
                  rulesToApply[action.field as string] = action.expected;
                }
              } else {
                // Fallback - use provided rules or extract protection rules from config
                if (action.rules) {
                  rulesToApply = action.rules as Record<string, unknown>;
                } else {
                  const { patterns: _patterns2, ...baseProtectionRules } = config as unknown as {
                    patterns?: string[];
                    [key: string]: unknown;
                  };
                  rulesToApply = baseProtectionRules;
                }
              }

              await context.client.updateBranchProtection(
                owner,
                repo,
                branchName,
                this.buildProtectionRules(rulesToApply)
              );
              appliedActions.push({
                action: action.action,
                details: {
                  branch: branchName,
                  rules: rulesToApply,
                },
              });
              logger.info(
                `✅ ${action.action === 'enable_protection' ? 'Enabled' : 'Updated'} protection for ${branchName} in ${repository.full_name}`
              );
              break;
            }
          }
        } catch (actionError) {
          const errorMessage =
            actionError instanceof Error ? actionError.message : String(actionError);
          const branchInfo = action.branch || action.field || 'unknown';
          logger.error(
            `Failed to apply ${action.action} for branch '${branchInfo}' in ${repository.full_name}: ${errorMessage}`
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
      logger.error(
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
