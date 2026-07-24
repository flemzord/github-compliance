import * as logger from '../logging';
import { BaseCheck, type CheckContext, type CheckResult } from './base';
import type { CheckFinding } from './types';

interface BranchObservation {
  branch: string;
  rulesetIds: number[];
  organizationRulesetIds: number[];
  hasLegacyProtection: boolean;
  configuredBranchProtection: boolean;
}

export class RulesetsObserveCheck extends BaseCheck {
  readonly name = 'repo-rulesets-observe';
  readonly description = 'Observe effective rulesets and overlapping legacy branch protections';

  shouldRun(context: CheckContext): boolean {
    return super.shouldRun(context) && context.config.rulesets?.mode === 'observe';
  }

  async check(context: CheckContext): Promise<CheckResult> {
    const { repository } = context;
    const { owner, repo } = this.getRepoInfo(repository);

    try {
      const [rulesets, branches] = await Promise.all([
        context.client.listRepositoryRulesets(owner, repo),
        context.client.listBranches(owner, repo),
      ]);
      const rulesetsById = new Map(rulesets.map((ruleset) => [ruleset.id, ruleset] as const));
      if (rulesets.length === 0) {
        return {
          compliant: true,
          message: 'Observed 0 applicable ruleset(s) with no policy overlap',
          details: { rulesets: [], overlaps: [] },
          findings: [],
          actions: [],
        };
      }

      const observations: BranchObservation[] = [];
      const concurrency = 5;
      for (let index = 0; index < branches.length; index += concurrency) {
        const batch = branches.slice(index, index + concurrency);
        const batchObservations = await Promise.all(
          batch.map(async ({ name }) => {
            const branchRules = await context.client.getBranchRules(owner, repo, name);
            const rulesetIds = [
              ...new Set(
                branchRules
                  .map((rule) => rule.ruleset_id)
                  .filter((id): id is number => id !== undefined)
              ),
            ];
            const organizationRulesetIds = rulesetIds.filter(
              (id) => rulesetsById.get(id)?.source_type === 'Organization'
            );
            const hasLegacyProtection =
              organizationRulesetIds.length > 0
                ? (await context.client.getBranchProtection(owner, repo, name)) !== null
                : false;

            return {
              branch: name,
              rulesetIds,
              organizationRulesetIds,
              hasLegacyProtection,
              configuredBranchProtection: this.matchesConfiguredProtection(context, name),
            } satisfies BranchObservation;
          })
        );
        observations.push(...batchObservations);
      }

      const findings: CheckFinding[] = [];
      const overlaps: Array<Record<string, unknown>> = [];
      for (const observation of observations) {
        if (observation.organizationRulesetIds.length === 0) continue;
        if (!observation.hasLegacyProtection && !observation.configuredBranchProtection) continue;

        const rulesetNames = observation.organizationRulesetIds.map(
          (id) => rulesetsById.get(id)?.name ?? String(id)
        );
        const policies = [
          ...(observation.hasLegacyProtection ? ['legacy branch protection'] : []),
          ...(observation.configuredBranchProtection
            ? ['github-compliance branch_protection']
            : []),
        ];
        const message = `Branch '${observation.branch}' is covered by organization ruleset(s) ${rulesetNames.join(', ')} and ${policies.join(' and ')}`;
        logger.warning(`${repository.full_name}: ${message}`);
        findings.push({
          level: 'warning',
          message,
          details: {
            repository: repository.full_name,
            branch: observation.branch,
            ruleset_ids: observation.organizationRulesetIds,
          },
        });
        overlaps.push({
          branch: observation.branch,
          ruleset_ids: observation.organizationRulesetIds,
          legacy_branch_protection: observation.hasLegacyProtection,
          configured_branch_protection: observation.configuredBranchProtection,
        });
      }

      const rulesetDetails = rulesets.map((ruleset) => ({
        id: ruleset.id,
        name: ruleset.name,
        source: ruleset.source,
        source_type: ruleset.source_type,
        enforcement: ruleset.enforcement,
        target: ruleset.target,
        active_branches: observations
          .filter((observation) => observation.rulesetIds.includes(ruleset.id))
          .map((observation) => observation.branch),
      }));

      return {
        compliant: true,
        message:
          findings.length === 0
            ? `Observed ${rulesets.length} applicable ruleset(s) with no policy overlap`
            : `Observed ${rulesets.length} applicable ruleset(s) and ${findings.length} policy overlap warning(s)`,
        details: {
          rulesets: rulesetDetails,
          overlaps,
        },
        findings,
        actions: [],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to observe rulesets for ${repository.full_name}: ${message}`);
      return this.createErrorResult('Failed to observe repository rulesets', message);
    }
  }

  private matchesConfiguredProtection(context: CheckContext, branch: string): boolean {
    const config = this.getRepoConfig(context, 'branch_protection');
    if (!config) return false;
    const blocks = Array.isArray(config) ? config : [config];
    return blocks.some((block) => this.matchesPattern(branch, block.patterns ?? []));
  }
}
