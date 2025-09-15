#!/usr/bin/env node

import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { ComplianceConfig } from './config/types';
import { validateFromString } from './config/validator';
import { GitHubClient } from './github/client';
import { JsonReporter, MarkdownReporter } from './reporting';
import { ComplianceRunner } from './runner';
import type { RunnerOptions } from './runner/types';

const HELP_TEXT = `
GitHub Compliance CLI

Usage:
  compliance-cli --config <path> --token <token> [options]

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
  --verbose, -v            Enable verbose logging
  --help, -h               Show this help message

Examples:
  # Run all checks in dry-run mode
  compliance-cli --config compliance.yml --token ghp_xxx --dry-run

  # Check specific repositories
  compliance-cli -c config.yml -t ghp_xxx --repos "repo1,repo2"

  # Run specific checks only
  compliance-cli -c config.yml -t ghp_xxx --checks "merge-methods,security-scanning"

  # Generate JSON report
  compliance-cli -c config.yml -t ghp_xxx --format json --output report.json

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
}

class Logger {
  private verbose: boolean;

  constructor(verbose = false) {
    this.verbose = verbose;
  }

  info(message: string): void {
    console.log(`ℹ️  ${message}`);
  }

  success(message: string): void {
    console.log(`✅ ${message}`);
  }

  warning(message: string): void {
    console.warn(`⚠️  ${message}`);
  }

  error(message: string): void {
    console.error(`❌ ${message}`);
  }

  debug(message: string): void {
    if (this.verbose) {
      console.log(`🔍 ${message}`);
    }
  }

  group(title: string): void {
    console.log(`\n📦 ${title}`);
    console.log('─'.repeat(50));
  }

  endGroup(): void {
    console.log('─'.repeat(50));
  }
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
      verbose: { type: 'boolean', short: 'v', default: false },
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
    verbose: values.verbose as boolean,
  };
}

async function main(): Promise<void> {
  const options = parseCliArgs();
  const logger = new Logger(options.verbose);

  try {
    logger.info('🚀 GitHub Compliance CLI starting...');

    // Validate configuration file exists
    const configPath = resolve(process.cwd(), options.config);
    if (!existsSync(configPath)) {
      throw new Error(`Configuration file not found: ${configPath}`);
    }

    // Load and validate configuration
    logger.info('📋 Loading and validating configuration...');
    const result = await validateFromString(configPath);
    const config = typeof result === 'object' && 'config' in result ? result.config : result;
    const warnings = (
      typeof result === 'object' && 'warnings' in result ? result.warnings : []
    ) as string[];

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
    logger.info('🔗 Connecting to GitHub...');
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
    logger.info('🏃 Running compliance checks...');
    if (options.dryRun) {
      logger.info('🔍 Running in DRY-RUN mode - no changes will be made');
    }

    // Mock core functions for CLI usage
    const mockCore = {
      info: (msg: string) => logger.info(msg),
      warning: (msg: string) => logger.warning(msg),
      error: (msg: string) => logger.error(msg),
      debug: (msg: string) => logger.debug(msg),
      group: async (title: string, fn: () => Promise<void>) => {
        logger.group(title);
        await fn();
        logger.endGroup();
      },
      endGroup: () => logger.endGroup(),
      setOutput: () => {
        // No-op for CLI
      },
      setFailed: (msg: string) => {
        logger.error(msg);
        process.exit(1);
      },
      summary: {
        addRaw: () => ({
          write: async () => {
            // No-op for CLI
          },
        }),
      },
    };

    // Replace @actions/core with mock
    const coreModule = require.cache[require.resolve('@actions/core')];
    if (coreModule) {
      coreModule.exports = mockCore;
    }

    const runner = new ComplianceRunner(
      client,
      config as unknown as ComplianceConfig,
      runnerOptions
    );
    const report = await runner.run();

    // Generate report
    logger.info('📝 Generating report...');
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
    logger.success(`Report written to ${reportPath}`);

    // Print summary
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
