import * as fs from 'node:fs';
import {
  ConfigValidationError,
  validateDefaults,
  validateFromFile,
  validateFromString,
} from '../validator';

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
  describe('validateFromFile', () => {
    it('should validate configuration from file', async () => {
      const tempPath = '/tmp/test-valid-config.yml';
      fs.writeFileSync(tempPath, validConfig);

      try {
        const config = await validateFromFile(tempPath);
        expect(config.version).toBe(1);
        expect(config.organization).toBe('FormanceHQ');
      } finally {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      }
    });

    it('should throw error when file does not exist', async () => {
      const nonExistentPath = '/tmp/non-existent-config.yml';

      await expect(validateFromFile(nonExistentPath)).rejects.toThrow(ConfigValidationError);
      await expect(validateFromFile(nonExistentPath)).rejects.toThrow(
        'Configuration file not found'
      );
    });
  });

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

    it('should reject invalid YAML syntax with source path', async () => {
      const invalidYaml = `
version: 1
defaults:
  merge_methods:
    allow_merge_commit: [invalid yaml
`;

      try {
        await validateFromString(invalidYaml, 'test-config.yml');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigValidationError);
        expect((error as ConfigValidationError).message).toContain('in test-config.yml');
      }
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

    it('should reject missing required fields with source path', async () => {
      const missingDefaults = `
version: 1
`;

      try {
        await validateFromString(missingDefaults, 'test-config.yml');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigValidationError);
        expect((error as ConfigValidationError).message).toContain('for test-config.yml');
      }
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

    it('should handle file path argument and return config with warnings', async () => {
      // Create a temporary file for testing
      const tempPath = '/tmp/test-config.yml';
      const configWithWarnings = `
version: 1
defaults:
  merge_methods:
    allow_merge_commit: false
    allow_squash_merge: false
    allow_rebase_merge: false
  permissions:
    remove_individual_collaborators: true
    teams:
      - team: "developers"
        permission: "write"
`;

      fs.writeFileSync(tempPath, configWithWarnings);

      try {
        const result = await validateFromString(tempPath);
        expect(result).toHaveProperty('config');
        expect(result).toHaveProperty('warnings');
        expect((result as any).warnings).toContain(
          'All merge methods are disabled, repositories will not be able to merge pull requests'
        );
        expect((result as any).warnings).toContain(
          'No admin teams configured - ensure at least one team has admin access'
        );
      } finally {
        // Clean up temp file
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      }
    });

    it('should handle non-ZodError exceptions', async () => {
      // Mock ComplianceConfigSchema.parse to throw a non-ZodError
      const originalParse = require('../schema').ComplianceConfigSchema.parse;
      require('../schema').ComplianceConfigSchema.parse = jest.fn().mockImplementation(() => {
        throw new Error('Custom non-ZodError');
      });

      try {
        await expect(validateFromString('version: 1\ndefaults: {}')).rejects.toThrow(
          'Custom non-ZodError'
        );
      } finally {
        // Restore original
        require('../schema').ComplianceConfigSchema.parse = originalParse;
      }
    });

    it('should handle non-Error exceptions in YAML parsing', async () => {
      // Mock yaml.load to throw a non-Error
      const originalLoad = require('js-yaml').load;
      require('js-yaml').load = jest.fn().mockImplementation(() => {
        throw 'String error instead of Error object';
      });

      try {
        const error = await validateFromString('some content').catch((e) => e);
        expect(error).toBeInstanceOf(ConfigValidationError);
        expect(error.issues).toContain('String error instead of Error object');
      } finally {
        // Restore original
        require('js-yaml').load = originalLoad;
      }
    });

    it('should handle ZodError with empty path', async () => {
      // Mock ComplianceConfigSchema.parse to throw a ZodError with empty path
      const originalParse = require('../schema').ComplianceConfigSchema.parse;
      const { ZodError } = require('zod');

      require('../schema').ComplianceConfigSchema.parse = jest.fn().mockImplementation(() => {
        const zodError = new ZodError([
          {
            code: 'custom',
            path: [], // Empty path to test the 'root' case
            message: 'Root level validation error',
          },
        ]);
        throw zodError;
      });

      try {
        const error = await validateFromString('version: 1\ndefaults: {}').catch((e) => e);
        expect(error).toBeInstanceOf(ConfigValidationError);
        expect(error.issues).toContain('root: Root level validation error');
      } finally {
        // Restore original
        require('../schema').ComplianceConfigSchema.parse = originalParse;
      }
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

    it('should warn when branch protection requires no reviews', async () => {
      const config = await validateFromString(`
version: 1
defaults:
  branch_protection:
    patterns: ["main"]
    enforce_admins: true
    required_reviews:
      dismiss_stale_reviews: true
      required_approving_review_count: 0
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
      expect(warnings).toContain(
        'Branch protection requires no reviews and no code owner reviews - consider requiring at least one'
      );
    });

    it('should not warn for valid configuration', async () => {
      const config = await validateFromString(validConfig);
      const warnings = validateDefaults(config);
      expect(warnings).toHaveLength(0);
    });
  });
});
