import { ArchivedReposCheck } from '../checks/archived-repos';
import { BranchProtectionCheck } from '../checks/branch-protection';
import { MergeMethodsCheck } from '../checks/merge-methods';
import { SecurityScanningCheck } from '../checks/security-scanning';
import { TeamPermissionsCheck } from '../checks/team-permissions';
import { TeamSyncCheck } from '../checks/team-sync';
import type { CheckRegistry } from './types';

/**
 * Registry of all available compliance checks
 */
const checkRegistry: CheckRegistry = {
  'team-sync': TeamSyncCheck,
  'merge-methods': MergeMethodsCheck,
  'team-permissions': TeamPermissionsCheck,
  'branch-protection': BranchProtectionCheck,
  'security-scanning': SecurityScanningCheck,
  'archived-repos': ArchivedReposCheck,
};

/**
 * Get a check class by name
 */
export function getCheck(name: string): new () => unknown {
  const CheckClass = checkRegistry[name];
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
