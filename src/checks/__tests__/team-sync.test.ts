import type { ComplianceConfig } from '../../config/types';
import type { GitHubClient } from '../../github/types';
import { type Logger, resetLogger, setLogger } from '../../logging';
import { TeamManager } from '../../teams';
import type { OrganizationCheckContext } from '../base';
import { TeamSyncCheck } from '../team-sync';

const mockLogger: jest.Mocked<Logger> = {
  info: jest.fn(),
  success: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  startGroup: jest.fn(),
  endGroup: jest.fn(),
};

describe('TeamSyncCheck', () => {
  const client = {} as GitHubClient;
  let check: TeamSyncCheck;

  beforeEach(() => {
    check = new TeamSyncCheck();
    jest.clearAllMocks();
    setLogger(mockLogger);
  });

  afterEach(() => {
    resetLogger();
  });

  function createContext(config: ComplianceConfig, dryRun = false): OrganizationCheckContext {
    return {
      client,
      config,
      dryRun,
      organization: 'test-org',
    };
  }

  it('should not run when no team configuration is defined', () => {
    const config: ComplianceConfig = {
      version: 1,
      defaults: {},
    };

    expect(check.shouldRun(createContext(config))).toBe(false);
  });

  it('should run when team configuration is provided', () => {
    const config: ComplianceConfig = {
      version: 1,
      defaults: {},
      teams: {
        definitions: [{ name: 'platform' }],
      },
    };

    expect(check.shouldRun(createContext(config))).toBe(true);
  });

  it('should return a compliant result using preview summary', async () => {
    const syncSpy = jest.spyOn(TeamManager.prototype, 'sync').mockResolvedValue({
      hasChanges: true,
      hasErrors: false,
      findings: [],
      summary: 'Preview: processed 1 team(s) (created 1, updated 0, skipped 0).',
      stats: {
        processed: 1,
        created: 1,
        updated: 0,
        removed: 0,
        skipped: 0,
      },
      actions: [{ operation: 'create_team', team: 'platform' }],
    });

    const config: ComplianceConfig = {
      version: 1,
      defaults: {},
      organization: 'test-org',
      teams: {
        definitions: [{ name: 'platform', members: [{ username: 'octocat' }] }],
      },
    };

    const result = await check.execute(createContext(config, true));

    expect(result.compliant).toBe(false);
    expect(result.message).toContain('Preview: processed 1 team(s)');
    expect(syncSpy).toHaveBeenCalledTimes(1);
    syncSpy.mockRestore();
  });

  it('should call team manager sync during fix', async () => {
    const syncSpy = jest.spyOn(TeamManager.prototype, 'sync').mockResolvedValue({
      hasChanges: true,
      hasErrors: false,
      findings: [],
      summary: 'Processed 1 team(s) (created 1, updated 0, skipped 0).',
      stats: {
        processed: 1,
        created: 1,
        updated: 0,
        removed: 0,
        skipped: 0,
      },
      actions: [{ operation: 'create_team', team: 'platform' }],
    });

    const config: ComplianceConfig = {
      version: 1,
      defaults: {},
      organization: 'test-org',
      teams: {
        definitions: [{ name: 'platform' }],
      },
    };

    const result = await check.execute(createContext(config, false));

    expect(syncSpy).toHaveBeenCalledTimes(1);
    expect(result.message).toContain('Processed 1 team(s)');
    expect(result.fixed).toBe(true);
    syncSpy.mockRestore();
  });
});
