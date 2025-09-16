export type LogLevel = 'quiet' | 'normal' | 'verbose';

export interface Logger {
  info(message: string): void;
  success?(message: string): void;
  warning(message: string): void;
  error(message: string): void;
  debug(message: string): void;
  startGroup(title: string): void;
  endGroup(): void;
}

export interface ConsoleLoggerOptions {
  verbose?: boolean;
  quiet?: boolean;
}

// Keep the old ConsoleLogger for backward compatibility
class ConsoleLogger implements Logger {
  private level: LogLevel;

  constructor(options: ConsoleLoggerOptions = {}) {
    if (options.quiet) {
      this.level = 'quiet';
    } else if (options.verbose) {
      this.level = 'verbose';
    } else {
      this.level = 'normal';
    }
  }

  info(message: string): void {
    if (this.level === 'quiet') return;
    console.log(`ℹ️  ${message}`);
  }

  success(message: string): void {
    if (this.level === 'quiet') return;
    console.log(`✅ ${message}`);
  }

  warning(message: string): void {
    if (this.level === 'quiet') return;
    console.warn(`⚠️  ${message}`);
  }

  error(message: string): void {
    console.error(`❌ ${message}`);
  }

  debug(message: string): void {
    if (this.level !== 'verbose') return;
    console.log(`🔍 ${message}`);
  }

  startGroup(title: string): void {
    if (this.level !== 'verbose') return;
    console.log(`\n📦 ${title}`);
    console.log('─'.repeat(50));
  }

  endGroup(): void {
    if (this.level !== 'verbose') return;
    console.log('─'.repeat(50));
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

export async function group(title: string, fn: () => Promise<void>): Promise<void> {
  activeLogger.startGroup(title);
  try {
    await fn();
  } finally {
    activeLogger.endGroup();
  }
}

export { ConsoleLogger };
export { ProgressLogger } from './progress-logger';
export type { CheckSummary, LoggerOptions, OutputMode, ProgressUpdate } from './types';
