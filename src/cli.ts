#!/usr/bin/env node

import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { ComplianceConfig } from './config/types';
import { validateFromString } from './config/validator';
import { GitHubClient } from './github/client';
import { ConsoleLogger, ProgressLogger, setLogger } from './logging';
import { JsonReporter, MarkdownReporter } from './reporting';
import { ComplianceRunner } from './runner';
import type { RunnerOptions } from './runner/types';

const HELP_TEXT = `
GitHub Compliance CLI

Usage:
  github-compliance-cli --config <path> --token <token> [options]

Options:
  --config, -c <path>      Path to compliance configuration YAML file (required)
  --token, -t <token>      GitHub personal access token (required, or use GITHUB_TOKEN env)
  --org, -o <name>         GitHub organization name (optional, will be read from config)
  --dry-run, -d            Run in dry-run mode (no changes will be made)
  --repos <list>           Comma-separated list of repository names to check
  --checks <list>          Comma-separated list of checks to run
  --include-archived       Include archived repositories
  --format <type>          Report format: json or markdown (default: markdown)
  --output, -o <path>      Output file path (default: compliance-report.[md|json])
  --mode <type>            Output mode: compact, detailed, or json (default: compact)
  --verbose, -v            Enable verbose logging
  --quiet, -q              Minimal output (only errors and summary)
  --help, -h               Show this help message

Examples:
  # Run all checks in dry-run mode
  github-compliance-cli --config compliance.yml --token ghp_xxx --dry-run

  # Check specific repositories
  github-compliance-cli -c config.yml -t ghp_xxx --repos "repo1,repo2"

  # Run specific checks only
  github-compliance-cli -c config.yml -t ghp_xxx --checks "merge-methods,security-scanning"

  # Generate JSON report
  github-compliance-cli -c config.yml -t ghp_xxx --format json --output report.json

Environment Variables:
  GITHUB_TOKEN    GitHub token (alternative to --token flag)
`;

interface CLIOptions {
  config: string;
  token?: string | undefined;
  org?: string | undefined;
  dryRun: boolean;
  repos?: string[] | undefined;
  checks?: string[] | undefined;
  includeArchived: boolean;
  format: 'json' | 'markdown';
  output?: string | undefined;
  verbose: boolean;
  quiet: boolean;
  mode?: 'compact' | 'detailed' | 'json';
}

function parseCliArgs(): CLIOptions {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      config: { type: 'string', short: 'c' },
      token: { type: 'string', short: 't' },
      org: { type: 'string', short: 'o' },
      'dry-run': { type: 'boolean', short: 'd', default: false },
      repos: { type: 'string' },
      checks: { type: 'string' },
      'include-archived': { type: 'boolean', default: false },
      format: { type: 'string', default: 'markdown' },
      output: { type: 'string' },
      mode: { type: 'string', default: 'compact' },
      verbose: { type: 'boolean', short: 'v', default: false },
      quiet: { type: 'boolean', short: 'q', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: true,
  });

  if (values.help) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  if (!values.config) {
    console.error('Error: --config flag is required');
    console.log(HELP_TEXT);
    process.exit(1);
  }

  // Get token from flag or environment
  const token = values.token || process.env.GITHUB_TOKEN;
  if (!token) {
    console.error('Error: --token flag or GITHUB_TOKEN environment variable is required');
    process.exit(1);
  }

  // Validate format
  const format = values.format as string;
  if (format !== 'json' && format !== 'markdown') {
    console.error('Error: --format must be either "json" or "markdown"');
    process.exit(1);
  }

  // Check for conflicting verbose and quiet flags
  if (values.verbose && values.quiet) {
    console.error('Error: --verbose and --quiet cannot be used together');
    process.exit(1);
  }

  // Validate mode
  const mode = values.mode as string;
  if (mode && !['compact', 'detailed', 'json'].includes(mode)) {
    console.error(`Error: Invalid mode '${mode}'. Must be one of: compact, detailed, json`);
    process.exit(1);
  }

  return {
    config: values.config,
    token,
    org: values.org as string | undefined,
    dryRun: values['dry-run'] as boolean,
    repos: values.repos ? (values.repos as string).split(',').map((r) => r.trim()) : undefined,
    checks: values.checks ? (values.checks as string).split(',').map((c) => c.trim()) : undefined,
    includeArchived: values['include-archived'] as boolean,
    format: format as 'json' | 'markdown',
    output: values.output as string | undefined,
    mode: (mode as 'compact' | 'detailed' | 'json') || 'compact',
    verbose: values.verbose as boolean,
    quiet: values.quiet as boolean,
  };
}

async function main(): Promise<void> {
  const options = parseCliArgs();

  // Use ProgressLogger for compact and detailed modes, ConsoleLogger for backward compatibility
  const logger =
    options.mode === 'compact' || options.mode === 'detailed'
      ? new ProgressLogger({
          verbose: options.verbose,
          quiet: options.quiet,
          mode: options.mode,
        })
      : new ConsoleLogger({ verbose: options.verbose, quiet: options.quiet });

  setLogger(logger);

  try {
    // Validate configuration file exists
    const configPath = resolve(process.cwd(), options.config);
    if (!existsSync(configPath)) {
      throw new Error(`Configuration file not found: ${configPath}`);
    }

    // Load and validate configuration first (needed for header)
    const result = await validateFromString(configPath);
    const config = typeof result === 'object' && 'config' in result ? result.config : result;
    const warnings = (
      typeof result === 'object' && 'warnings' in result ? result.warnings : []
    ) as string[];

    // Show header for ProgressLogger with correct organization
    if (logger instanceof ProgressLogger) {
      const organization = options.org || (config as ComplianceConfig).organization;
      if (organization) {
        logger.showHeader({
          organization,
          mode: options.dryRun ? 'dry-run' : 'live',
          configFile: options.config,
        });
      } else {
        logger.showHeader({
          mode: options.dryRun ? 'dry-run' : 'live',
          configFile: options.config,
        });
      }
    } else {
      logger.info('🚀 GitHub Compliance CLI starting...');
      logger.info('📋 Loading and validating configuration...');
    }

    // Log warnings
    if (Array.isArray(warnings) && warnings.length > 0) {
      for (const warning of warnings) {
        logger.warning(warning);
      }
    }

    // Get organization from config or CLI
    const organization = options.org || (config as ComplianceConfig).organization;
    if (!organization) {
      throw new Error('Organization name must be provided via --org flag or in configuration file');
    }

    // Create GitHub client
    if (!(logger instanceof ProgressLogger)) {
      logger.info('🔗 Connecting to GitHub...');
    }
    const client = new GitHubClient({
      token: options.token || '',
      throttle: {
        enabled: true,
        retries: 3,
        retryDelay: 1000,
      },
    });
    client.setOwner(organization);

    // Create runner options
    const runnerOptions: RunnerOptions = {
      dryRun: options.dryRun,
      ...(options.checks && { checks: options.checks }),
      includeArchived: options.includeArchived,
      ...(options.repos && { repos: options.repos }),
      concurrency: 5,
    };

    // Run compliance checks
    if (!(logger instanceof ProgressLogger)) {
      logger.info('🏃 Running compliance checks...');
      if (options.dryRun) {
        logger.info('🔍 Running in DRY-RUN mode - no changes will be made');
      }
    }

    const runner = new ComplianceRunner(
      client,
      config as unknown as ComplianceConfig,
      runnerOptions,
      logger instanceof ProgressLogger ? logger : undefined
    );
    const report = await runner.run();

    // Display summary for ProgressLogger
    if (logger instanceof ProgressLogger) {
      logger.displaySummary();
    }

    // Generate report
    if (!(logger instanceof ProgressLogger)) {
      logger.info('📝 Generating report...');
    }
    let reportContent: string;
    let reportPath: string;

    if (options.format === 'json') {
      const jsonReporter = new JsonReporter();
      reportContent = jsonReporter.generateReport(report);
      reportPath = options.output || 'compliance-report.json';
    } else {
      const markdownReporter = new MarkdownReporter();
      reportContent = markdownReporter.generateReport(report);
      reportPath = options.output || 'compliance-report.md';
    }

    // Write report to file
    writeFileSync(reportPath, reportContent);
    if (logger instanceof ProgressLogger && logger.success) {
      logger.success(`Report written to ${reportPath}`);
    } else {
      logger.info(`✅ Report written to ${reportPath}`);
    }

    // Print summary only for non-ProgressLogger
    if (!(logger instanceof ProgressLogger)) {
      console.log(`\n${'='.repeat(60)}`);
      console.log('📊 COMPLIANCE CHECK SUMMARY');
      console.log('='.repeat(60));
      console.log(`Total Repositories: ${report.totalRepositories}`);
      console.log(`✅ Compliant: ${report.compliantRepositories}`);
      console.log(`❌ Non-Compliant: ${report.nonCompliantRepositories}`);
      console.log(`🔧 Fixed: ${report.fixedRepositories}`);
      console.log(`⚠️  Errors: ${report.errorRepositories}`);
      console.log(`📈 Compliance Rate: ${report.compliancePercentage}%`);
      console.log(`⏱️  Execution Time: ${(report.executionTime / 1000).toFixed(2)}s`);
      console.log('='.repeat(60));
    }

    // Exit with appropriate code
    if (report.nonCompliantRepositories > 0 && !options.dryRun) {
      logger.error(`${report.nonCompliantRepositories} repositories are non-compliant`);
      process.exit(1);
    } else if (report.errorRepositories > 0) {
      logger.error(`${report.errorRepositories} repositories had errors during checking`);
      process.exit(1);
    } else {
      logger.success('All repositories are compliant!');
      process.exit(0);
    }
  } catch (error) {
    if (error instanceof Error) {
      logger.error(`Error: ${error.message}`);
      if (options.verbose && error.stack) {
        console.error(error.stack);
      }
    } else {
      logger.error('An unknown error occurred');
    }
    process.exit(1);
  }
}

// Run the CLI
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { main };
