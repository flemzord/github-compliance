import type { CheckResult } from '../checks/base';
import type { Repository } from '../github/types';

export interface RunnerOptions {
  /** Run in dry-run mode (no fixes applied) */
  dryRun: boolean;
  /** Specific checks to run (undefined = all) */
  checks?: string[];
  /** Include archived repositories */
  includeArchived: boolean;
  /** Specific repositories to check (undefined = all) */
  repos?: string[];
  /** Maximum concurrent operations */
  concurrency?: number;
}

export interface CheckExecution {
  checkName: string;
  repository: Repository;
  result: CheckResult;
  duration: number;
  error?: string;
}

export interface RunnerReport {
  /** Total repositories processed */
  totalRepositories: number;
  /** Repositories that are compliant */
  compliantRepositories: number;
  /** Repositories that are non-compliant */
  nonCompliantRepositories: number;
  /** Repositories where fixes were applied */
  fixedRepositories: number;
  /** Repositories that had errors */
  errorRepositories: number;
  /** Detailed results per repository */
  repositories: RepositoryReport[];
  /** Overall compliance percentage */
  compliancePercentage: number;
  /** Execution time in milliseconds */
  executionTime: number;
  /** Timestamp of the run */
  timestamp: string;
}

export interface RepositoryReport {
  repository: {
    name: string;
    full_name: string;
    private: boolean;
    archived: boolean;
  };
  compliant: boolean;
  checksRun: number;
  checksPassed: number;
  checksFailed: number;
  checksFixed: number;
  checksErrored: number;
  checks: CheckExecution[];
}

export interface CheckRegistry {
  [key: string]: new () => unknown;
}
