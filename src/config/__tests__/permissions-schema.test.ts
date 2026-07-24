import { ComplianceConfigSchema } from '../schema';

describe('permissions configuration safety', () => {
  const base = { version: 1 as const, defaults: {} };

  it('accepts individual collaborator removal without teams', () => {
    const config = ComplianceConfigSchema.parse({
      ...base,
      defaults: { permissions: { remove_individual_collaborators: true } },
    });

    expect(config.defaults.permissions).toEqual({ remove_individual_collaborators: true });
  });

  it('accepts an inert empty team list for backwards compatibility', () => {
    expect(() =>
      ComplianceConfigSchema.parse({
        ...base,
        defaults: { permissions: { teams: [] } },
      })
    ).not.toThrow();
  });

  it('requires teams when destructive team management is explicit', () => {
    expect(() =>
      ComplianceConfigSchema.parse({
        ...base,
        defaults: { permissions: { manage_teams: true } },
      })
    ).toThrow('teams is required when manage_teams is true');
  });

  it('accepts explicit removal of all direct team permissions', () => {
    expect(() =>
      ComplianceConfigSchema.parse({
        ...base,
        defaults: { permissions: { manage_teams: true, teams: [] } },
      })
    ).not.toThrow();
  });

  it('accepts rulesets observe mode', () => {
    const config = ComplianceConfigSchema.parse({ ...base, rulesets: { mode: 'observe' } });
    expect(config.rulesets?.mode).toBe('observe');
  });

  it('rejects all-org-members options on other dynamic rule types', () => {
    expect(() =>
      ComplianceConfigSchema.parse({
        ...base,
        teams: {
          dynamic_rules: [
            {
              name: 'filtered',
              type: 'by_filter',
              filter: { usernames: ['octocat'] },
              preserve_maintainers: true,
            },
          ],
        },
      })
    ).toThrow(
      'membership_authoritative, preserve_maintainers and include_bots are only valid for all_org_members rules'
    );
  });
});
