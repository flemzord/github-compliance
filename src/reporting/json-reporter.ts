import type { RunnerReport } from '../runner/types';

export class JsonReporter {
  /**
   * Generate a JSON report from runner results
   */
  generateReport(report: RunnerReport): string {
    return JSON.stringify(report, null, 2);
  }

  /**
   * Generate a compact JSON summary
   */
  generateSummary(report: RunnerReport): string {
    const summary = {
      timestamp: report.timestamp,
      compliancePercentage: report.compliancePercentage,
      totalRepositories: report.totalRepositories,
      compliantRepositories: report.compliantRepositories,
      nonCompliantRepositories: report.nonCompliantRepositories,
      fixedRepositories: report.fixedRepositories,
      errorRepositories: report.errorRepositories,
      executionTime: report.executionTime,
      nonCompliantRepos: report.repositories
        .filter((r) => !r.compliant)
        .map((r) => ({
          name: r.repository.full_name,
          failedChecks: r.checks
            .filter((c) => !c.result.compliant && !c.result.fixed)
            .map((c) => c.checkName),
        })),
    };

    return JSON.stringify(summary, null, 2);
  }
}
