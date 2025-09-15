/**
 * Test utility types to avoid using 'any' in tests
 */

import type { CheckResult } from '../checks/base';
import type { ComplianceConfig } from '../config/types';
import type { GitHubClient, Repository } from '../github';

// Type for accessing protected/private methods in tests
export interface TestableBaseCheck {
  createCompliantResult(message: string, details?: Record<string, unknown>): CheckResult;
  createNonCompliantResult(message: string, details?: Record<string, unknown>): CheckResult;
  createFixedResult(message: string, details?: Record<string, unknown>): CheckResult;
  createErrorResult(message: string, error?: string): CheckResult;
  getRepoConfig(context: TestContext, key: string): unknown;
  getRepoInfo(repository: Repository): { owner: string; repo: string };
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

// Mock Octokit interface
export interface TestOctokit {
  constructor: {
    name: string;
  };
  rest: Record<string, unknown>;
  paginate: {
    iterator: jest.MockedFunction<(method: unknown, options?: unknown) => unknown[]>;
  };
}

// For testing error objects with status codes
export interface TestErrorWithStatus extends Error {
  status: number;
}
