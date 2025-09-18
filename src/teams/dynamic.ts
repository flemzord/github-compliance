import type { DynamicTeamRule, TeamDefinition, TeamsConfig } from '../config/types';
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

function convertDynamicRules(rules: DynamicTeamRule[] | undefined): ResolvedTeam[] {
  return (rules ?? []).map((rule) => ({
    definition: createPlaceholderTeamFromRule(rule),
    members: [],
    source: 'dynamic' as const,
    rule,
  }));
}

export async function resolveTeams(
  _github: GitHubClient,
  config: TeamsConfig,
  options: ResolveTeamsOptions
): Promise<ResolvedTeams> {
  const staticTeams = convertStaticDefinitions(config.definitions);
  const dynamicTeams = convertDynamicRules(config.dynamic_rules);

  if (dynamicTeams.length > 0) {
    options.logger.debug(
      'Dynamic team rules detected but the resolution engine is not implemented yet.'
    );
  }

  return { staticTeams, dynamicTeams };
}
