import { ArchivedReposCheck } from '../checks/archived-repos';
import type { ComplianceCheck, OrganizationCheck } from '../checks/base';
import { BranchProtectionCheck } from '../checks/branch-protection';
import { MergeMethodsCheck } from '../checks/merge-methods';
import { RepositorySettingsCheck } from '../checks/repository-settings';
import { RulesetsObserveCheck } from '../checks/rulesets-observe';
import { SecurityScanningCheck } from '../checks/security-scanning';
import { TeamPermissionsCheck } from '../checks/team-permissions';
import { TeamSyncCheck } from '../checks/team-sync';

/**
 * Registry of all available compliance checks
 */
const repositoryCheckRegistry: Record<string, new () => ComplianceCheck> = {
  'repo-merge-strategy': MergeMethodsCheck,
  'repo-access-teams': TeamPermissionsCheck,
  'repo-branch-protection': BranchProtectionCheck,
  'repo-security-controls': SecurityScanningCheck,
  'repo-archival-policy': ArchivedReposCheck,
  'repo-settings': RepositorySettingsCheck,
  'repo-rulesets-observe': RulesetsObserveCheck,
};

const organizationCheckRegistry: Record<string, new () => OrganizationCheck> = {
  'org-team-sync': TeamSyncCheck,
};

const legacyCheckAliases: Record<string, string> = {
  'team-sync': 'org-team-sync',
  'merge-methods': 'repo-merge-strategy',
  'team-permissions': 'repo-access-teams',
  'branch-protection': 'repo-branch-protection',
  'security-scanning': 'repo-security-controls',
  'archived-repos': 'repo-archival-policy',
  'repository-settings': 'repo-settings',
};

/**
 * Get a check class by name
 */
export function normalizeCheckName(name: string): string {
  return (legacyCheckAliases[name] ?? name) as string;
}

export function getCheck(name: string): new () => unknown {
  const normalized = normalizeCheckName(name);
  const CheckClass = repositoryCheckRegistry[normalized] ?? organizationCheckRegistry[normalized];
  if (!CheckClass) {
    throw new Error(`Unknown check: ${name}`);
  }
  return CheckClass;
}

export function getCheckScope(name: string): 'organization' | 'repository' {
  const normalized = normalizeCheckName(name);
  if (organizationCheckRegistry[normalized]) return 'organization';
  if (repositoryCheckRegistry[normalized]) return 'repository';
  throw new Error(`Unknown check: ${name}`);
}

export function getRepositoryCheck(name: string): new () => ComplianceCheck {
  const normalized = normalizeCheckName(name);
  const CheckClass = repositoryCheckRegistry[normalized];
  if (!CheckClass) throw new Error(`Unknown repository check: ${name}`);
  return CheckClass;
}

export function getOrganizationCheck(name: string): new () => OrganizationCheck {
  const normalized = normalizeCheckName(name);
  const CheckClass = organizationCheckRegistry[normalized];
  if (!CheckClass) throw new Error(`Unknown organization check: ${name}`);
  return CheckClass;
}

/**
 * Get all available check names
 */
export function getAvailableChecks(): string[] {
  return [...Object.keys(organizationCheckRegistry), ...Object.keys(repositoryCheckRegistry)];
}
