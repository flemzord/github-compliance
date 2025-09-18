import { ArchivedReposCheck } from '../../checks/archived-repos';
import { BranchProtectionCheck } from '../../checks/branch-protection';
import { MergeMethodsCheck } from '../../checks/merge-methods';
import { SecurityScanningCheck } from '../../checks/security-scanning';
import { TeamPermissionsCheck } from '../../checks/team-permissions';
import { TeamSyncCheck } from '../../checks/team-sync';
import { getAvailableChecks, getCheck } from '../check-registry';

describe('check-registry', () => {
  describe('getCheck', () => {
    it('should return the correct check class for valid check names', () => {
      expect(getCheck('team-sync')).toBe(TeamSyncCheck);
      expect(getCheck('merge-methods')).toBe(MergeMethodsCheck);
      expect(getCheck('team-permissions')).toBe(TeamPermissionsCheck);
      expect(getCheck('branch-protection')).toBe(BranchProtectionCheck);
      expect(getCheck('security-scanning')).toBe(SecurityScanningCheck);
      expect(getCheck('archived-repos')).toBe(ArchivedReposCheck);
    });

    it('should throw an error for unknown check names', () => {
      // This test covers line 25 and improves branch coverage
      expect(() => getCheck('unknown-check')).toThrow('Unknown check: unknown-check');
      expect(() => getCheck('invalid-check')).toThrow('Unknown check: invalid-check');
      expect(() => getCheck('')).toThrow('Unknown check: ');
    });

    it('should throw an error for null/undefined check names', () => {
      // Additional edge cases to ensure robust coverage
      expect(() => getCheck(null as unknown as string)).toThrow('Unknown check: null');
      expect(() => getCheck(undefined as unknown as string)).toThrow('Unknown check: undefined');
    });
  });

  describe('getAvailableChecks', () => {
    it('should return all available check names', () => {
      const availableChecks = getAvailableChecks();

      expect(availableChecks).toEqual([
        'team-sync',
        'merge-methods',
        'team-permissions',
        'branch-protection',
        'security-scanning',
        'archived-repos',
      ]);
    });

    it('should return an array', () => {
      const availableChecks = getAvailableChecks();
      expect(Array.isArray(availableChecks)).toBe(true);
    });

    it('should return consistent results on multiple calls', () => {
      const first = getAvailableChecks();
      const second = getAvailableChecks();

      expect(first).toEqual(second);
    });
  });

  describe('integration tests', () => {
    it('should be able to instantiate all registered checks', () => {
      const availableChecks = getAvailableChecks();

      availableChecks.forEach((checkName) => {
        const CheckClass = getCheck(checkName);
        expect(() => new CheckClass()).not.toThrow();
      });
    });
  });
});
