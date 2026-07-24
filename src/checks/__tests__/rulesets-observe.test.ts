import type { ComplianceConfig } from '../../config/types';
import type { GitHubClient, Repository } from '../../github/types';
import type { CheckContext } from '../base';
import { RulesetsObserveCheck } from '../rulesets-observe';

const repository: Repository = {
  id: 1,
  name: 'test-repo',
  full_name: 'test-org/test-repo',
  private: true,
  archived: false,
  disabled: false,
  fork: false,
  default_branch: 'main',
  updated_at: '2026-01-01T00:00:00Z',
  pushed_at: '2026-01-01T00:00:00Z',
  stargazers_count: 0,
  forks_count: 0,
  open_issues_count: 0,
  size: 1,
  language: 'TypeScript',
};

const organizationRuleset = {
  id: 42,
  name: 'Organization defaults',
  target: 'branch' as const,
  source_type: 'Organization' as const,
  source: 'test-org',
  enforcement: 'active' as const,
};

function createClient(): jest.Mocked<
  Pick<
    GitHubClient,
    'listRepositoryRulesets' | 'listBranches' | 'getBranchRules' | 'getBranchProtection'
  >
> {
  return {
    listRepositoryRulesets: jest.fn().mockResolvedValue([organizationRuleset]),
    listBranches: jest.fn().mockResolvedValue([{ name: 'main' }]),
    getBranchRules: jest.fn().mockResolvedValue([
      {
        type: 'pull_request',
        ruleset_source_type: 'Organization',
        ruleset_source: 'test-org',
        ruleset_id: organizationRuleset.id,
      },
    ]),
    getBranchProtection: jest.fn().mockResolvedValue(null),
  };
}

function createContext(config: ComplianceConfig, client = createClient()): CheckContext {
  return {
    client: client as unknown as GitHubClient,
    config,
    dryRun: true,
    repository,
  };
}

describe('RulesetsObserveCheck', () => {
  const check = new RulesetsObserveCheck();

  it('does not run when rulesets observation is not configured', () => {
    expect(
      check.shouldRun(
        createContext({
          version: 1,
          defaults: {},
        })
      )
    ).toBe(false);
  });

  it('reports an Organization ruleset overlapping legacy and configured protection as a warning', async () => {
    const client = createClient();
    client.getBranchProtection.mockResolvedValue({} as never);
    const context = createContext(
      {
        version: 1,
        defaults: {
          branch_protection: {
            patterns: ['main'],
          },
        },
        rulesets: { mode: 'observe' },
      },
      client
    );

    const result = await check.check(context);

    expect(result.compliant).toBe(true);
    expect(result.actions).toEqual([]);
    expect(result.findings).toEqual([
      expect.objectContaining({
        level: 'warning',
        message: expect.stringContaining(
          "Branch 'main' is covered by organization ruleset(s) Organization defaults"
        ),
        details: expect.objectContaining({
          repository: repository.full_name,
          branch: 'main',
          ruleset_ids: [organizationRuleset.id],
        }),
      }),
    ]);
    expect(result.findings?.[0]?.message).toContain('legacy branch protection');
    expect(result.findings?.[0]?.message).toContain('github-compliance branch_protection');
    expect(result.details?.overlaps).toEqual([
      {
        branch: 'main',
        ruleset_ids: [organizationRuleset.id],
        legacy_branch_protection: true,
        configured_branch_protection: true,
      },
    ]);
  });

  it('returns no warning when the observed ruleset has no overlapping protection', async () => {
    const client = createClient();
    const result = await check.check(
      createContext(
        {
          version: 1,
          defaults: {},
          rulesets: { mode: 'observe' },
        },
        client
      )
    );

    expect(result.compliant).toBe(true);
    expect(result.findings).toEqual([]);
    expect(result.actions).toEqual([]);
    expect(result.details?.overlaps).toEqual([]);
    expect(result.message).toContain('no policy overlap');
    expect(client.getBranchProtection).toHaveBeenCalledWith('test-org', 'test-repo', 'main');
  });

  it('returns an error result when the GitHub API fails', async () => {
    const client = createClient();
    client.listRepositoryRulesets.mockRejectedValue(new Error('API unavailable'));

    const result = await check.check(
      createContext(
        {
          version: 1,
          defaults: {},
          rulesets: { mode: 'observe' },
        },
        client
      )
    );

    expect(result).toEqual({
      compliant: false,
      message: 'Failed to observe repository rulesets',
      error: 'API unavailable',
    });
  });
});
