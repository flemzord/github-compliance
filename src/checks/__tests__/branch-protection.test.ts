import * as core from '@actions/core';
import type { ComplianceConfig } from '../../config/types';
import type { GitHubClient, Repository } from '../../github/types';
import type { TestableBranchProtectionCheck } from '../../test/test-types';
import type { CheckContext } from '../base';
import { BranchProtectionCheck } from '../branch-protection';

// Mock @actions/core
jest.mock('@actions/core');
const mockCore = core as jest.Mocked<typeof core>;

// Mock GitHubClient
const mockClient: Partial<GitHubClient> = {
  getBranchProtection: jest.fn(),
  updateBranchProtection: jest.fn(),
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

// Mock ComplianceConfig - The implementation expects branch_protection to be an object with branch names as keys
const mockConfig: Record<string, unknown> = {
  version: 1,
  organization: 'test-org',
  defaults: {
    branch_protection: {
      main: {
        required_status_checks: {
          strict: true,
          contexts: ['ci/tests', 'ci/lint'],
        },
        enforce_admins: true,
        required_pull_request_reviews: {
          required_approving_review_count: 2,
          dismiss_stale_reviews: true,
          require_code_owner_reviews: true,
        },
        restrictions: {
          users: ['admin'],
          teams: ['maintainers'],
        },
      },
      develop: {
        required_status_checks: {
          strict: false,
          contexts: ['ci/tests'],
        },
        enforce_admins: false,
        required_pull_request_reviews: {
          required_approving_review_count: 1,
          dismiss_stale_reviews: false,
          require_code_owner_reviews: false,
        },
        restrictions: null,
      },
    },
  },
};

// Mock branch protection responses
const mockMainProtection = {
  required_status_checks: {
    strict: true,
    contexts: ['ci/tests', 'ci/lint'],
  },
  enforce_admins: { enabled: true },
  required_pull_request_reviews: {
    required_approving_review_count: 2,
    dismiss_stale_reviews: true,
    require_code_owner_reviews: true,
  },
  restrictions: {
    users: ['admin'],
    teams: ['maintainers'],
  },
};

const mockIncompleteProtection = {
  required_status_checks: {
    strict: false,
    contexts: ['ci/tests'],
  },
  enforce_admins: { enabled: false },
  required_pull_request_reviews: {
    required_approving_review_count: 1,
    dismiss_stale_reviews: false,
    require_code_owner_reviews: false,
  },
  restrictions: null,
};

describe('BranchProtectionCheck', () => {
  let check: BranchProtectionCheck;
  let context: CheckContext;

  beforeEach(() => {
    check = new BranchProtectionCheck();
    context = {
      client: mockClient as GitHubClient,
      config: mockConfig as unknown as ComplianceConfig,
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
    it('should return true when branch_protection config exists', () => {
      expect(check.shouldRun(context)).toBe(true);
    });

    it('should return false when no branch_protection config', () => {
      const configWithoutBranchProtection = {
        ...mockConfig,
        version: 1 as const,
        defaults: {},
      };
      const contextWithoutConfig = { ...context, config: configWithoutBranchProtection };

      expect(check.shouldRun(contextWithoutConfig)).toBe(false);
    });
  });

  describe('check', () => {
    it('should return compliant when no config specified', async () => {
      const configWithoutBranchProtection = {
        ...mockConfig,
        version: 1 as const,
        defaults: {},
      };
      const contextWithoutConfig = { ...context, config: configWithoutBranchProtection };

      const result = await check.check(contextWithoutConfig);

      expect(result.compliant).toBe(true);
      expect(result.message).toBe('No branch protection configuration specified');
    });

    describe('missing protection rules', () => {
      it('should detect branch without protection when rules are expected', async () => {
        (mockClient.getBranchProtection as jest.Mock).mockResolvedValue(null);

        const result = await check.check(context);

        expect(result.compliant).toBe(false);
        expect(result.message).toContain("Branch 'main' should have protection rules but has none");
        expect(result.details?.actions_needed).toContainEqual({
          action: 'enable_protection',
          branch: 'main',
          rules: (
            (mockConfig.defaults as Record<string, unknown>).branch_protection as Record<
              string,
              unknown
            >
          ).main,
        });
      });

      it('should be compliant when no protection is expected and none exists', async () => {
        const configWithNullRules = {
          ...mockConfig,
          defaults: {
            branch_protection: {
              main: null,
            },
          },
        };
        const contextWithNullRules = {
          ...context,
          config: configWithNullRules as unknown as ComplianceConfig,
        };

        (mockClient.getBranchProtection as jest.Mock).mockResolvedValue(null);

        const result = await check.check(contextWithNullRules);

        expect(result.compliant).toBe(true);
      });
    });

    describe('required_status_checks validation', () => {
      it('should detect missing required status checks', async () => {
        const protectionWithoutStatusChecks = {
          ...mockMainProtection,
          required_status_checks: null,
        };
        (mockClient.getBranchProtection as jest.Mock).mockResolvedValue(
          protectionWithoutStatusChecks
        );

        const result = await check.check(context);

        expect(result.compliant).toBe(false);
        expect(result.message).toContain("Branch 'main' should require status checks");
        expect(result.details?.actions_needed).toContainEqual({
          action: 'update_protection',
          branch: 'main',
          field: 'required_status_checks',
          expected: (
            (mockConfig.defaults as Record<string, unknown>).branch_protection as Record<
              string,
              unknown
            >
          ).main.required_status_checks,
        });
      });

      it('should detect incorrect strict setting', async () => {
        const protectionWithWrongStrict = {
          ...mockMainProtection,
          required_status_checks: {
            strict: false, // should be true
            contexts: ['ci/tests', 'ci/lint'],
          },
        };
        (mockClient.getBranchProtection as jest.Mock).mockResolvedValue(protectionWithWrongStrict);

        const result = await check.check(context);

        expect(result.compliant).toBe(false);
        expect(result.message).toContain(
          "Branch 'main' strict status checks should be enabled but is disabled"
        );
      });

      it('should detect missing required contexts', async () => {
        const protectionWithMissingContexts = {
          ...mockMainProtection,
          required_status_checks: {
            strict: true,
            contexts: ['ci/tests'], // missing 'ci/lint'
          },
        };
        (mockClient.getBranchProtection as jest.Mock).mockResolvedValue(
          protectionWithMissingContexts
        );

        const result = await check.check(context);

        expect(result.compliant).toBe(false);
        expect(result.message).toContain(
          "Branch 'main' missing required status check contexts: ci/lint"
        );
      });

      it('should detect unwanted status checks', async () => {
        const developConfig = {
          ...mockConfig,
          defaults: {
            branch_protection: {
              main: {
                required_status_checks: null, // should not require status checks
              },
            },
          },
        };
        const developContext = { ...context, config: developConfig };

        (mockClient.getBranchProtection as jest.Mock).mockResolvedValue(mockMainProtection);

        const result = await check.check(developContext);

        expect(result.compliant).toBe(false);
        expect(result.message).toContain("Branch 'main' should not require status checks but does");
        expect(result.details?.actions_needed).toContainEqual({
          action: 'update_protection',
          branch: 'main',
          field: 'required_status_checks',
          expected: null,
        });
      });

      it('should be compliant when status checks match exactly', async () => {
        (mockClient.getBranchProtection as jest.Mock).mockResolvedValue(mockMainProtection);

        const result = await check.check(context);

        expect(result.compliant).toBe(true);
        expect(result.message).toBe('Branch protection rules are configured correctly');
      });
    });

    describe('enforce_admins validation', () => {
      it('should detect incorrect admin enforcement setting', async () => {
        const protectionWithWrongAdminEnforcement = {
          ...mockMainProtection,
          enforce_admins: { enabled: false }, // should be true
        };
        (mockClient.getBranchProtection as jest.Mock).mockResolvedValue(
          protectionWithWrongAdminEnforcement
        );

        const result = await check.check(context);

        expect(result.compliant).toBe(false);
        expect(result.message).toContain(
          "Branch 'main' admin enforcement should be enabled but is disabled"
        );
        expect(result.details?.actions_needed).toContainEqual({
          action: 'update_protection',
          branch: 'main',
          field: 'enforce_admins',
          expected: true,
        });
      });

      it('should handle enforce_admins as undefined', async () => {
        const protectionWithUndefinedAdminEnforcement = {
          ...mockMainProtection,
          enforce_admins: undefined,
        };
        (mockClient.getBranchProtection as jest.Mock).mockResolvedValue(
          protectionWithUndefinedAdminEnforcement
        );

        const result = await check.check(context);

        expect(result.compliant).toBe(false);
        expect(result.message).toContain(
          "Branch 'main' admin enforcement should be enabled but is disabled"
        );
      });
    });

    describe('required_pull_request_reviews validation', () => {
      it('should detect missing pull request reviews requirement', async () => {
        const protectionWithoutReviews = {
          ...mockMainProtection,
          required_pull_request_reviews: null,
        };
        (mockClient.getBranchProtection as jest.Mock).mockResolvedValue(protectionWithoutReviews);

        const result = await check.check(context);

        expect(result.compliant).toBe(false);
        expect(result.message).toContain("Branch 'main' should require pull request reviews");
        expect(result.details?.actions_needed).toContainEqual({
          action: 'update_protection',
          branch: 'main',
          field: 'required_pull_request_reviews',
          expected: (
            (mockConfig.defaults as Record<string, unknown>).branch_protection as Record<
              string,
              unknown
            >
          ).main.required_pull_request_reviews,
        });
      });

      it('should detect incorrect required approving review count', async () => {
        const protectionWithWrongReviewCount = {
          ...mockMainProtection,
          required_pull_request_reviews: {
            ...mockMainProtection.required_pull_request_reviews,
            required_approving_review_count: 1, // should be 2
          },
        };
        (mockClient.getBranchProtection as jest.Mock).mockResolvedValue(
          protectionWithWrongReviewCount
        );

        const result = await check.check(context);

        expect(result.compliant).toBe(false);
        expect(result.message).toContain(
          "Branch 'main' should require 2 approving reviews but requires 1"
        );
      });

      it('should detect incorrect dismiss stale reviews setting', async () => {
        const protectionWithWrongDismissStale = {
          ...mockMainProtection,
          required_pull_request_reviews: {
            ...mockMainProtection.required_pull_request_reviews,
            dismiss_stale_reviews: false, // should be true
          },
        };
        (mockClient.getBranchProtection as jest.Mock).mockResolvedValue(
          protectionWithWrongDismissStale
        );

        const result = await check.check(context);

        expect(result.compliant).toBe(false);
        expect(result.message).toContain(
          "Branch 'main' dismiss stale reviews should be enabled but is disabled"
        );
      });

      it('should detect incorrect require code owner reviews setting', async () => {
        const protectionWithWrongCodeOwnerReviews = {
          ...mockMainProtection,
          required_pull_request_reviews: {
            ...mockMainProtection.required_pull_request_reviews,
            require_code_owner_reviews: false, // should be true
          },
        };
        (mockClient.getBranchProtection as jest.Mock).mockResolvedValue(
          protectionWithWrongCodeOwnerReviews
        );

        const result = await check.check(context);

        expect(result.compliant).toBe(false);
        expect(result.message).toContain(
          "Branch 'main' code owner reviews should be required but is not required"
        );
      });

      it('should detect unwanted pull request reviews', async () => {
        const configWithoutReviews = {
          ...mockConfig,
          defaults: {
            branch_protection: {
              main: {
                required_pull_request_reviews: null,
              },
            },
          },
        };
        const contextWithoutReviews = { ...context, config: configWithoutReviews };

        (mockClient.getBranchProtection as jest.Mock).mockResolvedValue(mockMainProtection);

        const result = await check.check(contextWithoutReviews);

        expect(result.compliant).toBe(false);
        expect(result.message).toContain(
          "Branch 'main' should not require pull request reviews but does"
        );
        expect(result.details?.actions_needed).toContainEqual({
          action: 'update_protection',
          branch: 'main',
          field: 'required_pull_request_reviews',
          expected: null,
        });
      });
    });

    describe('restrictions validation', () => {
      it('should detect missing restrictions', async () => {
        const protectionWithoutRestrictions = {
          ...mockMainProtection,
          restrictions: null,
        };
        (mockClient.getBranchProtection as jest.Mock).mockResolvedValue(
          protectionWithoutRestrictions
        );

        const result = await check.check(context);

        expect(result.compliant).toBe(false);
        expect(result.message).toContain("Branch 'main' should have push restrictions");
        expect(result.details?.actions_needed).toContainEqual({
          action: 'update_protection',
          branch: 'main',
          field: 'restrictions',
          expected: (
            (mockConfig.defaults as Record<string, unknown>).branch_protection as Record<
              string,
              unknown
            >
          ).main.restrictions,
        });
      });

      it('should detect unwanted restrictions', async () => {
        const configWithoutRestrictions = {
          ...mockConfig,
          defaults: {
            branch_protection: {
              main: {
                restrictions: null,
              },
            },
          },
        };
        const contextWithoutRestrictions = { ...context, config: configWithoutRestrictions };

        (mockClient.getBranchProtection as jest.Mock).mockResolvedValue(mockMainProtection);

        const result = await check.check(contextWithoutRestrictions);

        expect(result.compliant).toBe(false);
        expect(result.message).toContain(
          "Branch 'main' should not have push restrictions but does"
        );
        expect(result.details?.actions_needed).toContainEqual({
          action: 'update_protection',
          branch: 'main',
          field: 'restrictions',
          expected: null,
        });
      });
    });

    describe('multiple branches', () => {
      it('should validate multiple branches', async () => {
        const multiBranchConfig = {
          ...mockConfig,
          defaults: {
            branch_protection: {
              main: (mockConfig.defaults as Record<string, unknown>).branch_protection.main,
              develop: (
                (mockConfig.defaults as Record<string, unknown>).branch_protection as Record<
                  string,
                  unknown
                >
              ).develop,
            },
          },
        };
        const multiBranchContext = { ...context, config: multiBranchConfig as ComplianceConfig };

        (mockClient.getBranchProtection as jest.Mock)
          .mockResolvedValueOnce(mockMainProtection) // main branch
          .mockResolvedValueOnce(mockIncompleteProtection); // develop branch

        const result = await check.check(multiBranchContext);

        expect(mockClient.getBranchProtection).toHaveBeenCalledWith('owner', 'test-repo', 'main');
        expect(mockClient.getBranchProtection).toHaveBeenCalledWith(
          'owner',
          'test-repo',
          'develop'
        );
        expect(result.compliant).toBe(true); // Both match their respective configs
      });

      it('should detect issues across multiple branches', async () => {
        const multiBranchConfig = {
          ...mockConfig,
          defaults: {
            branch_protection: {
              main: (mockConfig.defaults as Record<string, unknown>).branch_protection.main,
              develop: {
                enforce_admins: true, // develop expects true but has false
              },
            },
          },
        };
        const multiBranchContext = { ...context, config: multiBranchConfig as ComplianceConfig };

        (mockClient.getBranchProtection as jest.Mock)
          .mockResolvedValueOnce(mockMainProtection) // main branch (compliant)
          .mockResolvedValueOnce(mockIncompleteProtection); // develop branch (non-compliant)

        const result = await check.check(multiBranchContext);

        expect(result.compliant).toBe(false);
        expect(result.message).toContain(
          "Branch 'develop' admin enforcement should be enabled but is disabled"
        );
      });
    });

    describe('error handling', () => {
      it('should handle API errors gracefully', async () => {
        (mockClient.getBranchProtection as jest.Mock).mockRejectedValue(
          new Error('Branch not found')
        );

        const result = await check.check(context);

        expect(result.compliant).toBe(false);
        expect(result.error).toBe('Branch not found');
        expect(result.message).toBe('Failed to check branch protection rules');
        expect(mockCore.error).toHaveBeenCalledWith(
          expect.stringContaining('Failed to check branch protection')
        );
      });

      it('should handle non-Error exceptions', async () => {
        (mockClient.getBranchProtection as jest.Mock).mockRejectedValue('String error');

        const result = await check.check(context);

        expect(result.error).toBe('String error');
      });
    });
  });

  describe('fix', () => {
    beforeEach(() => {
      (mockClient.updateBranchProtection as jest.Mock).mockResolvedValue({});
    });

    it('should return check result when in dry run mode', async () => {
      const dryRunContext = { ...context, dryRun: true };

      const result = await check.fix(dryRunContext);

      expect(result.compliant).toBe(true);
      expect(mockClient.updateBranchProtection).not.toHaveBeenCalled();
    });

    it('should return compliant result when no config specified', async () => {
      const configWithoutBranchProtection = {
        ...mockConfig,
        version: 1 as const,
        defaults: {},
      };
      const contextWithoutConfig = { ...context, config: configWithoutBranchProtection };

      const result = await check.fix(contextWithoutConfig);

      expect(result.compliant).toBe(true);
      expect(result.message).toBe('No branch protection configuration to apply');
    });

    it('should return compliant result when already compliant', async () => {
      (mockClient.getBranchProtection as jest.Mock).mockResolvedValue(mockMainProtection);

      const result = await check.fix(context);

      expect(result.compliant).toBe(true);
      expect(mockClient.updateBranchProtection).not.toHaveBeenCalled();
    });

    it('should enable protection when action is needed', async () => {
      (mockClient.getBranchProtection as jest.Mock).mockResolvedValue(null);

      const result = await check.fix(context);

      const branchProtection = (mockConfig.defaults as Record<string, unknown>)
        .branch_protection as Record<string, unknown>;
      const mainProtection = branchProtection.main as Record<string, unknown>;

      expect(mockClient.updateBranchProtection).toHaveBeenCalledWith('owner', 'test-repo', 'main', {
        required_status_checks: mainProtection.required_status_checks,
        enforce_admins: mainProtection.enforce_admins,
        required_pull_request_reviews: mainProtection.required_pull_request_reviews,
        restrictions: mainProtection.restrictions,
      });
      expect(result.compliant).toBe(true);
      expect(result.fixed).toBe(true);
      expect(result.message).toBe('Applied 1 branch protection changes');
      expect(mockCore.info).toHaveBeenCalledWith(
        '✅ Enabled protection for main in owner/test-repo'
      );
    });

    it('should update protection when action is needed', async () => {
      const wrongProtection = {
        ...mockMainProtection,
        enforce_admins: { enabled: false },
      };
      (mockClient.getBranchProtection as jest.Mock).mockResolvedValue(wrongProtection);

      const result = await check.fix(context);

      expect(mockClient.updateBranchProtection).toHaveBeenCalledWith(
        'owner',
        'test-repo',
        'main',
        expect.objectContaining({
          enforce_admins: true,
        })
      );
      expect(result.message).toBe('Applied 1 branch protection changes');
      expect(mockCore.info).toHaveBeenCalledWith(
        '✅ Updated protection for main in owner/test-repo'
      );
    });

    it('should handle multiple actions', async () => {
      const branchProtection = (mockConfig.defaults as Record<string, unknown>)
        .branch_protection as Record<string, unknown>;
      const multiBranchConfig = {
        version: 1,
        organization: 'test-org',
        defaults: {
          branch_protection: {
            main: branchProtection.main,
            develop: branchProtection.develop,
          },
        },
      };
      const multiBranchContext = { ...context, config: multiBranchConfig as ComplianceConfig };

      (mockClient.getBranchProtection as jest.Mock)
        .mockResolvedValueOnce(null) // main needs enabling
        .mockResolvedValueOnce(null); // develop needs enabling

      const result = await check.fix(multiBranchContext);

      expect(mockClient.updateBranchProtection).toHaveBeenCalledTimes(2);
      expect(result.message).toBe('Applied 2 branch protection changes');
    });

    it('should handle API errors during fix', async () => {
      (mockClient.getBranchProtection as jest.Mock).mockResolvedValue(null);
      (mockClient.updateBranchProtection as jest.Mock).mockRejectedValue(
        new Error('Insufficient permissions')
      );

      const result = await check.fix(context);

      expect(mockCore.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to apply enable_protection for main')
      );
      expect(result.compliant).toBe(false);
      expect(result.message).toBe('Failed to apply any branch protection changes');
    });

    it('should handle no actions needed', async () => {
      jest.spyOn(check, 'check').mockResolvedValue({
        compliant: false,
        message: 'Not compliant',
        details: {
          actions_needed: [],
        },
      });

      const result = await check.fix(context);

      expect(result.compliant).toBe(true);
      expect(result.message).toBe('No actions needed to apply');
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
      expect(result.message).toBe('Failed to update branch protection rules');
      expect(mockCore.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fix branch protection')
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

  describe('buildProtectionRules', () => {
    it('should build protection rules from config', () => {
      const config = {
        required_status_checks: { strict: true, contexts: ['test'] },
        enforce_admins: true,
        required_pull_request_reviews: { required_approving_review_count: 1 },
        restrictions: { users: ['admin'] },
      };

      const result = (check as unknown as TestableBranchProtectionCheck).buildProtectionRules(
        config
      );

      expect(result).toEqual({
        required_status_checks: { strict: true, contexts: ['test'] },
        enforce_admins: true,
        required_pull_request_reviews: { required_approving_review_count: 1 },
        restrictions: { users: ['admin'] },
      });
    });

    it('should handle undefined config values', () => {
      const config = {
        required_status_checks: { strict: true },
        // other fields undefined
      };

      const result = (check as unknown as TestableBranchProtectionCheck).buildProtectionRules(
        config
      );

      expect(result).toEqual({
        required_status_checks: { strict: true },
      });
    });

    it('should handle empty config', () => {
      const config = {};

      const result = (check as unknown as TestableBranchProtectionCheck).buildProtectionRules(
        config
      );

      expect(result).toEqual({});
    });
  });

  describe('property getters', () => {
    it('should have correct name', () => {
      expect(check.name).toBe('branch-protection');
    });

    it('should have correct description', () => {
      expect(check.description).toBe('Verify repository branch protection rules');
    });
  });
});
