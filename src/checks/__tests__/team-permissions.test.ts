import * as core from '@actions/core';
import type { ComplianceConfig } from '../../config/types';
import type { Collaborator, GitHubClient, Repository, TeamPermission } from '../../github/types';
import type { CheckContext } from '../base';
import { TeamPermissionsCheck } from '../team-permissions';

// Mock @actions/core
jest.mock('@actions/core');
const mockCore = core as jest.Mocked<typeof core>;

// Mock GitHubClient
const mockClient: Partial<GitHubClient> = {
  getTeamPermissions: jest.fn(),
  getCollaborators: jest.fn(),
  addTeamToRepository: jest.fn(),
  removeCollaborator: jest.fn(),
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
    permissions: {
      remove_individual_collaborators: true,
      teams: [
        { team: 'developers', permission: 'write' },
        { team: 'maintainers', permission: 'admin' },
        { team: 'readers', permission: 'read' },
      ],
    },
  },
};

// Mock team permissions
const mockTeamPermissions: TeamPermission[] = [
  {
    id: 1,
    name: 'Developers',
    slug: 'developers',
    permission: 'write',
  },
  {
    id: 2,
    name: 'Maintainers',
    slug: 'maintainers',
    permission: 'admin',
  },
  {
    id: 3,
    name: 'Readers',
    slug: 'readers',
    permission: 'read',
  },
];

// Mock collaborators
const mockCollaborators: Collaborator[] = [
  {
    id: 1,
    login: 'user1',
    type: 'User',
    permissions: {
      admin: false,
      maintain: false,
      push: true,
      triage: false,
      pull: true,
    },
  },
  {
    id: 2,
    login: 'bot-user',
    type: 'Bot',
    permissions: {
      admin: false,
      maintain: false,
      push: false,
      triage: false,
      pull: true,
    },
  },
  {
    id: 3,
    login: 'admin-user',
    type: 'User',
    permissions: {
      admin: true,
      maintain: true,
      push: true,
      triage: true,
      pull: true,
    },
  },
];

describe('TeamPermissionsCheck', () => {
  let check: TeamPermissionsCheck;
  let context: CheckContext;

  beforeEach(() => {
    check = new TeamPermissionsCheck();
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
    it('should return true when permissions config exists', () => {
      expect(check.shouldRun(context)).toBe(true);
    });

    it('should return false when no permissions config', () => {
      const configWithoutPermissions = {
        ...mockConfig,
        defaults: {},
      };
      const contextWithoutConfig = { ...context, config: configWithoutPermissions };

      expect(check.shouldRun(contextWithoutConfig)).toBe(false);
    });
  });

  describe('check', () => {
    beforeEach(() => {
      (mockClient.getTeamPermissions as jest.Mock).mockResolvedValue(mockTeamPermissions);
      (mockClient.getCollaborators as jest.Mock).mockResolvedValue(mockCollaborators);
    });

    it('should return compliant when no config specified', async () => {
      const configWithoutPermissions = {
        ...mockConfig,
        defaults: {},
      };
      const contextWithoutConfig = { ...context, config: configWithoutPermissions };

      const result = await check.check(contextWithoutConfig);

      expect(result.compliant).toBe(true);
      expect(result.message).toBe('No permissions configuration specified');
    });

    it('should be compliant when all teams and collaborators match config', async () => {
      const configWithoutIndividualCollabRemoval = {
        ...mockConfig,
        defaults: {
          permissions: {
            remove_individual_collaborators: false,
            teams: mockConfig.defaults.permissions?.teams || [],
          },
        },
      };
      const contextWithoutRemoval = { ...context, config: configWithoutIndividualCollabRemoval };

      const result = await check.check(contextWithoutRemoval);

      expect(result.compliant).toBe(true);
      expect(result.message).toBe('Repository permissions are configured correctly');
      expect(result.details?.current).toEqual({
        teams: mockTeamPermissions,
        collaborators: mockCollaborators,
      });
      expect(result.details?.expected).toEqual(
        configWithoutIndividualCollabRemoval.defaults.permissions
      );
    });

    describe('team permissions validation', () => {
      it('should detect missing team', async () => {
        const incompleteTeamPermissions = [
          mockTeamPermissions[0], // developers
          mockTeamPermissions[1], // maintainers
          // missing readers team
        ];
        (mockClient.getTeamPermissions as jest.Mock).mockResolvedValue(incompleteTeamPermissions);

        const result = await check.check(context);

        expect(result.compliant).toBe(false);
        expect(result.message).toContain(
          "Team 'readers' should have 'read' permission but is not assigned"
        );
        expect(result.details?.actions_needed).toContainEqual({
          action: 'add_team',
          team: 'readers',
          permission: 'read',
        });
      });

      it('should detect team with incorrect permission', async () => {
        const wrongPermissionTeams = [
          mockTeamPermissions[0], // developers (correct)
          {
            ...mockTeamPermissions[1],
            permission: 'write' as const, // maintainers should be admin, not write
          },
          mockTeamPermissions[2], // readers (correct)
        ];
        (mockClient.getTeamPermissions as jest.Mock).mockResolvedValue(wrongPermissionTeams);

        const result = await check.check(context);

        expect(result.compliant).toBe(false);
        expect(result.message).toContain(
          "Team 'maintainers' should have 'admin' permission but has 'write'"
        );
        expect(result.details?.actions_needed).toContainEqual({
          action: 'update_team',
          team: 'maintainers',
          current_permission: 'write',
          new_permission: 'admin',
        });
      });

      it('should warn about extra teams not in configuration', async () => {
        const extraTeamPermissions = [
          ...mockTeamPermissions,
          {
            id: 4,
            name: 'Extra Team',
            slug: 'extra-team',
            permission: 'write' as const,
          },
        ];
        (mockClient.getTeamPermissions as jest.Mock).mockResolvedValue(extraTeamPermissions);

        await check.check(context);

        expect(mockCore.warning).toHaveBeenCalledWith(
          "Team 'extra-team' has access to owner/test-repo but is not in configuration"
        );
        // Should not be added to actions_needed since we only warn about extra teams
      });

      it('should handle empty teams configuration', async () => {
        const configWithoutTeams = {
          ...mockConfig,
          defaults: {
            permissions: {
              remove_individual_collaborators: false,
              teams: [],
            },
          },
        };
        const contextWithoutTeams = { ...context, config: configWithoutTeams };

        await check.check(contextWithoutTeams);

        // Should warn about all existing teams since none are configured
        expect(mockCore.warning).toHaveBeenCalledWith(
          expect.stringContaining("Team 'developers' has access")
        );
        expect(mockCore.warning).toHaveBeenCalledWith(
          expect.stringContaining("Team 'maintainers' has access")
        );
        expect(mockCore.warning).toHaveBeenCalledWith(
          expect.stringContaining("Team 'readers' has access")
        );
      });
    });

    describe('individual collaborators validation', () => {
      it('should detect individual collaborators when removal is required', async () => {
        const result = await check.check(context);

        expect(result.compliant).toBe(false);
        expect(result.message).toContain(
          'Individual collaborators should be removed: user1, admin-user'
        );
        expect(result.details?.actions_needed).toContainEqual({
          action: 'remove_collaborator',
          username: 'user1',
          current_permission: 'write',
        });
        expect(result.details?.actions_needed).toContainEqual({
          action: 'remove_collaborator',
          username: 'admin-user',
          current_permission: 'admin',
        });
      });

      it('should not flag bot users for removal', async () => {
        const result = await check.check(context);

        // Bot users should not be in the removal list
        expect(result.message).not.toContain('bot-user');
        expect(result.details?.actions_needed).not.toContainEqual(
          expect.objectContaining({ username: 'bot-user' })
        );
      });

      it('should be compliant when individual collaborator removal is disabled', async () => {
        const configWithoutRemoval = {
          ...mockConfig,
          defaults: {
            permissions: {
              remove_individual_collaborators: false,
              teams: mockConfig.defaults.permissions?.teams || [],
            },
          },
        };
        const contextWithoutRemoval = { ...context, config: configWithoutRemoval };

        const result = await check.check(contextWithoutRemoval);

        expect(result.compliant).toBe(true);
        expect(result.details?.actions_needed).not.toContainEqual(
          expect.objectContaining({ action: 'remove_collaborator' })
        );
      });

      it('should handle no individual collaborators', async () => {
        const onlyBotCollaborators = [mockCollaborators[1]]; // only bot user
        (mockClient.getCollaborators as jest.Mock).mockResolvedValue(onlyBotCollaborators);

        const result = await check.check(context);

        // Should be compliant if only bots are collaborators
        expect(result.details?.actions_needed).not.toContainEqual(
          expect.objectContaining({ action: 'remove_collaborator' })
        );
      });
    });

    describe('permission level mapping', () => {
      it('should correctly identify admin permission level', () => {
        const adminCollaborator = {
          id: 1,
          login: 'admin',
          type: 'User' as const,
          permissions: {
            admin: true,
            maintain: false,
            push: false,
            triage: false,
            pull: false,
          },
        };

        // biome-ignore lint/suspicious/noExplicitAny: Testing private method
        const permissionLevel = (check as any).getCollaboratorPermissionLevel(
          adminCollaborator.permissions
        );
        expect(permissionLevel).toBe('admin');
      });

      it('should correctly identify maintain permission level', () => {
        const maintainCollaborator = {
          permissions: {
            admin: false,
            maintain: true,
            push: false,
            triage: false,
            pull: false,
          },
        };

        // biome-ignore lint/suspicious/noExplicitAny: Testing private method
        const permissionLevel = (check as any).getCollaboratorPermissionLevel(
          maintainCollaborator.permissions
        );
        expect(permissionLevel).toBe('maintain');
      });

      it('should correctly identify write permission level', () => {
        const writeCollaborator = {
          permissions: {
            admin: false,
            maintain: false,
            push: true,
            triage: false,
            pull: false,
          },
        };

        // biome-ignore lint/suspicious/noExplicitAny: Testing private method
        const permissionLevel = (check as any).getCollaboratorPermissionLevel(
          writeCollaborator.permissions
        );
        expect(permissionLevel).toBe('write');
      });

      it('should correctly identify triage permission level', () => {
        const triageCollaborator = {
          permissions: {
            admin: false,
            maintain: false,
            push: false,
            triage: true,
            pull: false,
          },
        };

        // biome-ignore lint/suspicious/noExplicitAny: Testing private method
        const permissionLevel = (check as any).getCollaboratorPermissionLevel(
          triageCollaborator.permissions
        );
        expect(permissionLevel).toBe('triage');
      });

      it('should default to read permission level', () => {
        const readCollaborator = {
          permissions: {
            admin: false,
            maintain: false,
            push: false,
            triage: false,
            pull: true,
          },
        };

        // biome-ignore lint/suspicious/noExplicitAny: Testing private method
        const permissionLevel = (check as any).getCollaboratorPermissionLevel(
          readCollaborator.permissions
        );
        expect(permissionLevel).toBe('read');
      });
    });

    describe('permission mapping for API calls', () => {
      it('should map read to pull', () => {
        // biome-ignore lint/suspicious/noExplicitAny: Testing private method
        expect((check as any).mapPermissionLevel('read')).toBe('pull');
      });

      it('should map write to push', () => {
        // biome-ignore lint/suspicious/noExplicitAny: Testing private method
        expect((check as any).mapPermissionLevel('write')).toBe('push');
      });

      it('should map admin to admin', () => {
        // biome-ignore lint/suspicious/noExplicitAny: Testing private method
        expect((check as any).mapPermissionLevel('admin')).toBe('admin');
      });

      it('should map maintain to maintain', () => {
        // biome-ignore lint/suspicious/noExplicitAny: Testing private method
        expect((check as any).mapPermissionLevel('maintain')).toBe('maintain');
      });

      it('should map triage to triage', () => {
        // biome-ignore lint/suspicious/noExplicitAny: Testing private method
        expect((check as any).mapPermissionLevel('triage')).toBe('triage');
      });

      it('should default unknown permissions to pull', () => {
        // biome-ignore lint/suspicious/noExplicitAny: Testing private method
        expect((check as any).mapPermissionLevel('unknown')).toBe('pull');
      });
    });

    describe('multiple issues', () => {
      it('should detect multiple permission issues', async () => {
        const incompleteTeamPermissions = [
          mockTeamPermissions[0], // developers (correct)
          // missing maintainers and readers
        ];
        (mockClient.getTeamPermissions as jest.Mock).mockResolvedValue(incompleteTeamPermissions);

        const result = await check.check(context);

        expect(result.compliant).toBe(false);
        expect(result.message).toContain(
          "Team 'maintainers' should have 'admin' permission but is not assigned"
        );
        expect(result.message).toContain(
          "Team 'readers' should have 'read' permission but is not assigned"
        );
        expect(result.message).toContain(
          'Individual collaborators should be removed: user1, admin-user'
        );
        expect(result.details?.actions_needed).toHaveLength(4);
      });
    });

    describe('error handling', () => {
      it('should handle API errors gracefully', async () => {
        (mockClient.getTeamPermissions as jest.Mock).mockRejectedValue(
          new Error('Teams API not available')
        );

        const result = await check.check(context);

        expect(result.compliant).toBe(false);
        expect(result.error).toBe('Teams API not available');
        expect(result.message).toBe('Failed to check repository permissions');
        expect(mockCore.error).toHaveBeenCalledWith(
          expect.stringContaining('Failed to check permissions')
        );
      });

      it('should handle collaborators API errors', async () => {
        (mockClient.getTeamPermissions as jest.Mock).mockResolvedValue(mockTeamPermissions);
        (mockClient.getCollaborators as jest.Mock).mockRejectedValue(
          new Error('Collaborators API not available')
        );

        const result = await check.check(context);

        expect(result.error).toBe('Collaborators API not available');
      });

      it('should handle non-Error exceptions', async () => {
        (mockClient.getTeamPermissions as jest.Mock).mockRejectedValue('String error');

        const result = await check.check(context);

        expect(result.error).toBe('String error');
      });
    });
  });

  describe('fix', () => {
    beforeEach(() => {
      (mockClient.getTeamPermissions as jest.Mock).mockResolvedValue(mockTeamPermissions);
      (mockClient.getCollaborators as jest.Mock).mockResolvedValue(mockCollaborators);
      (mockClient.addTeamToRepository as jest.Mock).mockResolvedValue({});
      (mockClient.removeCollaborator as jest.Mock).mockResolvedValue({});
    });

    it('should return check result when in dry run mode', async () => {
      const dryRunContext = { ...context, dryRun: true };

      const result = await check.fix(dryRunContext);

      expect(result.compliant).toBe(false); // Has individual collaborators
      expect(mockClient.addTeamToRepository).not.toHaveBeenCalled();
      expect(mockClient.removeCollaborator).not.toHaveBeenCalled();
    });

    it('should return compliant result when no config specified', async () => {
      const configWithoutPermissions = {
        ...mockConfig,
        defaults: {},
      };
      const contextWithoutConfig = { ...context, config: configWithoutPermissions };

      const result = await check.fix(contextWithoutConfig);

      expect(result.compliant).toBe(true);
      expect(result.message).toBe('No permissions configuration to apply');
    });

    it('should return compliant result when already compliant', async () => {
      const configWithoutRemoval = {
        ...mockConfig,
        defaults: {
          permissions: {
            remove_individual_collaborators: false,
            teams: mockConfig.defaults.permissions?.teams || [],
          },
        },
      };
      const contextWithoutRemoval = { ...context, config: configWithoutRemoval };

      const result = await check.fix(contextWithoutRemoval);

      expect(result.compliant).toBe(true);
      expect(mockClient.addTeamToRepository).not.toHaveBeenCalled();
      expect(mockClient.removeCollaborator).not.toHaveBeenCalled();
    });

    it('should add missing team', async () => {
      jest.spyOn(check, 'check').mockResolvedValue({
        compliant: false,
        message: 'Not compliant',
        details: {
          actions_needed: [
            {
              action: 'add_team',
              team: 'new-team',
              permission: 'write',
            },
          ],
        },
      });

      const result = await check.fix(context);

      expect(mockClient.addTeamToRepository).toHaveBeenCalledWith(
        'owner',
        'test-repo',
        'new-team',
        'push'
      );
      expect(result.compliant).toBe(true);
      expect(result.fixed).toBe(true);
      expect(result.message).toBe('Applied 1 permission changes');
      expect(mockCore.info).toHaveBeenCalledWith('✅ Added team new-team for owner/test-repo');
    });

    it('should update team permission', async () => {
      jest.spyOn(check, 'check').mockResolvedValue({
        compliant: false,
        message: 'Not compliant',
        details: {
          actions_needed: [
            {
              action: 'update_team',
              team: 'existing-team',
              current_permission: 'read',
              new_permission: 'write',
            },
          ],
        },
      });

      const result = await check.fix(context);

      expect(mockClient.addTeamToRepository).toHaveBeenCalledWith(
        'owner',
        'test-repo',
        'existing-team',
        'push'
      );
      expect(result.fixed).toBe(true);
      expect(mockCore.info).toHaveBeenCalledWith(
        '✅ Updated team existing-team for owner/test-repo'
      );
    });

    it('should remove individual collaborator', async () => {
      jest.spyOn(check, 'check').mockResolvedValue({
        compliant: false,
        message: 'Not compliant',
        details: {
          actions_needed: [
            {
              action: 'remove_collaborator',
              username: 'individual-user',
              current_permission: 'write',
            },
          ],
        },
      });

      const result = await check.fix(context);

      expect(mockClient.removeCollaborator).toHaveBeenCalledWith(
        'owner',
        'test-repo',
        'individual-user'
      );
      expect(result.fixed).toBe(true);
      expect(mockCore.info).toHaveBeenCalledWith(
        '✅ Removed collaborator individual-user from owner/test-repo'
      );
    });

    it('should handle multiple actions', async () => {
      jest.spyOn(check, 'check').mockResolvedValue({
        compliant: false,
        message: 'Not compliant',
        details: {
          actions_needed: [
            { action: 'add_team', team: 'team1', permission: 'write' },
            { action: 'update_team', team: 'team2', new_permission: 'admin' },
            { action: 'remove_collaborator', username: 'user1' },
          ],
        },
      });

      const result = await check.fix(context);

      expect(mockClient.addTeamToRepository).toHaveBeenCalledTimes(2); // add and update both call this
      expect(mockClient.removeCollaborator).toHaveBeenCalledTimes(1);
      expect(result.message).toBe('Applied 3 permission changes');
    });

    it('should handle permission level mapping in fix', async () => {
      jest.spyOn(check, 'check').mockResolvedValue({
        compliant: false,
        message: 'Not compliant',
        details: {
          actions_needed: [
            { action: 'add_team', team: 'readers', permission: 'read' },
            { action: 'add_team', team: 'writers', permission: 'write' },
            { action: 'add_team', team: 'admins', permission: 'admin' },
            { action: 'add_team', team: 'maintainers', permission: 'maintain' },
            { action: 'add_team', team: 'triagers', permission: 'triage' },
          ],
        },
      });

      await check.fix(context);

      expect(mockClient.addTeamToRepository).toHaveBeenCalledWith(
        'owner',
        'test-repo',
        'readers',
        'pull'
      );
      expect(mockClient.addTeamToRepository).toHaveBeenCalledWith(
        'owner',
        'test-repo',
        'writers',
        'push'
      );
      expect(mockClient.addTeamToRepository).toHaveBeenCalledWith(
        'owner',
        'test-repo',
        'admins',
        'admin'
      );
      expect(mockClient.addTeamToRepository).toHaveBeenCalledWith(
        'owner',
        'test-repo',
        'maintainers',
        'maintain'
      );
      expect(mockClient.addTeamToRepository).toHaveBeenCalledWith(
        'owner',
        'test-repo',
        'triagers',
        'triage'
      );
    });

    describe('error handling', () => {
      it('should handle API errors during fix', async () => {
        jest.spyOn(check, 'check').mockResolvedValue({
          compliant: false,
          message: 'Not compliant',
          details: {
            actions_needed: [{ action: 'add_team', team: 'new-team', permission: 'write' }],
          },
        });

        (mockClient.addTeamToRepository as jest.Mock).mockRejectedValue(
          new Error('Team does not exist')
        );

        const result = await check.fix(context);

        expect(mockCore.error).toHaveBeenCalledWith(
          expect.stringContaining('Failed to apply add_team for owner/test-repo')
        );
        expect(result.compliant).toBe(false);
        expect(result.message).toBe('Failed to apply any permission changes');
      });

      it('should handle collaborator removal errors', async () => {
        jest.spyOn(check, 'check').mockResolvedValue({
          compliant: false,
          message: 'Not compliant',
          details: {
            actions_needed: [{ action: 'remove_collaborator', username: 'user1' }],
          },
        });

        (mockClient.removeCollaborator as jest.Mock).mockRejectedValue(new Error('User not found'));

        const result = await check.fix(context);

        expect(mockCore.error).toHaveBeenCalledWith(
          expect.stringContaining('Failed to apply remove_collaborator for owner/test-repo')
        );
        expect(result.compliant).toBe(false);
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
        expect(result.message).toBe('Failed to update repository permissions');
        expect(mockCore.error).toHaveBeenCalledWith(
          expect.stringContaining('Failed to fix permissions')
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
      expect(check.name).toBe('team-permissions');
    });

    it('should have correct description', () => {
      expect(check.description).toBe('Verify repository team permissions and collaborator access');
    });
  });
});
