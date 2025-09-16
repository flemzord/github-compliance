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
  dirty: boolean;
}

export class CompactRenderer {
  private state: RenderState;
  private width: number;
  private intervalId: NodeJS.Timeout | undefined;
  private originalStderr: typeof process.stderr.write | undefined;
  private stderrBuffer: string[] = [];

  constructor() {
    this.width = process.stdout.columns || 80;
    this.state = {
      phase: 'scanning',
      processedRepos: 0,
      totalRepos: 0,
      checkSummaries: new Map(),
      startTime: Date.now(),
      dirty: true,
    };

    // Update on terminal resize
    process.stdout.on('resize', () => {
      this.width = process.stdout.columns || 80;
      this.state.dirty = true;
    });
  }

  start(totalRepos: number): void {
    this.state.totalRepos = totalRepos;
    this.state.phase = 'processing';
    this.state.dirty = true;

    // Capture stderr to prevent API error messages from appearing
    this.captureStderr();

    // Start rendering loop with slower interval to reduce flickering
    this.intervalId = setInterval(() => {
      if (this.state.dirty) {
        this.render();
        this.state.dirty = false;
      }
    }, 250);
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

    // Restore stderr
    this.restoreStderr();
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
    this.state.dirty = true;
  }

  updateCheck(name: string, summary: CheckSummary): void {
    this.state.checkSummaries.set(name, summary);
    this.state.dirty = true;
  }

  private render(): void {
    const lines: string[] = [];

    // Always render progress bar section (fixed height)
    lines.push(this.renderProgressBar());

    // Always render current activity section (fixed height)
    const activity = this.state.currentRepo
      ? this.truncate(
          `${chalk.cyan('►')} ${this.state.currentRepo}${
            this.state.currentCheck ? ` | ${this.state.currentCheck}` : ''
          }`,
          this.width
        )
      : ' '; // Empty line to maintain height
    lines.push(activity);

    // Always render check summaries section (may have variable height but always present)
    lines.push(''); // Separator
    if (this.state.checkSummaries.size > 0) {
      for (const [name, summary] of this.state.checkSummaries) {
        const icon = this.getCheckIcon(summary);
        const stats = this.formatCheckStats(summary);
        const line = `${icon} ${chalk.bold(name)}: ${stats}`;
        lines.push(this.truncate(line, this.width));
      }
    } else {
      lines.push(chalk.gray('Initializing checks...'));
    }

    // Always render stats line
    lines.push(''); // Separator
    lines.push(this.renderStats());

    // Clear previous content and update with new content
    logUpdate.clear();
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

  private captureStderr(): void {
    // Save the original stderr.write function
    this.originalStderr = process.stderr.write.bind(process.stderr);

    // Override stderr.write to capture and suppress output
    // biome-ignore lint/suspicious/noExplicitAny: Node.js stream write signature requires any
    process.stderr.write = (chunk: any, encoding?: any, callback?: any): boolean => {
      // Capture the stderr output but don't display it
      if (typeof chunk === 'string') {
        // Filter out expected 403 errors and other noise
        if (!chunk.includes('403') && !chunk.includes('GET /repos')) {
          // Store only unexpected errors
          this.stderrBuffer.push(chunk);
        }
      }

      // Handle callback if provided
      if (typeof encoding === 'function') {
        encoding();
      } else if (typeof callback === 'function') {
        callback();
      }

      return true;
    };
  }

  private restoreStderr(): void {
    if (this.originalStderr) {
      // Restore the original stderr.write
      process.stderr.write = this.originalStderr;
      this.originalStderr = undefined;

      // Clear the buffer
      this.stderrBuffer = [];
    }
  }
}
