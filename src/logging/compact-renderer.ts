import chalk from 'chalk';
import logUpdate from 'log-update';
import type { CheckSummary } from './types';

interface RenderState {
  phase: 'scanning' | 'processing' | 'completed';
  currentRepo?: string;
  currentCheck?: string;
  processedRepos: number;
  totalRepos: number;
  checkSummaries: Map<string, CheckSummary>;
  startTime: number;
}

export class CompactRenderer {
  private state: RenderState;
  private width: number;
  private intervalId: NodeJS.Timeout | undefined;

  constructor() {
    this.width = process.stdout.columns || 80;
    this.state = {
      phase: 'scanning',
      processedRepos: 0,
      totalRepos: 0,
      checkSummaries: new Map(),
      startTime: Date.now(),
    };

    // Update on terminal resize
    process.stdout.on('resize', () => {
      this.width = process.stdout.columns || 80;
      this.render();
    });
  }

  start(totalRepos: number): void {
    this.state.totalRepos = totalRepos;
    this.state.phase = 'processing';

    // Start rendering loop
    this.intervalId = setInterval(() => this.render(), 100);
    this.render();
  }

  stop(): void {
    if (this.intervalId !== undefined) {
      clearInterval(this.intervalId);
    }
    this.intervalId = undefined;
    this.state.phase = 'completed';
    this.render();
    logUpdate.done();
  }

  updateProgress(current: number, total: number, repo?: string, check?: string): void {
    this.state.processedRepos = current;
    this.state.totalRepos = total;
    if (repo !== undefined) {
      this.state.currentRepo = repo;
    }
    if (check !== undefined) {
      this.state.currentCheck = check;
    }
  }

  updateCheck(name: string, summary: CheckSummary): void {
    this.state.checkSummaries.set(name, summary);
  }

  private render(): void {
    const lines: string[] = [];

    // Progress bar
    if (this.state.phase === 'processing') {
      lines.push(this.renderProgressBar());
      lines.push('');
    }

    // Current activity
    if (this.state.currentRepo) {
      const activity = this.truncate(
        `${chalk.cyan('►')} ${this.state.currentRepo}${
          this.state.currentCheck ? ` | ${this.state.currentCheck}` : ''
        }`,
        this.width
      );
      lines.push(activity);
    }

    // Check summaries (compact)
    if (this.state.checkSummaries.size > 0) {
      lines.push('');
      lines.push(this.renderCheckSummaries());
    }

    // Stats line
    if (this.state.phase === 'processing') {
      lines.push('');
      lines.push(this.renderStats());
    }

    logUpdate(lines.join('\n'));
  }

  private renderProgressBar(): string {
    const percentage = Math.round((this.state.processedRepos / this.state.totalRepos) * 100) || 0;
    const barWidth = Math.min(30, this.width - 20);
    const filled = Math.round((percentage / 100) * barWidth);
    const empty = barWidth - filled;

    const bar = chalk.cyan('█').repeat(filled) + chalk.gray('░').repeat(empty);
    const counter = `${this.state.processedRepos}/${this.state.totalRepos}`;

    return `${bar} ${chalk.bold(`${percentage}%`)} | ${counter}`;
  }

  private renderCheckSummaries(): string {
    const checks = Array.from(this.state.checkSummaries.entries());
    const lines: string[] = [];

    for (const [name, summary] of checks) {
      const icon = this.getCheckIcon(summary);
      const stats = this.formatCheckStats(summary);
      const line = `${icon} ${chalk.bold(name)}: ${stats}`;
      lines.push(this.truncate(line, this.width));
    }

    return lines.join('\n');
  }

  private getCheckIcon(summary: CheckSummary): string {
    if (summary.status === 'completed') {
      if (summary.issues === 0) {
        return chalk.green('✓');
      }
      return chalk.yellow('⚠');
    }
    if (summary.status === 'failed') {
      return chalk.red('✗');
    }
    if (summary.status === 'running') {
      return chalk.cyan('⟳');
    }
    return chalk.gray('○');
  }

  private formatCheckStats(summary: CheckSummary): string {
    const parts: string[] = [];

    if (summary.compliant > 0) {
      parts.push(chalk.green(`${summary.compliant} compliant`));
    }
    if (summary.issues > 0) {
      parts.push(chalk.yellow(`${summary.issues} issues`));
    }
    if (summary.fixed > 0) {
      parts.push(chalk.cyan(`${summary.fixed} fixed`));
    }

    return parts.length > 0 ? parts.join(', ') : chalk.gray('pending');
  }

  private renderStats(): string {
    const elapsed = Math.round((Date.now() - this.state.startTime) / 1000);
    const rate =
      this.state.processedRepos > 0 ? (this.state.processedRepos / elapsed).toFixed(1) : '0';

    return chalk.gray(`⏱  ${elapsed}s elapsed | ${rate} repos/s`);
  }

  private truncate(str: string, maxWidth: number): string {
    // Account for ANSI escape codes
    // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequences are necessary
    const plainText = str.replace(/\u001b\[[0-9;]*m/g, '');
    if (plainText.length <= maxWidth) {
      return str;
    }

    // Truncate and add ellipsis
    const visibleLength = maxWidth - 3;
    let current = 0;
    let result = '';
    let inAnsi = false;

    for (let i = 0; i < str.length; i++) {
      if (str[i] === '\u001b') {
        inAnsi = true;
      }

      if (!inAnsi && current >= visibleLength) {
        break;
      }

      result += str[i];

      if (!inAnsi) {
        current++;
      }

      if (inAnsi && str[i] === 'm') {
        inAnsi = false;
      }
    }

    return `${result}...`;
  }

  clear(): void {
    logUpdate.clear();
  }
}
