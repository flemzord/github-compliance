import { ArchivedReposCheck } from '../checks/archived-repos';
import { BranchProtectionCheck } from '../checks/branch-protection';
import { MergeMethodsCheck } from '../checks/merge-methods';
import { RepositorySettingsCheck } from '../checks/repository-settings';
import { SecurityScanningCheck } from '../checks/security-scanning';
import { TeamPermissionsCheck } from '../checks/team-permissions';
import { TeamSyncCheck } from '../checks/team-sync';
import type { CheckRegistry } from './types';

/**
 * Registry of all available compliance checks
 */
const checkRegistry: CheckRegistry = {
  'org-team-sync': TeamSyncCheck,
  'repo-merge-strategy': MergeMethodsCheck,
  'repo-access-teams': TeamPermissionsCheck,
  'repo-branch-protection': BranchProtectionCheck,
  'repo-security-controls': SecurityScanningCheck,
  'repo-archival-policy': ArchivedReposCheck,
  'repository-settings': RepositorySettingsCheck,
};

const legacyCheckAliases: Record<string, keyof typeof checkRegistry> = {
  'team-sync': 'org-team-sync',
  'merge-methods': 'repo-merge-strategy',
  'team-permissions': 'repo-access-teams',
  'branch-protection': 'repo-branch-protection',
  'security-scanning': 'repo-security-controls',
  'archived-repos': 'repo-archival-policy',
};

/**
 * Get a check class by name
 */
export function normalizeCheckName(name: string): string {
  return (legacyCheckAliases[name] ?? name) as string;
}

export function getCheck(name: string): new () => unknown {
  const normalized = normalizeCheckName(name) as keyof typeof checkRegistry;
  const CheckClass = checkRegistry[normalized];
  if (!CheckClass) {
    throw new Error(`Unknown check: ${name}`);
  }
  return CheckClass;
}

/**
 * Get all available check names
 */
export function getAvailableChecks(): string[] {
  return Object.keys(checkRegistry);
}
