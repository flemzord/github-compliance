import { ConfigValidationError, validateDefaults, validateFromString } from '../validator';

const validConfig = `
version: 1
organization: "FormanceHQ"

defaults:
  merge_methods:
    allow_merge_commit: false
    allow_squash_merge: true
    allow_rebase_merge: false

  branch_protection:
    patterns: ["main", "release/v*"]
    enforce_admins: true
    required_reviews:
      dismiss_stale_reviews: true
      required_approving_review_count: 1
      require_code_owner_reviews: false
      require_last_push_approval: false
    required_status_checks:
      auto_discover: true
      contexts: []
      strict: true
    restrictions:
      users: []
      teams: ["admin"]
    allow_force_pushes: false
    allow_deletions: false
    required_conversation_resolution: true
    lock_branch: false
    allow_fork_syncing: false

  security:
    secret_scanning: "enabled"
    secret_scanning_push_protection: "auto"
    dependabot_alerts: false
    dependabot_updates: false
    code_scanning_recommended: true

  permissions:
    remove_individual_collaborators: true
    teams:
      - team: "admin"
        permission: "admin"
      - team: "core"
        permission: "write"

  archived_repos:
    admin_team_only: true

rules:
  - match:
      repositories: ["*-archived"]
    apply:
      archived_repos:
        admin_team_only: true

  - match:
      only_private: true
    apply:
      security:
        secret_scanning_push_protection: "enabled"

checks:
  enabled: ["merge-methods", "team-permissions", "branch-protection"]
`;

describe('Config validation', () => {
  describe('validateFromString', () => {
    it('should validate a correct configuration', async () => {
      const config = await validateFromString(validConfig);

      expect(config.version).toBe(1);
      expect(config.organization).toBe('FormanceHQ');
      expect(config.defaults.merge_methods?.allow_squash_merge).toBe(true);
      expect(config.defaults.branch_protection?.patterns).toEqual(['main', 'release/v*']);
      expect(config.rules).toHaveLength(2);
      expect(config.checks?.enabled).toContain('merge-methods');
    });

    it('should reject invalid YAML syntax', async () => {
      const invalidYaml = `
version: 1
defaults:
  merge_methods:
    allow_merge_commit: [invalid yaml
`;

      await expect(validateFromString(invalidYaml)).rejects.toThrow(ConfigValidationError);
    });

    it('should reject invalid version', async () => {
      const invalidVersion = `
version: 2
defaults: {}
`;

      await expect(validateFromString(invalidVersion)).rejects.toThrow(ConfigValidationError);
    });

    it('should reject missing required fields', async () => {
      const missingDefaults = `
version: 1
`;

      await expect(validateFromString(missingDefaults)).rejects.toThrow(ConfigValidationError);
    });

    it('should reject invalid permission levels', async () => {
      const invalidPermission = `
version: 1
defaults:
  permissions:
    remove_individual_collaborators: true
    teams:
      - team: "admin"
        permission: "invalid"
`;

      await expect(validateFromString(invalidPermission)).rejects.toThrow(ConfigValidationError);
    });

    it('should reject invalid security settings', async () => {
      const invalidSecurity = `
version: 1
defaults:
  security:
    secret_scanning: "maybe"
    secret_scanning_push_protection: "auto"
    dependabot_alerts: false
    dependabot_updates: false
    code_scanning_recommended: true
`;

      await expect(validateFromString(invalidSecurity)).rejects.toThrow(ConfigValidationError);
    });

    it('should reject invalid check names', async () => {
      const invalidChecks = `
version: 1
defaults: {}
checks:
  enabled: ["invalid-check"]
`;

      await expect(validateFromString(invalidChecks)).rejects.toThrow(ConfigValidationError);
    });
  });

  describe('validateDefaults', () => {
    it('should warn when all merge methods are disabled', async () => {
      const config = await validateFromString(`
version: 1
defaults:
  merge_methods:
    allow_merge_commit: false
    allow_squash_merge: false
    allow_rebase_merge: false
`);

      const warnings = validateDefaults(config);
      expect(warnings).toContain(
        'All merge methods are disabled, repositories will not be able to merge pull requests'
      );
    });

    it('should warn when branch protection has no patterns', async () => {
      const config = await validateFromString(`
version: 1
defaults:
  branch_protection:
    patterns: []
    enforce_admins: true
    required_reviews:
      dismiss_stale_reviews: true
      required_approving_review_count: 1
      require_code_owner_reviews: false
      require_last_push_approval: false
    required_status_checks:
      auto_discover: true
      contexts: []
      strict: true
    restrictions:
      users: []
      teams: []
    allow_force_pushes: false
    allow_deletions: false
    required_conversation_resolution: true
    lock_branch: false
    allow_fork_syncing: false
`);

      const warnings = validateDefaults(config);
      expect(warnings).toContain('Branch protection is configured but no patterns are specified');
    });

    it('should warn when no admin teams are configured', async () => {
      const config = await validateFromString(`
version: 1
defaults:
  permissions:
    remove_individual_collaborators: true
    teams:
      - team: "developers"
        permission: "write"
`);

      const warnings = validateDefaults(config);
      expect(warnings).toContain(
        'No admin teams configured - ensure at least one team has admin access'
      );
    });

    it('should not warn for valid configuration', async () => {
      const config = await validateFromString(validConfig);
      const warnings = validateDefaults(config);
      expect(warnings).toHaveLength(0);
    });
  });
});
