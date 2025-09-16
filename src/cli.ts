#!/usr/bin/env node

import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Command } from 'commander';
import type { ComplianceConfig } from './config/types';
import { validateFromString } from './config/validator';
import { GitHubClient } from './github/client';
import { ConsoleLogger, ProgressLogger, setLogger } from './logging';
import { JsonReporter, MarkdownReporter } from './reporting';
import { ComplianceRunner } from './runner';
import type { RunnerOptions } from './runner/types';

interface RunOptions {
  config: string;
  token?: string;
  org?: string;
  dryRun?: boolean;
  repos?: string;
  checks?: string;
  includeArchived?: boolean;
  format?: string;
  output?: string;
  mode?: string;
  verbose?: boolean;
  quiet?: boolean;
}

interface ValidateOptions {
  config: string;
  verbose?: boolean;
  quiet?: boolean;
}

async function runCommand(options: RunOptions): Promise<void> {
  // Use ProgressLogger for compact and detailed modes, ConsoleLogger for backward compatibility
  const mode = options.mode || 'compact';
  const logger =
    mode === 'compact' || mode === 'detailed'
      ? new ProgressLogger({
          verbose: options.verbose || false,
          quiet: options.quiet || false,
          mode: mode as 'compact' | 'detailed',
        })
      : new ConsoleLogger({ verbose: options.verbose || false, quiet: options.quiet || false });

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

    // Get token from flag or environment
    const token = options.token || process.env.GITHUB_TOKEN;
    if (!token) {
      throw new Error('--token flag or GITHUB_TOKEN environment variable is required');
    }

    // Create GitHub client
    if (!(logger instanceof ProgressLogger)) {
      logger.info('🔗 Connecting to GitHub...');
    }
    const client = new GitHubClient({
      token: token,
      throttle: {
        enabled: true,
        retries: 3,
        retryDelay: 1000,
      },
    });
    client.setOwner(organization);

    // Create runner options
    const runnerOptions: RunnerOptions = {
      dryRun: options.dryRun || false,
      ...(options.checks && { checks: options.checks.split(',').map((c) => c.trim()) }),
      includeArchived: options.includeArchived || false,
      ...(options.repos && { repos: options.repos.split(',').map((r) => r.trim()) }),
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

    const format = options.format || 'markdown';
    if (format === 'json') {
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

async function validateCommand(options: ValidateOptions): Promise<void> {
  const logger = new ConsoleLogger({
    verbose: options.verbose || false,
    quiet: options.quiet || false,
  });
  setLogger(logger);

  try {
    // Validate configuration file exists
    const configPath = resolve(process.cwd(), options.config);
    if (!existsSync(configPath)) {
      logger.error(`❌ Configuration file not found: ${configPath}`);
      process.exit(1);
    }

    logger.info('🔍 Validating configuration file...\n');

    // Try to load and validate configuration
    try {
      const result = await validateFromString(configPath);
      const config = typeof result === 'object' && 'config' in result ? result.config : result;
      const warnings = (
        typeof result === 'object' && 'warnings' in result ? result.warnings : []
      ) as string[];

      // Display warnings if any
      if (Array.isArray(warnings) && warnings.length > 0) {
        logger.warning('⚠️  Warnings found:\n');
        for (const warning of warnings) {
          logger.warning(`  • ${warning}`);
        }
        logger.info(''); // Empty line
      }

      // Display summary in verbose mode
      if (options.verbose) {
        logger.info('📋 Configuration Summary:\n');
        logger.info(
          `  Organization: ${(config as ComplianceConfig).organization || 'Not specified'}`
        );

        const defaults = (config as ComplianceConfig).defaults;
        if (defaults) {
          const checkTypes: string[] = [];
          if (defaults.merge_methods) checkTypes.push('merge-methods');
          if (defaults.branch_protection) checkTypes.push('branch-protection');
          if (defaults.security) checkTypes.push('security');
          if (defaults.permissions) checkTypes.push('permissions');
          if (defaults.archived_repos) checkTypes.push('archived-repos');

          if (checkTypes.length > 0) {
            logger.info(`  Configured checks: ${checkTypes.join(', ')}`);
          }
        }

        const rules = (config as ComplianceConfig).rules;
        if (rules && rules.length > 0) {
          logger.info(`  Repository rules: ${rules.length} rule(s) configured`);
          if (options.verbose) {
            for (let i = 0; i < rules.length; i++) {
              const rule = rules[i];
              logger.info(`\n  Rule ${i + 1}:`);
              if (rule.match.repositories) {
                logger.info(`    Repositories: ${rule.match.repositories.join(', ')}`);
              }
              if (rule.match.only_private !== undefined) {
                logger.info(`    Only private: ${rule.match.only_private}`);
              }
              const appliedChecks = Object.keys(rule.apply);
              logger.info(`    Applies: ${appliedChecks.join(', ')}`);
            }
          }
        }
        logger.info(''); // Empty line
      }

      logger.success('✅ Configuration is valid!');

      // Show basic info even in non-verbose mode
      if (!options.verbose && !options.quiet) {
        const defaults = (config as ComplianceConfig).defaults;
        const checkCount = defaults ? Object.keys(defaults).length : 0;
        const rules = (config as ComplianceConfig).rules;
        const ruleCount = rules ? rules.length : 0;

        logger.info(`  Organization: ${(config as ComplianceConfig).organization}`);
        logger.info(`  Checks configured: ${checkCount}`);
        logger.info(`  Repository rules: ${ruleCount}`);
      }

      process.exit(0);
    } catch (validationError) {
      // Check if it's a ConfigValidationError with detailed issues
      const isConfigError = validationError instanceof Error &&
                           'issues' in validationError &&
                           Array.isArray((validationError as any).issues);

      if (isConfigError) {
        const configError = validationError as any;
        logger.error('❌ Configuration validation failed:\n');

        // Display each validation issue
        for (const issue of configError.issues) {
          logger.error(`  • ${issue}`);
        }

        logger.info('\n💡 Tips for fixing validation errors:');
        logger.info('  • Check the YAML syntax is correct');
        logger.info('  • Ensure all required fields are present');
        logger.info('  • Verify field types match the schema (strings, booleans, numbers)');
        logger.info('  • Check enum values are from the allowed list');
        logger.info('  • Review the example configuration in the documentation');

        if (options.verbose) {
          logger.info('\n📖 Schema documentation: https://github.com/flemzord/github-compliance');
        }
      } else if (validationError instanceof Error) {
        logger.error(`❌ Validation failed: ${validationError.message}`);

        if (options.verbose && validationError.stack) {
          console.error('\nStack trace:', validationError.stack);
        }
      } else {
        logger.error('❌ An unknown error occurred during validation');
      }

      process.exit(1);
    }
  } catch (error) {
    if (error instanceof Error) {
      logger.error(`❌ Error: ${error.message}`);
      if (options.verbose && error.stack) {
        console.error(error.stack);
      }
    } else {
      logger.error('❌ An unknown error occurred');
    }
    process.exit(1);
  }
}

function main(): void {
  const program = new Command();

  program
    .name('github-compliance-cli')
    .description('🛡️ CLI to enforce repository compliance standards across your GitHub organization')
    .version('1.0.0');

  // Run command - existing functionality
  program
    .command('run')
    .description('Run compliance checks on repositories')
    .requiredOption('-c, --config <path>', 'Path to compliance configuration YAML file')
    .option('-t, --token <token>', 'GitHub personal access token (or use GITHUB_TOKEN env)')
    .option('-o, --org <name>', 'GitHub organization name (optional, will be read from config)')
    .option('-d, --dry-run', 'Run in dry-run mode (no changes will be made)', false)
    .option('--repos <list>', 'Comma-separated list of repository names to check')
    .option('--checks <list>', 'Comma-separated list of checks to run')
    .option('--include-archived', 'Include archived repositories', false)
    .option('--format <type>', 'Report format: json or markdown', 'markdown')
    .option('--output <path>', 'Output file path (default: compliance-report.[md|json])')
    .option('--mode <type>', 'Output mode: compact, detailed, or json', 'compact')
    .option('-v, --verbose', 'Enable verbose logging', false)
    .option('-q, --quiet', 'Minimal output (only errors and summary)', false)
    .action(async (options) => {
      // Validate format
      if (options.format !== 'json' && options.format !== 'markdown') {
        console.error('Error: --format must be either "json" or "markdown"');
        process.exit(1);
      }

      // Check for conflicting verbose and quiet flags
      if (options.verbose && options.quiet) {
        console.error('Error: --verbose and --quiet cannot be used together');
        process.exit(1);
      }

      // Validate mode
      if (options.mode && !['compact', 'detailed', 'json'].includes(options.mode)) {
        console.error(
          `Error: Invalid mode '${options.mode}'. Must be one of: compact, detailed, json`
        );
        process.exit(1);
      }

      await runCommand(options);
    });

  // Validate command - new functionality
  program
    .command('validate')
    .description('Validate a compliance configuration file')
    .requiredOption('-c, --config <path>', 'Path to compliance configuration YAML file')
    .option('-v, --verbose', 'Show detailed validation information', false)
    .option('-q, --quiet', 'Minimal output (only errors)', false)
    .action(async (options) => {
      // Check for conflicting verbose and quiet flags
      if (options.verbose && options.quiet) {
        console.error('Error: --verbose and --quiet cannot be used together');
        process.exit(1);
      }

      await validateCommand(options);
    });

  // Parse arguments
  program.parse(process.argv);

  // Show help if no command provided
  if (process.argv.length < 3) {
    program.help();
  }
}

// Run the CLI
if (require.main === module) {
  main();
}

export { main, runCommand, validateCommand };
