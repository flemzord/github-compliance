import type { ComplianceConfig } from '../../config/types';
import type { GitHubClient, Repository } from '../../github/types';
import { type Logger, resetLogger, setLogger } from '../../logging';
import type { CheckContext } from '../base';
import { RepositorySettingsCheck } from '../repository-settings';
import type { CheckAction } from '../types';

const mockLogger: jest.Mocked<Logger> = {
  info: jest.fn(),
  success: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  startGroup: jest.fn(),
  endGroup: jest.fn(),
};

const mockClient: Partial<GitHubClient> = {
  getRepository: jest.fn(),
  updateRepository: jest.fn(),
  pathExists: jest.fn(),
};

const baseRepository: Repository = {
  id: 1,
  name: 'test-repo',
  full_name: 'owner/test-repo',
  private: true,
  archived: false,
  disabled: false,
  fork: false,
  default_branch: 'main',
  updated_at: '2024-01-01T00:00:00Z',
  pushed_at: '2024-01-01T00:00:00Z',
  stargazers_count: 0,
  forks_count: 0,
  open_issues_count: 0,
  size: 42,
  language: 'TypeScript',
  visibility: 'private',
};

const baseConfig: ComplianceConfig = {
  version: 1,
  defaults: {
    repository_settings: {
      features: {
        has_issues: true,
        has_projects: false,
        has_wiki: false,
        has_discussions: false,
        has_pages: false,
      },
      visibility: {
        allow_public: false,
        enforce_private: true,
      },
      general: {
        allow_auto_merge: true,
        delete_branch_on_merge: true,
        allow_update_branch: true,
        use_squash_pr_title_as_default: true,
      },
      templates: {
        require_issue_templates: true,
        require_pr_template: true,
      },
    },
  },
};

describe('RepositorySettingsCheck', () => {
  let check: RepositorySettingsCheck;
  let context: CheckContext;

  beforeEach(() => {
    check = new RepositorySettingsCheck();
    context = {
      client: mockClient as GitHubClient,
      config: baseConfig,
      dryRun: false,
      repository: baseRepository,
    };
    jest.clearAllMocks();
    setLogger(mockLogger);
  });

  afterEach(() => {
    resetLogger();
  });

  it('should not run when repository settings config is missing', () => {
    const localContext: CheckContext = {
      ...context,
      config: {
        version: 1,
        defaults: {},
      },
    };

    expect(check.shouldRun(localContext)).toBe(false);
  });

  it('should return compliant result when repository matches configuration', async () => {
    (mockClient.getRepository as jest.Mock).mockResolvedValue({
      ...baseRepository,
      has_issues: true,
      has_projects: false,
      has_wiki: false,
      has_discussions: false,
      has_pages: false,
      allow_auto_merge: true,
      delete_branch_on_merge: true,
      allow_update_branch: true,
      use_squash_pr_title_as_default: true,
    });
    (mockClient.pathExists as jest.Mock).mockResolvedValue(true);

    const result = await check.check(context);

    expect(result.compliant).toBe(true);
    expect(result.message).toContain('Repository settings comply');
    expect(result.details?.current).toBeDefined();
  });

  it('should flag differences and missing templates', async () => {
    (mockClient.getRepository as jest.Mock).mockResolvedValue({
      ...baseRepository,
      has_issues: false,
      has_projects: true,
      has_wiki: true,
      has_discussions: false,
      has_pages: true,
      allow_auto_merge: false,
      delete_branch_on_merge: false,
      allow_update_branch: false,
      use_squash_pr_title_as_default: false,
      private: false,
      visibility: 'public',
    });
    (mockClient.pathExists as jest.Mock).mockResolvedValue(false);

    const result = await check.check(context);

    expect(result.compliant).toBe(false);
    expect(result.message).toContain('Repository settings configuration issues');
    expect(result.details?.actions_needed).toBeDefined();
    expect(Array.isArray(result.details?.actions_needed)).toBe(true);
    const actions = (result.details?.actions_needed ?? []) as CheckAction[];
    expect(actions.length).toBeGreaterThan(0);
  });

  it('should apply fixes for mismatched settings', async () => {
    const mismatched = {
      ...baseRepository,
      has_issues: false,
      has_projects: true,
      has_wiki: true,
      has_discussions: false,
      has_pages: true,
      allow_auto_merge: false,
      delete_branch_on_merge: false,
      allow_update_branch: false,
      use_squash_pr_title_as_default: false,
      allow_merge_commit: true,
      allow_squash_merge: false,
      allow_rebase_merge: true,
      private: false,
      visibility: 'public',
    };

    const compliant = {
      ...baseRepository,
      has_issues: true,
      has_projects: false,
      has_wiki: false,
      has_discussions: false,
      has_pages: false,
      allow_auto_merge: true,
      delete_branch_on_merge: true,
      allow_update_branch: true,
      use_squash_pr_title_as_default: true,
      private: true,
      visibility: 'private',
    };

    (mockClient.getRepository as jest.Mock)
      .mockResolvedValueOnce(mismatched)
      .mockResolvedValueOnce(mismatched)
      .mockResolvedValueOnce(compliant);
    (mockClient.updateRepository as jest.Mock).mockResolvedValue(compliant);
    (mockClient.pathExists as jest.Mock).mockResolvedValue(true);

    const result = await check.fix(context);

    expect(mockClient.updateRepository).toHaveBeenCalledWith(
      'owner',
      'test-repo',
      expect.objectContaining({
        has_issues: true,
        has_projects: false,
        has_wiki: false,
        has_pages: false,
        allow_auto_merge: true,
        delete_branch_on_merge: true,
        allow_update_branch: true,
        use_squash_pr_title_as_default: true,
        private: true,
      })
    );
    expect(result.compliant).toBe(true);
    expect(result.fixed).toBe(true);
    expect(result.message).toContain('updated');
  });
});
