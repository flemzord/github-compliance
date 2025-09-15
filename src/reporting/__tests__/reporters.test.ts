import type { RunnerReport } from '../../runner/types';
import { JsonReporter } from '../json-reporter';
import { MarkdownReporter } from '../markdown-reporter';

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
});
