import { ComplianceConfigSchema } from '../schema';

describe('ComplianceConfigSchema teams', () => {
  const baseConfig = {
    version: 1 as const,
    defaults: {},
  };

  it('accepts teams definitions and dynamic rules', () => {
    const config = {
      ...baseConfig,
      teams: {
        definitions: [
          {
            name: 'platform',
            description: 'Handles platform tooling',
            members: [{ username: 'octocat', role: 'maintainer' }, { username: 'hubot' }],
            privacy: 'closed' as const,
            notification_setting: 'notifications_enabled' as const,
          },
        ],
        dynamic_rules: [
          {
            name: 'all-members',
            type: 'all_org_members' as const,
          },
          {
            name: 'qa-team',
            type: 'by_filter' as const,
            filter: {
              usernames: ['quality-bot'],
              with_repo_access: ['octo/repo'],
            },
          },
          {
            name: 'ops-core',
            type: 'composite' as const,
            compose: {
              union: ['platform', 'qa-team'],
              difference: {
                from: 'platform',
                subtract: ['contractors'],
              },
            },
          },
        ],
        unmanaged_teams: 'warn' as const,
        dry_run: true,
      },
    };

    expect(() => ComplianceConfigSchema.parse(config)).not.toThrow();
  });

  it('rejects by_filter rules without filter block', () => {
    const config = {
      ...baseConfig,
      teams: {
        dynamic_rules: [
          {
            name: 'invalid-filter',
            type: 'by_filter' as const,
          },
        ],
      },
    };

    expect(() => ComplianceConfigSchema.parse(config)).toThrow(
      'by_filter rules require a filter block'
    );
  });

  it('rejects composite rules without compose block', () => {
    const config = {
      ...baseConfig,
      teams: {
        dynamic_rules: [
          {
            name: 'invalid-composite',
            type: 'composite' as const,
          },
        ],
      },
    };

    expect(() => ComplianceConfigSchema.parse(config)).toThrow(
      'composite rules require a compose block'
    );
  });

  it('rejects filters without any criteria', () => {
    const config = {
      ...baseConfig,
      teams: {
        dynamic_rules: [
          {
            name: 'empty-filter',
            type: 'by_filter' as const,
            filter: {},
          },
        ],
      },
    };

    expect(() => ComplianceConfigSchema.parse(config)).toThrow(
      'Team member filter must specify at least one criterion'
    );
  });

  it('rejects composite operations without any operation defined', () => {
    const config = {
      ...baseConfig,
      teams: {
        dynamic_rules: [
          {
            name: 'empty-composition',
            type: 'composite' as const,
            compose: {},
          },
        ],
      },
    };

    expect(() => ComplianceConfigSchema.parse(config)).toThrow(
      'Team composition must include at least one operation'
    );
  });

  it('rejects filter on non-filter rule types', () => {
    const config = {
      ...baseConfig,
      teams: {
        dynamic_rules: [
          {
            name: 'unexpected-filter',
            type: 'all_org_members' as const,
            filter: {
              usernames: ['octocat'],
            },
          },
        ],
      },
    };

    expect(() => ComplianceConfigSchema.parse(config)).toThrow(
      'Only by_filter rules may specify filter'
    );
  });

  it('rejects compose on non-composite rule types', () => {
    const config = {
      ...baseConfig,
      teams: {
        dynamic_rules: [
          {
            name: 'unexpected-compose',
            type: 'all_org_members' as const,
            compose: {
              union: ['platform'],
            },
          },
        ],
      },
    };

    expect(() => ComplianceConfigSchema.parse(config)).toThrow(
      'Only composite rules may specify compose'
    );
  });
});
