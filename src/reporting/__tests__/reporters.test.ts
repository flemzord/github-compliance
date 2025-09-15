import type { Repository } from '../../github/types';
import type { RunnerReport } from '../../runner/types';
import { JsonReporter } from '../json-reporter';
import { MarkdownReporter } from '../markdown-reporter';

const createMockRepository = (
  name: string,
  fullName: string,
  isPrivate = false,
  isArchived = false
): Repository => ({
  id: Math.floor(Math.random() * 1000000),
  name,
  full_name: fullName,
  private: isPrivate,
  archived: isArchived,
  disabled: false,
  fork: false,
  default_branch: 'main',
  updated_at: '2024-01-01T00:00:00Z',
  pushed_at: '2024-01-01T00:00:00Z',
  stargazers_count: 0,
  forks_count: 0,
  open_issues_count: 0,
  size: 100,
  language: 'TypeScript',
});

const mockReport: RunnerReport = {
  totalRepositories: 10,
  compliantRepositories: 7,
  nonCompliantRepositories: 3,
  fixedRepositories: 2,
  errorRepositories: 1,
  compliancePercentage: 70,
  executionTime: 5000,
  timestamp: '2024-01-01T00:00:00Z',
  repositories: [
    {
      repository: {
        name: 'test-repo',
        full_name: 'org/test-repo',
        private: false,
        archived: false,
      },
      compliant: true,
      checksRun: 5,
      checksPassed: 5,
      checksFailed: 0,
      checksFixed: 0,
      checksErrored: 0,
      checks: [],
    },
    {
      repository: {
        name: 'failing-repo',
        full_name: 'org/failing-repo',
        private: true,
        archived: false,
      },
      compliant: false,
      checksRun: 5,
      checksPassed: 3,
      checksFailed: 2,
      checksFixed: 0,
      checksErrored: 0,
      checks: [],
    },
  ],
};

describe('MarkdownReporter', () => {
  it('should generate markdown report', () => {
    const reporter = new MarkdownReporter();
    const report = reporter.generateReport(mockReport);

    expect(report).toContain('# GitHub Compliance Report');
    expect(report).toContain('## Summary');
    expect(report).toContain('70%');
    expect(report).toContain('org/test-repo');
    expect(report).toContain('org/failing-repo');
  });

  it('should generate summary', () => {
    const reporter = new MarkdownReporter();
    const summary = reporter.generateSummary(mockReport);

    expect(summary).toContain('70% Compliant');
    expect(summary).toContain('7** compliant repositories');
    expect(summary).toContain('3** non-compliant repositories');
  });

  it('should handle empty report', () => {
    const emptyReport: RunnerReport = {
      ...mockReport,
      totalRepositories: 0,
      compliantRepositories: 0,
      nonCompliantRepositories: 0,
      repositories: [],
    };

    const reporter = new MarkdownReporter();
    const report = reporter.generateReport(emptyReport);

    expect(report).toContain('# GitHub Compliance Report');
    expect(report).toContain('100%'); // Should show 100% when no repos
  });

  it('should generate markdown report with detailed checks', () => {
    const reportWithChecks: RunnerReport = {
      ...mockReport,
      repositories: [
        {
          repository: {
            name: 'test-repo',
            full_name: 'org/test-repo',
            private: false,
            archived: false,
          },
          compliant: true,
          checksRun: 2,
          checksPassed: 2,
          checksFailed: 0,
          checksFixed: 0,
          checksErrored: 0,
          checks: [
            {
              checkName: 'passing-check',
              repository: createMockRepository('test-repo', 'org/test-repo'),
              result: {
                compliant: true,
                message:
                  'This is a very long message that should be truncated because it exceeds the maximum length allowed',
              },
              duration: 150,
            },
            {
              checkName: 'fixed-check',
              repository: createMockRepository('test-repo', 'org/test-repo'),
              result: {
                compliant: true,
                message: 'Fixed issue',
                fixed: true,
              },
              duration: 250,
            },
          ],
        },
        {
          repository: {
            name: 'failing-repo',
            full_name: 'org/failing-repo',
            private: true,
            archived: false,
          },
          compliant: false,
          checksRun: 3,
          checksPassed: 1,
          checksFailed: 1,
          checksFixed: 1,
          checksErrored: 1,
          checks: [
            {
              checkName: 'failing-check',
              repository: createMockRepository('failing-repo', 'org/failing-repo', true),
              result: {
                compliant: false,
                message: 'Check failed',
              },
              duration: 100,
            },
            {
              checkName: 'error-check',
              repository: createMockRepository('failing-repo', 'org/failing-repo', true),
              result: {
                compliant: false,
                message: 'Check errored',
                error: 'Network timeout',
              },
              duration: 300,
            },
          ],
        },
      ],
    };

    const reporter = new MarkdownReporter();
    const report = reporter.generateReport(reportWithChecks);

    // Should contain check results table (lines 79-91)
    expect(report).toContain('#### Check Results');
    expect(report).toContain('| Check | Status | Message | Duration |');
    expect(report).toContain('passing-check');
    expect(report).toContain('🔧 Fixed');
    expect(report).toContain('❌ Fail');
    expect(report).toContain('⚠️ Error');
    expect(report).toContain('150ms');
    expect(report).toContain('This is a very long message that should be trun...');
  });

  it('should generate summary with more than 10 non-compliant repos', () => {
    const manyNonCompliantRepos: RunnerReport = {
      ...mockReport,
      nonCompliantRepositories: 15,
      repositories: Array.from({ length: 15 }, (_, i) => ({
        repository: {
          name: `failing-repo-${i}`,
          full_name: `org/failing-repo-${i}`,
          private: false,
          archived: false,
        },
        compliant: false,
        checksRun: 2,
        checksPassed: 0,
        checksFailed: 2,
        checksFixed: 0,
        checksErrored: 0,
        checks: [
          {
            checkName: 'check-1',
            repository: createMockRepository(`failing-repo-${i}`, `org/failing-repo-${i}`),
            result: {
              compliant: false,
              message: 'Failed',
            },
            duration: 100,
          },
          {
            checkName: 'check-2',
            repository: createMockRepository(`failing-repo-${i}`, `org/failing-repo-${i}`),
            result: {
              compliant: false,
              message: 'Also failed',
              fixed: false,
            },
            duration: 200,
          },
        ],
      })),
    };

    const reporter = new MarkdownReporter();
    const summary = reporter.generateSummary(manyNonCompliantRepos);

    // Should show "and X more" message (lines 156-159)
    expect(summary).toContain('... and 5 more');
    // Should contain failed checks (lines 148-149)
    expect(summary).toContain('check-1, check-2');
  });

  it('should handle all check statuses', () => {
    const reportWithAllStatuses: RunnerReport = {
      ...mockReport,
      repositories: [
        {
          repository: {
            name: 'status-test-repo',
            full_name: 'org/status-test-repo',
            private: false,
            archived: false,
          },
          compliant: false,
          checksRun: 4,
          checksPassed: 1,
          checksFailed: 1,
          checksFixed: 1,
          checksErrored: 1,
          checks: [
            {
              checkName: 'passing-check',
              repository: createMockRepository('status-test-repo', 'org/status-test-repo'),
              result: {
                compliant: true,
                message: 'Pass',
              },
              duration: 100,
            },
            {
              checkName: 'failing-check',
              repository: createMockRepository('status-test-repo', 'org/status-test-repo'),
              result: {
                compliant: false,
                message: 'Fail',
              },
              duration: 200,
            },
            {
              checkName: 'fixed-check',
              repository: createMockRepository('status-test-repo', 'org/status-test-repo'),
              result: {
                compliant: true,
                message: 'Fixed',
                fixed: true,
              },
              duration: 300,
            },
            {
              checkName: 'error-check',
              repository: createMockRepository('status-test-repo', 'org/status-test-repo'),
              result: {
                compliant: false,
                message: 'Error',
                error: 'Something went wrong',
              },
              duration: 400,
            },
          ],
        },
      ],
    };

    const reporter = new MarkdownReporter();
    const report = reporter.generateReport(reportWithAllStatuses);

    // Should contain all status types (lines 166-175)
    expect(report).toContain('✅ Pass');
    expect(report).toContain('❌ Fail');
    expect(report).toContain('🔧 Fixed');
    expect(report).toContain('⚠️ Error');
  });

  it('should handle repos with different stat combinations', () => {
    const reportWithVariedStats: RunnerReport = {
      ...mockReport,
      repositories: [
        {
          repository: {
            name: 'mixed-stats-repo',
            full_name: 'org/mixed-stats-repo',
            private: false,
            archived: false,
          },
          compliant: false,
          checksRun: 10,
          checksPassed: 3,
          checksFailed: 2,
          checksFixed: 4,
          checksErrored: 1,
          checks: [],
        },
        {
          repository: {
            name: 'only-errors-repo',
            full_name: 'org/only-errors-repo',
            private: false,
            archived: false,
          },
          compliant: false,
          checksRun: 5,
          checksPassed: 0,
          checksFailed: 0,
          checksFixed: 0,
          checksErrored: 5,
          checks: [],
        },
      ],
    };

    const reporter = new MarkdownReporter();
    const report = reporter.generateReport(reportWithVariedStats);

    // Should handle different stat combinations (lines 188, 191)
    expect(report).toContain('3 passed, 2 failed, 4 fixed, 1 errors');
    expect(report).toContain('5 errors');
  });

  it('should show all compliant message in summary', () => {
    const allCompliantReport: RunnerReport = {
      ...mockReport,
      nonCompliantRepositories: 0,
      compliantRepositories: 10,
      compliancePercentage: 100,
      repositories: [
        {
          repository: {
            name: 'compliant-repo',
            full_name: 'org/compliant-repo',
            private: false,
            archived: false,
          },
          compliant: true,
          checksRun: 3,
          checksPassed: 3,
          checksFailed: 0,
          checksFixed: 0,
          checksErrored: 0,
          checks: [],
        },
      ],
    };

    const reporter = new MarkdownReporter();
    const summary = reporter.generateSummary(allCompliantReport);

    // Should show all compliant message (line 159)
    expect(summary).toContain('### ✅ All repositories are compliant!');
  });

  it('should handle archived repositories', () => {
    const reportWithArchived: RunnerReport = {
      ...mockReport,
      repositories: [
        {
          repository: {
            name: 'archived-repo',
            full_name: 'org/archived-repo',
            private: false,
            archived: true,
          },
          compliant: true,
          checksRun: 1,
          checksPassed: 1,
          checksFailed: 0,
          checksFixed: 0,
          checksErrored: 0,
          checks: [],
        },
      ],
    };

    const reporter = new MarkdownReporter();
    const report = reporter.generateReport(reportWithArchived);

    // Should show archived status (line 70 branch)
    expect(report).toContain('Public (Archived)');
  });

  it('should handle reports with no fixes or errors in summary', () => {
    const reportNoFixesOrErrors: RunnerReport = {
      ...mockReport,
      fixedRepositories: 0,
      errorRepositories: 0,
      nonCompliantRepositories: 1,
      repositories: [
        {
          repository: {
            name: 'failing-repo',
            full_name: 'org/failing-repo',
            private: false,
            archived: false,
          },
          compliant: false,
          checksRun: 1,
          checksPassed: 0,
          checksFailed: 1,
          checksFixed: 0,
          checksErrored: 0,
          checks: [],
        },
      ],
    };

    const reporter = new MarkdownReporter();
    const summary = reporter.generateSummary(reportNoFixesOrErrors);

    // Should not show fixed/error lines when counts are 0 (lines 130-134 branches)
    expect(summary).not.toContain('repositories fixed');
    expect(summary).not.toContain('repositories with errors');
    expect(summary).toContain('1** non-compliant repositories');
  });
});

describe('JsonReporter', () => {
  it('should generate JSON report', () => {
    const reporter = new JsonReporter();
    const report = reporter.generateReport(mockReport);
    const parsed = JSON.parse(report);

    expect(parsed.totalRepositories).toBe(10);
    expect(parsed.compliancePercentage).toBe(70);
    expect(parsed.repositories).toHaveLength(2);
  });

  it('should generate JSON summary', () => {
    const reporter = new JsonReporter();
    const summary = reporter.generateSummary(mockReport);
    const parsed = JSON.parse(summary);

    expect(parsed.compliancePercentage).toBe(70);
    expect(parsed.nonCompliantRepos).toHaveLength(1);
    expect(parsed.nonCompliantRepos[0].name).toBe('org/failing-repo');
  });

  it('should handle failed checks in JSON summary', () => {
    const reportWithFailedChecks: RunnerReport = {
      ...mockReport,
      repositories: [
        {
          repository: {
            name: 'compliant-repo',
            full_name: 'org/compliant-repo',
            private: false,
            archived: false,
          },
          compliant: true,
          checksRun: 2,
          checksPassed: 2,
          checksFailed: 0,
          checksFixed: 0,
          checksErrored: 0,
          checks: [],
        },
        {
          repository: {
            name: 'failing-repo',
            full_name: 'org/failing-repo',
            private: true,
            archived: false,
          },
          compliant: false,
          checksRun: 4,
          checksPassed: 1,
          checksFailed: 2,
          checksFixed: 1,
          checksErrored: 0,
          checks: [
            {
              checkName: 'passing-check',
              repository: createMockRepository('failing-repo', 'org/failing-repo', true),
              result: {
                compliant: true,
                message: 'Pass',
              },
              duration: 100,
            },
            {
              checkName: 'failing-check-1',
              repository: createMockRepository('failing-repo', 'org/failing-repo', true),
              result: {
                compliant: false,
                message: 'Failed check 1',
              },
              duration: 200,
            },
            {
              checkName: 'failing-check-2',
              repository: createMockRepository('failing-repo', 'org/failing-repo', true),
              result: {
                compliant: false,
                message: 'Failed check 2',
              },
              duration: 300,
            },
            {
              checkName: 'fixed-check',
              repository: createMockRepository('failing-repo', 'org/failing-repo', true),
              result: {
                compliant: true,
                message: 'Fixed',
                fixed: true,
              },
              duration: 400,
            },
          ],
        },
      ],
    };

    const reporter = new JsonReporter();
    const summary = reporter.generateSummary(reportWithFailedChecks);
    const parsed = JSON.parse(summary);

    // This should test lines 29-30 in json-reporter.ts
    expect(parsed.nonCompliantRepos).toHaveLength(1);
    expect(parsed.nonCompliantRepos[0].name).toBe('org/failing-repo');
    expect(parsed.nonCompliantRepos[0].failedChecks).toEqual([
      'failing-check-1',
      'failing-check-2',
    ]);
  });
});
