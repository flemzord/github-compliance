import * as logger from '../logging';
import { BaseCheck, type CheckContext, type CheckResult } from './base';
import type { AppliedAction, CheckDetails, CollaboratorPermissions } from './types';

export class TeamPermissionsCheck extends BaseCheck {
  readonly name = 'repo-access-teams';
  readonly description = 'Verify repository team permissions and collaborator access';

  shouldRun(context: CheckContext): boolean {
    const config = this.getRepoConfig(context, 'permissions');
    return config !== undefined;
  }

  async check(context: CheckContext): Promise<CheckResult> {
    try {
      const { repository } = context;
      const { owner, repo } = this.getRepoInfo(repository);
      const config = this.getRepoConfig(context, 'permissions');

      if (!config) {
        return this.createCompliantResult('No permissions configuration specified');
      }

      const issues: string[] = [];
      const details: CheckDetails = {
        current: {
          teams: [],
          collaborators: [],
        },
        expected: config,
        actions_needed: [],
      };

      const expectedUsers = Array.isArray(config.users) ? config.users : [];

      // Get current teams and collaborators
      const [currentTeams, currentCollaborators] = await Promise.all([
        context.client.getTeamPermissions(owner, repo),
        context.client.getCollaborators(owner, repo),
      ]);

      if (details.current && typeof details.current === 'object') {
        (details.current as Record<string, unknown>).teams = currentTeams;
        (details.current as Record<string, unknown>).collaborators = currentCollaborators;
      }

      const collaboratorsByLogin = new Map(
        currentCollaborators.map(
          (collaborator) => [collaborator.login.toLowerCase(), collaborator] as const
        )
      );

      // Check team permissions
      if (config.teams) {
        for (const expectedTeam of config.teams) {
          const currentTeam = currentTeams.find((t) => t.slug === expectedTeam.team);
          const expectedPermission = this.normalizePermissionLevel(expectedTeam.permission);

          if (!currentTeam) {
            issues.push(
              `Team '${expectedTeam.team}' should have '${expectedTeam.permission}' permission but is not assigned`
            );
            if (details.actions_needed) {
              details.actions_needed.push({
                action: 'add_team',
                team: expectedTeam.team,
                permission: expectedTeam.permission,
              });
            }
          } else {
            const currentPermission = this.normalizePermissionLevel(currentTeam.permission);

            if (currentPermission !== expectedPermission) {
              issues.push(
                `Team '${expectedTeam.team}' should have '${expectedTeam.permission}' permission ` +
                  `but has '${currentTeam.permission}'`
              );
              if (details.actions_needed) {
                details.actions_needed.push({
                  action: 'update_team',
                  team: expectedTeam.team,
                  current_permission: currentTeam.permission,
                  new_permission: expectedTeam.permission,
                });
              }
            }
          }
        }

        // Check for extra teams that should be removed
        const expectedTeamSlugs = config.teams.map((t) => t.team);
        for (const currentTeam of currentTeams) {
          if (!expectedTeamSlugs.includes(currentTeam.slug)) {
            issues.push(`Team '${currentTeam.slug}' has unauthorized access and should be removed`);
            logger.warning(
              `Team '${currentTeam.slug}' has access to ${repository.full_name} but is not in configuration - will be removed`
            );
            if (details.actions_needed) {
              details.actions_needed.push({
                action: 'remove_team',
                team: currentTeam.slug,
                current_permission: currentTeam.permission,
              });
            }
          }
        }
      }

      if (expectedUsers.length > 0) {
        for (const expectedUser of expectedUsers) {
          const loginKey = expectedUser.user.toLowerCase();
          const collaborator = collaboratorsByLogin.get(loginKey);
          const expectedPermission = this.normalizePermissionLevel(expectedUser.permission);

          if (!collaborator) {
            issues.push(
              `User '${expectedUser.user}' should have '${expectedUser.permission}' permission but is not a collaborator`
            );
            if (details.actions_needed) {
              details.actions_needed.push({
                action: 'add_collaborator',
                username: expectedUser.user,
                permission: expectedUser.permission,
              });
            }
          } else {
            const collaboratorPermission = this.getCollaboratorPermissionLevel(
              collaborator.permissions
            );
            const currentPermission = this.normalizePermissionLevel(collaboratorPermission);

            if (currentPermission !== expectedPermission) {
              issues.push(
                `User '${expectedUser.user}' should have '${expectedUser.permission}' permission but has '${collaboratorPermission}'`
              );
              if (details.actions_needed) {
                details.actions_needed.push({
                  action: 'update_collaborator_permission',
                  username: expectedUser.user,
                  current_permission: collaboratorPermission,
                  permission: expectedUser.permission,
                });
              }
            }
          }
        }
      }

      // Check individual collaborators
      if (config.remove_individual_collaborators) {
        const allowlistedUsers = new Set(expectedUsers.map((user) => user.user.toLowerCase()));
        const individualCollaborators = currentCollaborators.filter((c) => c.type === 'User');
        const collaboratorsToRemove = individualCollaborators.filter(
          (collaborator) => !allowlistedUsers.has(collaborator.login.toLowerCase())
        );

        if (collaboratorsToRemove.length > 0) {
          const collaboratorLogins = collaboratorsToRemove.map((c) => c.login);
          issues.push(
            `Individual collaborators should be removed: ${collaboratorLogins.join(', ')}`
          );

          for (const collab of collaboratorsToRemove) {
            if (details.actions_needed) {
              details.actions_needed.push({
                action: 'remove_collaborator',
                username: collab.login,
                current_permission: this.getCollaboratorPermissionLevel(collab.permissions),
              });
            }
          }
        }
      }

      if (issues.length === 0) {
        return this.createCompliantResult(
          'Repository permissions are configured correctly',
          details
        );
      }

      return this.createNonCompliantResult(
        `Permission issues found: ${issues.join('; ')}`,
        details
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        `Failed to check permissions for ${context.repository.full_name}: ${errorMessage}`
      );
      return this.createErrorResult('Failed to check repository permissions', errorMessage);
    }
  }

  async fix(context: CheckContext): Promise<CheckResult> {
    if (context.dryRun) {
      return this.check(context);
    }

    try {
      const { repository } = context;
      const { owner, repo } = this.getRepoInfo(repository);
      const config = this.getRepoConfig(context, 'permissions');

      if (!config) {
        return this.createCompliantResult('No permissions configuration to apply');
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
          switch (action.action) {
            case 'add_team':
            case 'update_team':
              await context.client.addTeamToRepository(
                owner,
                repo,
                action.team as string,
                this.mapPermissionLevel((action.permission || action.new_permission) as string)
              );
              appliedActions.push({
                action: action.action,
                details: {
                  team: action.team,
                  permission: action.permission || action.new_permission,
                },
              });
              logger.info(
                `✅ ${action.action === 'add_team' ? 'Added' : 'Updated'} team ${action.team} for ${repository.full_name}`
              );
              break;

            case 'remove_team':
              await context.client.removeTeamFromRepository(owner, repo, action.team as string);
              appliedActions.push({
                action: 'remove_team',
                details: { team: action.team },
              });
              logger.info(
                `✅ Removed unauthorized team ${action.team} from ${repository.full_name}`
              );
              break;

            case 'add_collaborator':
            case 'update_collaborator_permission':
              await context.client.addCollaborator(
                owner,
                repo,
                action.username as string,
                this.mapPermissionLevel((action.permission || action.new_permission) as string)
              );
              appliedActions.push({
                action: action.action,
                details: {
                  username: action.username,
                  permission: action.permission || action.new_permission,
                },
              });
              logger.info(
                `✅ ${
                  action.action === 'add_collaborator' ? 'Added' : 'Updated'
                } collaborator ${action.username} for ${repository.full_name}`
              );
              break;

            case 'remove_collaborator':
              await context.client.removeCollaborator(owner, repo, action.username as string);
              appliedActions.push({
                action: 'remove_collaborator',
                details: { username: action.username },
              });
              logger.info(
                `✅ Removed collaborator ${action.username} from ${repository.full_name}`
              );
              break;
          }
        } catch (actionError) {
          const errorMessage =
            actionError instanceof Error ? actionError.message : String(actionError);
          logger.error(
            `Failed to apply ${action.action} for ${repository.full_name}: ${errorMessage}`
          );
        }
      }

      if (appliedActions.length === 0) {
        return this.createErrorResult(
          'Failed to apply any permission changes',
          'All actions failed'
        );
      }

      return this.createFixedResult(`Applied ${appliedActions.length} permission changes`, {
        applied_actions: appliedActions,
        total_actions: actions_needed?.length || 0,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        `Failed to fix permissions for ${context.repository.full_name}: ${errorMessage}`
      );
      return this.createErrorResult('Failed to update repository permissions', errorMessage);
    }
  }

  private normalizePermissionLevel(
    permission: string
  ): 'read' | 'triage' | 'write' | 'maintain' | 'admin' {
    switch (permission) {
      case 'pull':
        return 'read';
      case 'push':
        return 'write';
      case 'read':
      case 'triage':
      case 'write':
      case 'maintain':
      case 'admin':
        return permission as 'read' | 'triage' | 'write' | 'maintain' | 'admin';
      default:
        return 'read';
    }
  }

  private getCollaboratorPermissionLevel(permissions: CollaboratorPermissions): string {
    if (permissions.admin) return 'admin';
    if (permissions.maintain) return 'maintain';
    if (permissions.push) return 'write';
    if (permissions.triage) return 'triage';
    return 'read';
  }

  private mapPermissionLevel(
    permission: string
  ): 'pull' | 'triage' | 'push' | 'maintain' | 'admin' {
    switch (permission) {
      case 'read':
      case 'pull':
        return 'pull';
      case 'write':
      case 'push':
        return 'push';
      case 'admin':
      case 'maintain':
      case 'triage':
        return permission as 'admin' | 'maintain' | 'triage';
      default:
        return 'pull';
    }
  }
}
