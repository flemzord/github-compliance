/**
 * Test utility types to avoid using 'any' in tests
 */
import type { CheckResult } from '../checks/base';
import type { ComplianceConfig } from '../config/types';
import type { GitHubClient, Repository } from '../github';
export interface TestableBaseCheck {
    createCompliantResult(message: string, details?: Record<string, unknown>): CheckResult;
    createNonCompliantResult(message: string, details?: Record<string, unknown>): CheckResult;
    createFixedResult(message: string, details?: Record<string, unknown>): CheckResult;
    createErrorResult(message: string, error?: string): CheckResult;
    getRepoConfig(context: TestContext, key: string): unknown;
    getRepoInfo(repository: Repository): {
        owner: string;
        repo: string;
    };
    matchesPattern(name: string, patterns: string[]): boolean;
    matchesRepositoryRule(repository: Repository, rule: Record<string, unknown>): boolean;
}
export interface TestableBranchProtectionCheck {
    buildProtectionRules(config: Record<string, unknown>): Record<string, unknown>;
}
export interface TestableTeamPermissionsCheck {
    getCollaboratorPermissionLevel(permissions: Record<string, boolean>): string;
    mapPermissionLevel(level: string): string;
}
export interface TestContext {
    client: GitHubClient;
    config: ComplianceConfig;
    dryRun: boolean;
    repository: Repository;
}
export type MockValidationResult = {
    config: {
        version: 1;
        defaults: {
            merge_methods?: {
                allow_merge_commit: boolean;
                allow_squash_merge: boolean;
                allow_rebase_merge: boolean;
            };
        };
    };
    warnings: string[];
};
export interface TestOctokit {
    constructor: {
        name: string;
    };
    rest: Record<string, unknown>;
    paginate: {
        iterator: jest.MockedFunction<(method: unknown, options?: unknown) => unknown[]>;
    };
}
export interface TestErrorWithStatus extends Error {
    status: number;
}
//# sourceMappingURL=test-types.d.ts.map