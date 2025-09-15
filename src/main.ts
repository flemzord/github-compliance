import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as core from '@actions/core';
import * as github from '@actions/github';
import type { ComplianceConfig } from './config/types';
import { validateFromString } from './config/validator';
import { GitHubClient } from './github/client';
import { JsonReporter, MarkdownReporter } from './reporting';
import { ComplianceRunner } from './runner';
import type { RunnerOptions } from './runner/types';

/**
 * Main entry point for the GitHub Action
 */
export async function run(): Promise<void> {
  try {
    core.info('🚀 GitHub Compliance Action starting...');

    // Get inputs
    const token = core.getInput('token', { required: true });
    const configPath = core.getInput('config_path', { required: true });
    const dryRun = core.getBooleanInput('dry_run');
    const checksInput = core.getInput('checks');
    const includeArchived = core.getBooleanInput('include_archived');
    const reposInput = core.getInput('repos');
    const reportFormat = core.getInput('report_format') || 'markdown';

    // Parse optional inputs
    const checks = checksInput ? checksInput.split(',').map((s) => s.trim()) : undefined;
    const repos = reposInput ? reposInput.split(',').map((s) => s.trim()) : undefined;

    // Validate configuration
    core.info('📋 Loading and validating configuration...');
    const configFullPath = resolve(process.cwd(), configPath);

    if (!existsSync(configFullPath)) {
      throw new Error(`Configuration file not found: ${configFullPath}`);
    }

    const result = await validateFromString(configFullPath);
    const config = typeof result === 'object' && 'config' in result ? result.config : result;
    const warnings = (
      typeof result === 'object' && 'warnings' in result ? result.warnings : []
    ) as string[];

    // Log warnings
    if (Array.isArray(warnings) && warnings.length > 0) {
      core.warning('Configuration warnings:');
      for (const warning of warnings) {
        core.warning(`  - ${warning}`);
      }
    }

    // Create GitHub client
    core.info('🔗 Connecting to GitHub...');
    const client = new GitHubClient({
      token,
      throttle: {
        enabled: true,
        retries: 3,
        retryDelay: 1000,
      },
    });

    // Set organization context if running in GitHub Actions
    const context = github.context;
    if (context.payload.organization) {
      client.setOwner(context.payload.organization.login);
    } else if (context.payload.repository?.full_name) {
      const [owner] = context.payload.repository.full_name.split('/');
      client.setOwner(owner);
    }

    // Create runner options
    const runnerOptions: RunnerOptions = {
      dryRun,
      ...(checks && { checks }),
      includeArchived,
      ...(repos && { repos }),
      concurrency: 5,
    };

    // Create and run compliance checks
    core.info('🏃 Running compliance checks...');
    if (dryRun) {
      core.info('🔍 Running in DRY-RUN mode - no changes will be made');
    }

    const runner = new ComplianceRunner(
      client,
      config as unknown as ComplianceConfig,
      runnerOptions
    );
    const report = await runner.run();

    // Generate reports
    core.info('📝 Generating reports...');

    let reportContent: string;
    let reportPath: string;

    if (reportFormat === 'json') {
      const jsonReporter = new JsonReporter();
      reportContent = jsonReporter.generateReport(report);
      reportPath = 'compliance-report.json';
    } else {
      const markdownReporter = new MarkdownReporter();
      reportContent = markdownReporter.generateReport(report);
      reportPath = 'compliance-report.md';
    }

    // Write report to file
    writeFileSync(reportPath, reportContent);
    core.info(`Report written to ${reportPath}`);

    // Set outputs
    core.setOutput('report_path', reportPath);
    core.setOutput('compliance_percentage', report.compliancePercentage.toString());
    core.setOutput('non_compliant_count', report.nonCompliantRepositories.toString());
    core.setOutput('total_repositories', report.totalRepositories.toString());
    core.setOutput('fixed_repositories', report.fixedRepositories.toString());

    // Generate GitHub Actions summary
    if (process.env.GITHUB_STEP_SUMMARY) {
      const markdownReporter = new MarkdownReporter();
      const summary = markdownReporter.generateSummary(report);
      await core.summary.addRaw(summary).write();
    }

    // Set action status based on compliance
    if (report.nonCompliantRepositories > 0 && !dryRun) {
      core.setFailed(`${report.nonCompliantRepositories} repositories are non-compliant`);
    } else if (report.errorRepositories > 0) {
      core.setFailed(`${report.errorRepositories} repositories had errors during checking`);
    } else {
      core.info('✅ All repositories are compliant!');
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
      if (error.stack) {
        core.debug(error.stack);
      }
    } else {
      core.setFailed('An unknown error occurred');
    }
  }
}

// Run if this is the main module
if (require.main === module) {
  run();
}
