import type { ComplianceConfig } from '../../config/types';
import type { GitHubClient, Repository } from '../../github/types';
import { type Logger, resetLogger, setLogger } from '../../logging';
import { TeamManager } from '../../teams';
import type { CheckContext } from '../base';
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

const mockRepository: Repository = {
  id: 1,
  name: 'demo',
  full_name: 'octo/demo',
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
  size: 1,
  language: 'TypeScript',
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

  function createContext(config: ComplianceConfig, dryRun = false): CheckContext {
    return {
      client,
      config,
      dryRun,
      repository: mockRepository,
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

  it('should return a compliant result summarizing preview mode', async () => {
    const config: ComplianceConfig = {
      version: 1,
      defaults: {},
      teams: {
        definitions: [{ name: 'platform', members: [{ username: 'octocat' }] }],
      },
    };

    const result = await check.check(createContext(config));

    expect(result.compliant).toBe(true);
    expect(result.message).toContain('not yet implemented');
    expect(result.details?.stats).toEqual({
      processed: 1,
      created: 0,
      updated: 0,
      removed: 0,
      skipped: 1,
    });
  });

  it('should call team manager sync during fix', async () => {
    const config: ComplianceConfig = {
      version: 1,
      defaults: {},
      teams: {
        definitions: [{ name: 'platform' }],
      },
    };

    const syncSpy = jest.spyOn(TeamManager.prototype, 'sync').mockResolvedValue({
      hasChanges: false,
      hasErrors: false,
      findings: [],
      summary: 'noop',
      stats: {
        processed: 0,
        created: 0,
        updated: 0,
        removed: 0,
        skipped: 0,
      },
    });

    await check.fix(createContext(config, false));

    expect(syncSpy).toHaveBeenCalledTimes(1);

    syncSpy.mockRestore();
  });
});
