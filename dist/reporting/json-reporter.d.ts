import type { RunnerReport } from '../runner/types';
export declare class JsonReporter {
    /**
     * Generate a JSON report from runner results
     */
    generateReport(report: RunnerReport): string;
    /**
     * Generate a compact JSON summary
     */
    generateSummary(report: RunnerReport): string;
}
//# sourceMappingURL=json-reporter.d.ts.map