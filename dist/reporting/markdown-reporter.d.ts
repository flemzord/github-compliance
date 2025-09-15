import type { RunnerReport } from '../runner/types';
export declare class MarkdownReporter {
    /**
     * Generate a markdown report from runner results
     */
    generateReport(report: RunnerReport): string;
    /**
     * Generate a summary for GitHub Actions
     */
    generateSummary(report: RunnerReport): string;
    private getCheckStatus;
    private getRepoStatusDetails;
    private percentage;
    private truncate;
}
//# sourceMappingURL=markdown-reporter.d.ts.map