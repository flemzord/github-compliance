import type { DynamicTeamRule, TeamDefinition, TeamMember, TeamsConfig } from '../config/types';
import type { GitHubClient } from '../github';
import type { Logger } from '../logging';
import type { ResolvedTeam, ResolvedTeams } from './types';

interface ResolveTeamsOptions {
  logger: Logger;
  dryRun: boolean;
}

function createPlaceholderTeamFromRule(rule: DynamicTeamRule): TeamDefinition {
  const definition: TeamDefinition = {
    name: rule.name,
  };

  if (rule.description) {
    definition.description = rule.description;
  }

  return definition;
}

function convertStaticDefinitions(definitions: TeamDefinition[] | undefined): ResolvedTeam[] {
  return (definitions ?? []).map((definition) => ({
    definition,
    members: definition.members ?? [],
    source: 'definition' as const,
  }));
}

async function resolveAllOrgMembers(
  github: GitHubClient,
  owner: string,
  rule: DynamicTeamRule,
  logger: Logger
): Promise<ResolvedTeam | null> {
  try {
    const members = await github.listOrganizationMembers(owner);
    const teamMembers: TeamMember[] = members.map((member) => ({
      username: member.login,
      role: 'member',
    }));

    return {
      definition: createPlaceholderTeamFromRule(rule),
      members: teamMembers,
      source: 'dynamic',
      rule,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to resolve all_org_members rule ${rule.name}: ${message}`);
    return null;
  }
}

export async function resolveTeams(
  github: GitHubClient,
  config: TeamsConfig,
  options: ResolveTeamsOptions,
  owner: string
): Promise<ResolvedTeams> {
  const staticTeams = convertStaticDefinitions(config.definitions);
  const dynamicTeams: ResolvedTeam[] = [];

  if (!config.dynamic_rules) {
    return { staticTeams, dynamicTeams };
  }

  for (const rule of config.dynamic_rules) {
    const ruleName = rule.name;
    switch (rule.type) {
      case 'all_org_members': {
        const team = await resolveAllOrgMembers(github, owner, rule, options.logger);
        if (team) {
          dynamicTeams.push(team);
        }
        break;
      }
      case 'by_filter': {
        options.logger.warning(
          `Dynamic rule ${ruleName} uses unsupported type 'by_filter' and will be skipped.`
        );
        break;
      }
      case 'composite': {
        options.logger.warning(
          `Dynamic rule ${ruleName} uses unsupported type 'composite' and will be skipped.`
        );
        break;
      }
      default: {
        options.logger.warning(
          `Dynamic rule ${ruleName} has unknown type ${(rule as { type: unknown }).type}`
        );
      }
    }
  }

  return { staticTeams, dynamicTeams };
}
