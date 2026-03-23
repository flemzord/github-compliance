import chalk from 'chalk';

export type LogLevel = 'quiet' | 'normal' | 'verbose';

export interface Logger {
  info(message: string): void;
  success?(message: string): void;
  warning(message: string): void;
  error(message: string): void;
  debug(message: string): void;
  startGroup(title: string): void;
  endGroup(): void;
  header?(message: string): void;
  box?(content: string, style?: 'success' | 'error' | 'info'): void;
}

export interface ConsoleLoggerOptions {
  verbose?: boolean;
  quiet?: boolean;
  useColors?: boolean;
}

// Keep the old ConsoleLogger for backward compatibility
class ConsoleLogger implements Logger {
  private level: LogLevel;
  private useColors: boolean;

  constructor(options: ConsoleLoggerOptions = {}) {
    if (options.quiet) {
      this.level = 'quiet';
    } else if (options.verbose) {
      this.level = 'verbose';
    } else {
      this.level = 'normal';
    }
    this.useColors = options.useColors !== false;
  }

  private colorize(text: string, colorFn: (text: string) => string): string {
    return this.useColors ? colorFn(text) : text;
  }

  info(message: string): void {
    if (this.level === 'quiet') return;
    console.log(this.colorize(`ℹ️  ${message}`, chalk.blue));
  }

  success(message: string): void {
    if (this.level === 'quiet') return;
    console.log(this.colorize(`✅ ${message}`, chalk.green));
  }

  warning(message: string): void {
    if (this.level === 'quiet') return;
    console.warn(this.colorize(`⚠️  ${message}`, chalk.yellow));
  }

  error(message: string): void {
    console.error(this.colorize(`❌ ${message}`, chalk.red));
  }

  debug(message: string): void {
    if (this.level !== 'verbose') return;
    console.log(this.colorize(`🔍 ${message}`, chalk.gray));
  }

  startGroup(title: string): void {
    if (this.level !== 'verbose') return;
    console.log(this.colorize(`\n📦 ${title}`, chalk.cyan.bold));
    console.log(chalk.gray('─'.repeat(50)));
  }

  endGroup(): void {
    if (this.level !== 'verbose') return;
    console.log(chalk.gray('─'.repeat(50)));
  }

  header(message: string): void {
    if (this.level === 'quiet') return;
    const border = '═'.repeat(message.length + 4);
    console.log(this.colorize(`╔${border}╗`, chalk.cyan));
    console.log(this.colorize(`║  ${message}  ║`, chalk.cyan.bold));
    console.log(this.colorize(`╚${border}╝`, chalk.cyan));
  }

  box(content: string, style: 'success' | 'error' | 'info' = 'info'): void {
    if (this.level === 'quiet') return;
    const lines = content.split('\n');
    const maxLength = Math.max(...lines.map((l) => l.length));
    const padding = 2;
    const boxWidth = maxLength + padding * 2;

    let colorFn = chalk.blue;
    if (style === 'success') colorFn = chalk.green;
    else if (style === 'error') colorFn = chalk.red;

    console.log(this.colorize(`╭${'─'.repeat(boxWidth)}╮`, colorFn));
    lines.forEach((line) => {
      const paddedLine = line.padEnd(maxLength, ' ');
      console.log(
        this.colorize(`│${' '.repeat(padding)}${paddedLine}${' '.repeat(padding)}│`, colorFn)
      );
    });
    console.log(this.colorize(`╰${'─'.repeat(boxWidth)}╯`, colorFn));
  }
}

let activeLogger: Logger = new ConsoleLogger();

export function setLogger(logger: Logger): void {
  activeLogger = logger;
}

export function resetLogger(): void {
  activeLogger = new ConsoleLogger();
}

export function info(message: string): void {
  activeLogger.info(message);
}

export function warning(message: string): void {
  activeLogger.warning(message);
}

export function error(message: string): void {
  activeLogger.error(message);
}

export function debug(message: string): void {
  activeLogger.debug(message);
}

export function header(message: string): void {
  if (activeLogger.header) {
    activeLogger.header(message);
  }
}

export function box(content: string, style?: 'success' | 'error' | 'info'): void {
  if (activeLogger.box) {
    activeLogger.box(content, style);
  }
}

export async function group(title: string, fn: () => Promise<void>): Promise<void> {
  activeLogger.startGroup(title);
  try {
    await fn();
  } finally {
    activeLogger.endGroup();
  }
}

export { ProgressLogger } from './progress-logger';
export type { CheckSummary, LoggerOptions, OutputMode, ProgressUpdate } from './types';
export { ConsoleLogger };
