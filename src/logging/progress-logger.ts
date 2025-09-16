import chalk from 'chalk';
import Table from 'cli-table3';
import ora, { type Ora } from 'ora';
import { CompactRenderer } from './compact-renderer';
import type { CheckSummary, Logger, LoggerOptions, OutputMode, ProgressUpdate } from './types';

export class ProgressLogger implements Logger {
  private mode: OutputMode;
  private colors: boolean;
  private renderer: CompactRenderer | undefined;
  private spinner: Ora | undefined;
  public checkSummaries: Map<string, CheckSummary> = new Map();
  private silent: boolean;
  private verbose: boolean;
  private startTime: number;

  constructor(options: LoggerOptions = {}) {
    this.mode = options.mode || 'compact';
    this.colors = options.colors !== false;
    this.silent = options.quiet || false;
    this.verbose = options.verbose || false;
    this.startTime = Date.now();

    if (this.colors) {
      chalk.level = 1;
    } else {
      chalk.level = 0;
    }
  }

  info(message: string): void {
    if (this.silent) return;

    if (this.mode === 'json') {
      this.logJson('info', message);
      return;
    }

    if (this.mode === 'compact') {
      // In compact mode, suppress info messages during progress
      // They interfere with the renderer
      if (!this.renderer) {
        console.log(message);
      }
    } else {
      console.log(message);
    }
  }

  success(message: string): void {
    if (this.silent) return;

    if (this.mode === 'json') {
      this.logJson('success', message);
      return;
    }

    const formatted = this.colors ? `${chalk.green('✓')} ${message}` : `✓ ${message}`;

    if (this.mode === 'compact' && this.spinner) {
      this.spinner.succeed(message);
    }
    this.spinner = undefined;

    if (!(this.mode === 'compact' && this.spinner)) {
      console.log(formatted);
    }
  }

  warning(message: string): void {
    if (this.silent && this.mode !== 'json') return;

    if (this.mode === 'json') {
      this.logJson('warning', message);
      return;
    }

    // Suppress warnings in compact mode with active renderer
    if (this.mode === 'compact' && this.renderer) {
      return;
    }

    const formatted = this.colors
      ? `${chalk.yellow('⚠')} ${chalk.yellow(message)}`
      : `⚠ ${message}`;

    console.warn(formatted);
  }

  error(message: string): void {
    if (this.mode === 'json') {
      this.logJson('error', message);
      return;
    }

    // Errors should always be visible, but clear renderer first
    if (this.mode === 'compact' && this.renderer) {
      this.renderer.clear();
    }

    const formatted = this.colors ? `${chalk.red('✗')} ${chalk.red(message)}` : `✗ ${message}`;

    console.error(formatted);
  }

  debug(message: string): void {
    if (!this.verbose || this.silent) return;

    if (this.mode === 'json') {
      this.logJson('debug', message);
      return;
    }

    // Suppress debug in compact mode with active renderer
    if (this.mode === 'compact' && this.renderer) {
      return;
    }

    const formatted = this.colors ? chalk.gray(message) : message;
    console.log(formatted);
  }

  startGroup(title: string): void {
    if (this.silent) return;

    if (this.mode === 'json') {
      this.logJson('group_start', title);
      return;
    }

    if (this.mode === 'compact') {
      // Don't show groups in compact mode
      return;
    }

    console.log(`\n${chalk.bold(title)}`);
    console.log('─'.repeat(50));
  }

  endGroup(): void {
    if (this.silent) return;

    if (this.mode === 'json') {
      this.logJson('group_end', '');
      return;
    }

    if (this.mode === 'compact') {
      return;
    }

    console.log('─'.repeat(50));
  }

  // New methods for enhanced UI

  startProgress(total: number, message: string): void {
    if (this.mode === 'json' || this.silent) return;

    if (this.mode === 'compact') {
      this.renderer = new CompactRenderer();
      this.renderer.start(total);
    } else {
      this.spinner = ora({
        text: message,
        spinner: 'dots',
      }).start();
    }
  }

  updateProgress(update: ProgressUpdate): void {
    if (this.mode === 'json') {
      this.logJson('progress', update);
      return;
    }

    if (this.silent) return;

    if (this.mode === 'compact' && this.renderer) {
      this.renderer.updateProgress(update.current, update.total, update.repository, update.check);
    } else if (this.spinner) {
      this.spinner.text = `Processing ${update.repository || ''} - ${update.check || ''} (${
        update.current
      }/${update.total})`;
    }

    // Update check summaries
    if (update.check) {
      const summary = this.checkSummaries.get(update.check) || {
        name: update.check,
        compliant: 0,
        issues: 0,
        fixed: 0,
        status: 'pending' as const,
      };
      summary.status = update.status || 'running';
      this.checkSummaries.set(update.check, summary);
    }
  }

  stopProgress(success = true): void {
    if (this.renderer) {
      this.renderer.stop();
    }
    this.renderer = undefined;

    if (this.spinner) {
      if (success) {
        this.spinner.succeed();
      } else {
        this.spinner.fail();
      }
    }
    this.spinner = undefined;
  }

  updateCheckSummary(name: string, summary: Partial<CheckSummary>): void {
    const existing = this.checkSummaries.get(name) || {
      name,
      compliant: 0,
      issues: 0,
      fixed: 0,
      status: 'pending' as const,
    };
    const updated = { ...existing, ...summary };
    this.checkSummaries.set(name, updated);

    // Update renderer if in compact mode
    if (this.mode === 'compact' && this.renderer) {
      this.renderer.updateCheck(name, updated);
    }
  }

  displaySummary(): void {
    if (this.mode === 'json') {
      this.logJson('summary', Object.fromEntries(this.checkSummaries));
      return;
    }

    if (this.silent) return;

    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);

    console.log(`\n${chalk.bold('Compliance Check Summary')}`);
    console.log('═'.repeat(60));

    const table = new Table({
      head: ['Check', 'Status', 'Compliant', 'Issues', 'Fixed'].map((h) =>
        this.colors ? chalk.bold.white(h) : h
      ),
      style: {
        head: [],
        border: [],
      },
    });

    let totalCompliant = 0;
    let totalIssues = 0;
    let totalFixed = 0;

    for (const [_, summary] of this.checkSummaries) {
      const statusIcon = this.getStatusIcon(summary.status);
      const statusText = this.getStatusText(summary.status);

      table.push([
        summary.name,
        `${statusIcon} ${statusText}`,
        summary.compliant.toString(),
        summary.issues > 0
          ? this.colors
            ? chalk.red(summary.issues.toString())
            : summary.issues.toString()
          : '0',
        summary.fixed > 0
          ? this.colors
            ? chalk.green(summary.fixed.toString())
            : summary.fixed.toString()
          : '0',
      ]);

      totalCompliant += summary.compliant;
      totalIssues += summary.issues;
      totalFixed += summary.fixed;
    }

    // Add totals row
    table.push([
      this.colors ? chalk.bold('TOTAL') : 'TOTAL',
      '',
      this.colors ? chalk.bold(totalCompliant.toString()) : totalCompliant.toString(),
      totalIssues > 0
        ? this.colors
          ? chalk.bold.red(totalIssues.toString())
          : totalIssues.toString()
        : '0',
      totalFixed > 0
        ? this.colors
          ? chalk.bold.green(totalFixed.toString())
          : totalFixed.toString()
        : '0',
    ]);

    console.log(table.toString());
    console.log(`\n${chalk.gray(`Completed in ${elapsed}s`)}`);
  }

  private getStatusIcon(status: CheckSummary['status']): string {
    switch (status) {
      case 'completed':
        return this.colors ? chalk.green('✓') : '✓';
      case 'failed':
        return this.colors ? chalk.red('✗') : '✗';
      case 'running':
        return this.colors ? chalk.yellow('⟳') : '⟳';
      case 'pending':
        return this.colors ? chalk.gray('○') : '○';
    }
  }

  private getStatusText(status: CheckSummary['status']): string {
    const text = status.charAt(0).toUpperCase() + status.slice(1);
    if (!this.colors) return text;

    switch (status) {
      case 'completed':
        return chalk.green(text);
      case 'failed':
        return chalk.red(text);
      case 'running':
        return chalk.yellow(text);
      case 'pending':
        return chalk.gray(text);
    }
  }

  private logJson(level: string, data: unknown): void {
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        data,
      })
    );
  }

  showHeader(config: { organization?: string; mode: string; configFile: string }): void {
    if (this.mode === 'json' || this.silent) return;

    console.log(chalk.bold.cyan('\nGitHub Compliance Check'));
    console.log('─'.repeat(40));
    console.log(`Config: ${chalk.white(config.configFile)}`);
    if (config.organization) {
      console.log(`Organization: ${chalk.white(config.organization)}`);
    }
    console.log(`Mode: ${chalk.white(config.mode)}`);
    console.log('');
  }
}
