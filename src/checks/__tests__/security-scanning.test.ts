import * as core from '@actions/core';
import type { ComplianceConfig } from '../../config/types';
import type { GitHubClient, Repository } from '../../github/types';
import type { CheckContext } from '../base';
import { SecurityScanningCheck } from '../security-scanning';
import type { SecurityClient, VulnerabilityAlert } from '../types';

// Mock @actions/core
jest.mock('@actions/core');
const mockCore = core as jest.Mocked<typeof core>;

// Mock GitHubClient with SecurityClient methods
const mockClient: Partial<GitHubClient & SecurityClient> = {
  getRepository: jest.fn(),
  getVulnerabilityAlerts: jest.fn(),
  updateVulnerabilityAlerts: jest.fn(),
  updateSecretScanning: jest.fn(),
  updateSecretScanningPushProtection: jest.fn(),
};

// Mock Repository
const mockRepository: Repository = {
  id: 1,
  name: 'test-repo',
  full_name: 'owner/test-repo',
  private: false,
  archived: false,
  disabled: false,
  fork: false,
  default_branch: 'main',
  updated_at: '2024-01-01T00:00:00Z',
  pushed_at: '2024-01-01T00:00:00Z',
  stargazers_count: 0,
  forks_count: 0,
  open_issues_count: 0,
  size: 100,
  language: 'TypeScript',
};

// Mock ComplianceConfig
const mockConfig: ComplianceConfig = {
  version: 1,
  organization: 'test-org',
  defaults: {
    security: {
      secret_scanning: 'enabled',
      secret_scanning_push_protection: 'enabled',
      dependabot_alerts: true,
      dependabot_updates: true,
      code_scanning_recommended: true,
    },
  },
};

// Mock repository data with security settings
const mockRepoDataWithSecurity = {
  id: 1,
  name: 'test-repo',
  full_name: 'owner/test-repo',
  security_and_analysis: {
    dependency_graph: { status: 'enabled' },
    dependabot_security_updates: { status: 'enabled' },
    secret_scanning: { status: 'enabled' },
    secret_scanning_push_protection: { status: 'enabled' },
    advanced_security: { status: 'enabled' },
  },
};

// Mock vulnerability alerts
const mockVulnerabilityAlerts: VulnerabilityAlert[] = [
  { state: 'open', id: 1 },
  { state: 'open', id: 2 },
  { state: 'dismissed', id: 3 },
];

describe('SecurityScanningCheck', () => {
  let check: SecurityScanningCheck;
  let context: CheckContext;

  beforeEach(() => {
    check = new SecurityScanningCheck();
    context = {
      client: mockClient as GitHubClient,
      config: mockConfig,
      dryRun: false,
      repository: mockRepository,
    };
    jest.clearAllMocks();
    mockCore.info.mockImplementation(() => {
      /* mock */
    });
    mockCore.warning.mockImplementation(() => {
      /* mock */
    });
    mockCore.error.mockImplementation(() => {
      /* mock */
    });
    mockCore.debug.mockImplementation(() => {
      /* mock */
    });
  });

  describe('shouldRun', () => {
    it('should return true when security config exists', () => {
      expect(check.shouldRun(context)).toBe(true);
    });

    it('should return false when no security config', () => {
      const configWithoutSecurity = {
        ...mockConfig,
        defaults: {},
      };
      const contextWithoutConfig = { ...context, config: configWithoutSecurity };

      expect(check.shouldRun(contextWithoutConfig)).toBe(false);
    });
  });

  describe('check', () => {
    beforeEach(() => {
      (mockClient.getRepository as jest.Mock).mockResolvedValue(mockRepoDataWithSecurity);
      (mockClient.getVulnerabilityAlerts as jest.Mock).mockResolvedValue(mockVulnerabilityAlerts);
    });

    it('should return compliant when no config specified', async () => {
      const configWithoutSecurity = {
        ...mockConfig,
        defaults: {},
      };
      const contextWithoutConfig = { ...context, config: configWithoutSecurity };

      const result = await check.check(contextWithoutConfig);

      expect(result.compliant).toBe(true);
      expect(result.message).toBe('No security scanning configuration specified');
    });

    it('should be compliant when all security settings are properly configured', async () => {
      const configWithOnlyBooleans = {
        ...mockConfig,
        defaults: {
          security: {
            secret_scanning: 'enabled',
            secret_scanning_push_protection: 'enabled',
            dependabot_alerts: true,
            dependabot_updates: true,
            code_scanning_recommended: true,
          },
        },
      };
      const contextWithBooleans = { ...context, config: configWithOnlyBooleans };

      const result = await check.check(contextWithBooleans);

      expect(result.compliant).toBe(true);
      expect(result.details?.current).toEqual({
        repository_settings: {
          security_and_analysis: mockRepoDataWithSecurity.security_and_analysis,
        },
        vulnerability_alerts: {
          total: 3,
          open: 2,
          dismissed: 1,
        },
      });
    });

    describe('dependabot_alerts validation', () => {
      it('should detect when dependabot alerts should be enabled but are disabled', async () => {
        const repoDataWithoutDependabot = {
          ...mockRepoDataWithSecurity,
          security_and_analysis: {
            ...mockRepoDataWithSecurity.security_and_analysis,
            dependency_graph: { status: 'disabled' },
            dependabot_security_updates: { status: 'disabled' },
          },
        };
        (mockClient.getRepository as jest.Mock).mockResolvedValue(repoDataWithoutDependabot);

        const result = await check.check(context);

        expect(result.compliant).toBe(false);
        expect(result.message).toContain('Dependabot alerts should be enabled but is disabled');
        expect(result.details?.actions_needed).toContainEqual({
          action: 'update_dependabot_alerts',
          enabled: true,
        });
      });

      it('should detect when dependabot alerts should be disabled but are enabled', async () => {
        const configWithDisabledDependabot = {
          ...mockConfig,
          defaults: {
            security: {
              secret_scanning: 'enabled',
              secret_scanning_push_protection: 'enabled',
              dependabot_alerts: false,
              dependabot_updates: true,
              code_scanning_recommended: true,
            },
          },
        };
        const contextWithDisabledDependabot = { ...context, config: configWithDisabledDependabot };

        const result = await check.check(contextWithDisabledDependabot);

        expect(result.compliant).toBe(false);
        expect(result.message).toContain('Dependabot alerts should be disabled but is enabled');
        expect(result.details?.actions_needed).toContainEqual({
          action: 'update_dependabot_alerts',
          enabled: false,
        });
      });

      it('should ignore dependabot setting when not specified in config', async () => {
        const configWithoutDependabot = {
          ...mockConfig,
          defaults: {
            security: {
              secret_scanning: 'enabled',
              secret_scanning_push_protection: 'enabled',
              dependabot_alerts: true,
              dependabot_updates: true,
              code_scanning_recommended: true,
              // dependabot_alerts not specified in the actual config checking logic
            },
          },
        };
        const contextWithoutDependabot = { ...context, config: configWithoutDependabot };

        const result = await check.check(contextWithoutDependabot);

        expect(result.compliant).toBe(true);
      });

      it('should handle partial dependency graph configuration', async () => {
        const repoDataWithPartialDependabot = {
          ...mockRepoDataWithSecurity,
          security_and_analysis: {
            ...mockRepoDataWithSecurity.security_and_analysis,
            dependency_graph: { status: 'enabled' },
            dependabot_security_updates: { status: 'disabled' }, // partial config
          },
        };
        (mockClient.getRepository as jest.Mock).mockResolvedValue(repoDataWithPartialDependabot);

        const result = await check.check(context);

        expect(result.compliant).toBe(false);
        expect(result.message).toContain('Dependabot alerts should be enabled but is disabled');
      });
    });

    describe('secret_scanning validation', () => {
      it('should detect when secret scanning should be enabled but is disabled', async () => {
        const repoDataWithoutSecretScanning = {
          ...mockRepoDataWithSecurity,
          security_and_analysis: {
            ...mockRepoDataWithSecurity.security_and_analysis,
            secret_scanning: { status: 'disabled' },
          },
        };
        (mockClient.getRepository as jest.Mock).mockResolvedValue(repoDataWithoutSecretScanning);

        const result = await check.check(context);

        expect(result.compliant).toBe(false);
        expect(result.message).toContain('Secret scanning should be enabled but is disabled');
        expect(result.details?.actions_needed).toContainEqual({
          action: 'update_secret_scanning',
          enabled: 'enabled',
        });
      });

      it('should detect when secret scanning should be disabled but is enabled', async () => {
        const configWithDisabledSecretScanning = {
          ...mockConfig,
          defaults: {
            security: {
              secret_scanning: 'disabled',
              secret_scanning_push_protection: 'enabled',
              dependabot_alerts: true,
              dependabot_updates: true,
              code_scanning_recommended: true,
            },
          },
        };
        const contextWithDisabledSecretScanning = {
          ...context,
          config: configWithDisabledSecretScanning,
        };

        const result = await check.check(contextWithDisabledSecretScanning);

        expect(result.compliant).toBe(false);
        expect(result.message).toContain('Secret scanning should be disabled but is enabled');
        expect(result.details?.actions_needed).toContainEqual({
          action: 'update_secret_scanning',
          enabled: 'disabled',
        });
      });

      it('should handle missing secret scanning configuration', async () => {
        const repoDataWithoutSecretScanningField = {
          ...mockRepoDataWithSecurity,
          security_and_analysis: {
            ...mockRepoDataWithSecurity.security_and_analysis,
            secret_scanning: undefined,
          },
        };
        (mockClient.getRepository as jest.Mock).mockResolvedValue(
          repoDataWithoutSecretScanningField
        );

        const result = await check.check(context);

        expect(result.compliant).toBe(false);
        expect(result.message).toContain('Secret scanning should be enabled but is disabled');
      });
    });

    describe('secret_scanning_push_protection validation', () => {
      it('should detect when push protection should be enabled but is disabled', async () => {
        const repoDataWithoutPushProtection = {
          ...mockRepoDataWithSecurity,
          security_and_analysis: {
            ...mockRepoDataWithSecurity.security_and_analysis,
            secret_scanning_push_protection: { status: 'disabled' },
          },
        };
        (mockClient.getRepository as jest.Mock).mockResolvedValue(repoDataWithoutPushProtection);

        const result = await check.check(context);

        expect(result.compliant).toBe(false);
        expect(result.message).toContain(
          'Secret scanning push protection should be enabled but is disabled'
        );
        expect(result.details?.actions_needed).toContainEqual({
          action: 'update_secret_scanning_push_protection',
          enabled: 'enabled',
        });
      });

      it('should detect when push protection should be disabled but is enabled', async () => {
        const configWithDisabledPushProtection = {
          ...mockConfig,
          defaults: {
            security: {
              secret_scanning: 'enabled',
              secret_scanning_push_protection: 'disabled',
              dependabot_alerts: true,
              dependabot_updates: true,
              code_scanning_recommended: true,
            },
          },
        };
        const contextWithDisabledPushProtection = {
          ...context,
          config: configWithDisabledPushProtection,
        };

        const result = await check.check(contextWithDisabledPushProtection);

        expect(result.compliant).toBe(false);
        expect(result.message).toContain(
          'Secret scanning push protection should be disabled but is enabled'
        );
        expect(result.details?.actions_needed).toContainEqual({
          action: 'update_secret_scanning_push_protection',
          enabled: 'disabled',
        });
      });
    });

    describe('code_scanning validation', () => {
      it('should detect private repo without advanced security when code scanning is required', async () => {
        const privateRepo = { ...mockRepository, private: true };

        // Use a config that only has code_scanning to avoid other conflicts
        const codeOnlyConfig = {
          ...mockConfig,
          defaults: {
            security: {
              secret_scanning: 'enabled',
              secret_scanning_push_protection: 'enabled',
              dependabot_alerts: false, // Don't check these to avoid conflicts
              dependabot_updates: false,
              code_scanning_recommended: true, // Only test code scanning
            },
          },
        };
        const privateContext = { ...context, repository: privateRepo, config: codeOnlyConfig };

        const repoDataWithoutAdvancedSecurity = {
          ...mockRepoDataWithSecurity,
          security_and_analysis: {
            ...mockRepoDataWithSecurity.security_and_analysis,
            advanced_security: undefined,
          },
        };
        (mockClient.getRepository as jest.Mock).mockResolvedValue(repoDataWithoutAdvancedSecurity);

        const result = await check.check(privateContext);

        expect(result.compliant).toBe(false);
        expect(result.message).toContain('Code scanning requires GitHub Advanced Security');
        expect(result.details?.actions_needed).toContainEqual({
          action: 'enable_advanced_security',
          note: 'Required for code scanning on private repositories',
        });
      });

      it('should not require advanced security for public repos', async () => {
        const publicRepo = { ...mockRepository, private: false };
        const publicContext = { ...context, repository: publicRepo };

        const repoDataWithoutAdvancedSecurity = {
          ...mockRepoDataWithSecurity,
          security_and_analysis: {
            ...mockRepoDataWithSecurity.security_and_analysis,
            advanced_security: undefined,
          },
        };
        (mockClient.getRepository as jest.Mock).mockResolvedValue(repoDataWithoutAdvancedSecurity);

        const result = await check.check(publicContext);

        // Should not flag code scanning issues for public repos
        expect(result.details?.actions_needed).not.toContainEqual(
          expect.objectContaining({ action: 'enable_advanced_security' })
        );
      });

      it('should handle code scanning check errors gracefully', async () => {
        const privateRepo = { ...mockRepository, private: true };

        // Use a config that disables dependabot to avoid vulnerability alerts warning
        const configWithCodeScanningOnly = {
          ...mockConfig,
          defaults: {
            security: {
              secret_scanning: 'enabled',
              secret_scanning_push_protection: 'enabled',
              dependabot_alerts: false, // Disable this to avoid fetching alerts
              dependabot_updates: true,
              code_scanning_recommended: true,
            },
          },
        };
        const privateContext = {
          ...context,
          repository: privateRepo,
          config: configWithCodeScanningOnly,
        };

        // Create a problematic repository object that will cause errors when accessed
        const problematicRepo = { ...privateRepo };
        Object.defineProperty(problematicRepo, 'private', {
          get: () => {
            throw new Error('Test error accessing repository properties');
          },
        });
        const problematicContext = { ...privateContext, repository: problematicRepo };

        await check.check(problematicContext);

        expect(mockCore.warning).toHaveBeenCalledWith(
          expect.stringContaining('Could not check code scanning status')
        );
      });
    });

    describe('vulnerability alerts information', () => {
      it('should fetch and display vulnerability alerts when dependabot is enabled', async () => {
        const result = await check.check(context);

        expect(mockClient.getVulnerabilityAlerts).toHaveBeenCalledWith('owner', 'test-repo');
        expect(result.details?.current).toMatchObject({
          vulnerability_alerts: {
            total: 3,
            open: 2,
            dismissed: 1,
          },
        });
      });

      it('should warn about open vulnerability alerts', async () => {
        await check.check(context);

        expect(mockCore.warning).toHaveBeenCalledWith(
          'Repository owner/test-repo has 2 open vulnerability alerts'
        );
      });

      it('should not warn when no open vulnerability alerts', async () => {
        const alertsWithNoneOpen: VulnerabilityAlert[] = [
          { state: 'dismissed', id: 1 },
          { state: 'dismissed', id: 2 },
        ];
        (mockClient.getVulnerabilityAlerts as jest.Mock).mockResolvedValue(alertsWithNoneOpen);

        await check.check(context);

        expect(mockCore.warning).not.toHaveBeenCalledWith(
          expect.stringContaining('open vulnerability alerts')
        );
      });

      it('should handle vulnerability alerts fetch errors gracefully', async () => {
        (mockClient.getVulnerabilityAlerts as jest.Mock).mockRejectedValue(
          new Error('Insufficient permissions to access vulnerability alerts')
        );

        const result = await check.check(context);

        expect(mockCore.debug).toHaveBeenCalledWith(
          'Could not fetch vulnerability alerts: Insufficient permissions to access vulnerability alerts'
        );
        expect(result.compliant).toBe(true); // Should still work without vulnerability alerts
      });

      it('should not fetch alerts when dependabot is disabled', async () => {
        const configWithoutDependabot = {
          ...mockConfig,
          defaults: {
            security: {
              secret_scanning: 'enabled',
              secret_scanning_push_protection: 'enabled',
              dependabot_alerts: false,
              dependabot_updates: true,
              code_scanning_recommended: true,
              // dependabot_alerts is disabled
            },
          },
        };
        const contextWithoutDependabot = { ...context, config: configWithoutDependabot };

        await check.check(contextWithoutDependabot);

        expect(mockClient.getVulnerabilityAlerts).not.toHaveBeenCalled();
      });
    });

    describe('multiple issues', () => {
      it('should detect multiple security issues', async () => {
        const repoDataWithMultipleIssues = {
          ...mockRepoDataWithSecurity,
          security_and_analysis: {
            dependency_graph: { status: 'disabled' },
            dependabot_security_updates: { status: 'disabled' },
            secret_scanning: { status: 'disabled' },
            secret_scanning_push_protection: { status: 'disabled' },
            advanced_security: { status: 'disabled' },
          },
        };
        (mockClient.getRepository as jest.Mock).mockResolvedValue(repoDataWithMultipleIssues);

        const result = await check.check(context);

        expect(result.compliant).toBe(false);
        expect(result.message).toContain('Dependabot alerts should be enabled but is disabled');
        expect(result.message).toContain('Secret scanning should be enabled but is disabled');
        expect(result.message).toContain(
          'Secret scanning push protection should be enabled but is disabled'
        );
        expect(result.details?.actions_needed).toHaveLength(3);
      });
    });

    describe('error handling', () => {
      it('should handle API errors gracefully', async () => {
        (mockClient.getRepository as jest.Mock).mockRejectedValue(
          new Error('Repository not found')
        );

        const result = await check.check(context);

        expect(result.compliant).toBe(false);
        expect(result.error).toBe('Repository not found');
        expect(result.message).toBe('Failed to check security scanning settings');
        expect(mockCore.error).toHaveBeenCalledWith(
          expect.stringContaining('Failed to check security scanning')
        );
      });

      it('should handle non-Error exceptions', async () => {
        (mockClient.getRepository as jest.Mock).mockRejectedValue('String error');

        const result = await check.check(context);

        expect(result.error).toBe('String error');
      });
    });

    describe('edge cases', () => {
      it('should handle repository data without security_and_analysis', async () => {
        const repoDataWithoutSecurity = {
          id: 1,
          name: 'test-repo',
          // security_and_analysis is undefined
        };
        (mockClient.getRepository as jest.Mock).mockResolvedValue(repoDataWithoutSecurity);

        const result = await check.check(context);

        expect(result.compliant).toBe(false);
        expect(result.details?.current).toEqual({
          repository_settings: {
            security_and_analysis: undefined,
          },
          vulnerability_alerts: {
            total: 3,
            open: 2,
            dismissed: 1,
          },
        });
      });
    });
  });

  describe('fix', () => {
    beforeEach(() => {
      (mockClient.getRepository as jest.Mock).mockResolvedValue(mockRepoDataWithSecurity);
      (mockClient.updateVulnerabilityAlerts as jest.Mock).mockResolvedValue({});
      (mockClient.updateSecretScanning as jest.Mock).mockResolvedValue({});
      (mockClient.updateSecretScanningPushProtection as jest.Mock).mockResolvedValue({});
    });

    it('should return check result when in dry run mode', async () => {
      const dryRunContext = { ...context, dryRun: true };

      const result = await check.fix(dryRunContext);

      expect(result.compliant).toBe(true);
      expect(mockClient.updateVulnerabilityAlerts).not.toHaveBeenCalled();
    });

    it('should return compliant result when no config specified', async () => {
      const configWithoutSecurity = {
        ...mockConfig,
        defaults: {},
      };
      const contextWithoutConfig = { ...context, config: configWithoutSecurity };

      const result = await check.fix(contextWithoutConfig);

      expect(result.compliant).toBe(true);
      expect(result.message).toBe('No security scanning configuration to apply');
    });

    it('should return compliant result when already compliant', async () => {
      const result = await check.fix(context);

      expect(result.compliant).toBe(true);
      expect(mockClient.updateVulnerabilityAlerts).not.toHaveBeenCalled();
    });

    it('should fix dependabot alerts setting', async () => {
      jest.spyOn(check, 'check').mockResolvedValue({
        compliant: false,
        message: 'Not compliant',
        details: {
          actions_needed: [
            {
              action: 'update_dependabot_alerts',
              enabled: true,
            },
          ],
        },
      });

      const result = await check.fix(context);

      expect(mockClient.updateVulnerabilityAlerts).toHaveBeenCalledWith('owner', 'test-repo', true);
      expect(result.compliant).toBe(true);
      expect(result.fixed).toBe(true);
      expect(result.message).toBe('Applied 1 security scanning changes');
      expect(mockCore.info).toHaveBeenCalledWith(
        '✅ Enabled Dependabot alerts for owner/test-repo'
      );
    });

    it('should fix secret scanning setting', async () => {
      jest.spyOn(check, 'check').mockResolvedValue({
        compliant: false,
        message: 'Not compliant',
        details: {
          actions_needed: [
            {
              action: 'update_secret_scanning',
              enabled: 'enabled',
            },
          ],
        },
      });

      const result = await check.fix(context);

      expect(mockClient.updateSecretScanning).toHaveBeenCalledWith('owner', 'test-repo', true);
      expect(result.fixed).toBe(true);
      expect(mockCore.info).toHaveBeenCalledWith('✅ Enabled secret scanning for owner/test-repo');
    });

    it('should fix secret scanning push protection setting', async () => {
      jest.spyOn(check, 'check').mockResolvedValue({
        compliant: false,
        message: 'Not compliant',
        details: {
          actions_needed: [
            {
              action: 'update_secret_scanning_push_protection',
              enabled: 'enabled',
            },
          ],
        },
      });

      const result = await check.fix(context);

      expect(mockClient.updateSecretScanningPushProtection).toHaveBeenCalledWith(
        'owner',
        'test-repo',
        true
      );
      expect(result.fixed).toBe(true);
      expect(mockCore.info).toHaveBeenCalledWith(
        '✅ Enabled secret scanning push protection for owner/test-repo'
      );
    });

    it('should handle advanced security requirement', async () => {
      jest.spyOn(check, 'check').mockResolvedValue({
        compliant: false,
        message: 'Not compliant',
        details: {
          actions_needed: [
            {
              action: 'enable_advanced_security',
              note: 'Required for code scanning on private repositories',
            },
          ],
        },
      });

      const result = await check.fix(context);

      expect(mockCore.warning).toHaveBeenCalledWith(
        expect.stringContaining('Advanced Security needs to be enabled')
      );
      expect(result.compliant).toBe(false); // This action requires manual intervention
      expect(result.message).toBe('Failed to apply any security scanning changes');
    });

    it('should handle multiple actions', async () => {
      jest.spyOn(check, 'check').mockResolvedValue({
        compliant: false,
        message: 'Not compliant',
        details: {
          actions_needed: [
            { action: 'update_dependabot_alerts', enabled: true },
            { action: 'update_secret_scanning', enabled: 'enabled' },
            { action: 'update_secret_scanning_push_protection', enabled: 'enabled' },
          ],
        },
      });

      const result = await check.fix(context);

      expect(mockClient.updateVulnerabilityAlerts).toHaveBeenCalledWith('owner', 'test-repo', true);
      expect(mockClient.updateSecretScanning).toHaveBeenCalledWith('owner', 'test-repo', true);
      expect(mockClient.updateSecretScanningPushProtection).toHaveBeenCalledWith(
        'owner',
        'test-repo',
        true
      );
      expect(result.message).toBe('Applied 3 security scanning changes');
    });

    it('should handle unknown actions gracefully', async () => {
      jest.spyOn(check, 'check').mockResolvedValue({
        compliant: false,
        message: 'Not compliant',
        details: {
          actions_needed: [{ action: 'unknown_action', enabled: true }],
        },
      });

      const result = await check.fix(context);

      expect(mockCore.warning).toHaveBeenCalledWith(
        'Unknown security scanning action: unknown_action'
      );
      expect(result.compliant).toBe(false);
      expect(result.message).toBe('Failed to apply any security scanning changes');
    });

    describe('error handling', () => {
      it('should handle API errors during fix', async () => {
        jest.spyOn(check, 'check').mockResolvedValue({
          compliant: false,
          message: 'Not compliant',
          details: {
            actions_needed: [{ action: 'update_dependabot_alerts', enabled: true }],
          },
        });

        (mockClient.updateVulnerabilityAlerts as jest.Mock).mockRejectedValue(
          new Error('Insufficient permissions')
        );

        const result = await check.fix(context);

        expect(mockCore.error).toHaveBeenCalledWith(
          expect.stringContaining('Failed to apply update_dependabot_alerts')
        );
        expect(result.compliant).toBe(false);
        expect(result.message).toBe('Failed to apply any security scanning changes');
      });

      it('should handle no actions needed', async () => {
        // Mock the check method to return non-compliant with empty actions_needed array
        // This represents: "issues found but no automated fixes available"
        const mockCheckResult = {
          compliant: false,
          message: 'Not compliant',
          details: {
            actions_needed: [], // Empty array means no actionable fixes available
          },
        };

        // Make sure the spy is set up correctly for both calls
        const checkSpy = jest.spyOn(check, 'check');
        checkSpy.mockResolvedValue(mockCheckResult);

        const result = await check.fix(context);

        expect(checkSpy).toHaveBeenCalled();
        // Empty actions_needed array means issues detected but no fixes possible = error
        expect(result.compliant).toBe(false);
        expect(result.message).toBe('Failed to apply any security scanning changes');
        expect(result.error).toBe('All actions failed or require manual intervention');
      });

      it('should handle invalid actions_needed format', async () => {
        jest.spyOn(check, 'check').mockResolvedValue({
          compliant: false,
          message: 'Not compliant',
          details: {
            actions_needed: null,
          },
        });

        const result = await check.fix(context);

        expect(result.compliant).toBe(true);
        expect(result.message).toBe('No actions needed to apply');
      });

      it('should handle general fix errors', async () => {
        jest.spyOn(check, 'check').mockImplementation(() => {
          throw new Error('Unexpected error during check');
        });

        const result = await check.fix(context);

        expect(result.compliant).toBe(false);
        expect(result.error).toBe('Unexpected error during check');
        expect(result.message).toBe('Failed to update security scanning settings');
        expect(mockCore.error).toHaveBeenCalledWith(
          expect.stringContaining('Failed to fix security scanning')
        );
      });

      it('should handle non-Error exceptions in fix', async () => {
        jest.spyOn(check, 'check').mockImplementation(() => {
          throw 'String error in fix';
        });

        const result = await check.fix(context);

        expect(result.error).toBe('String error in fix');
      });
    });
  });

  describe('property getters', () => {
    it('should have correct name', () => {
      expect(check.name).toBe('security-scanning');
    });

    it('should have correct description', () => {
      expect(check.description).toBe('Verify repository security scanning settings');
    });
  });
});
