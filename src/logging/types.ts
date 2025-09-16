export type OutputMode = 'compact' | 'detailed' | 'json';

export interface LoggerOptions {
  verbose?: boolean;
  quiet?: boolean;
  mode?: OutputMode;
  colors?: boolean;
  progress?: boolean;
}

export interface Logger {
  info(message: string): void;
  success?(message: string): void;
  warning(message: string): void;
  error(message: string): void;
  debug(message: string): void;
  startGroup(title: string): void;
  endGroup(): void;
}

export interface ProgressUpdate {
  current: number;
  total: number;
  repository?: string;
  check?: string;
  status?: 'running' | 'completed' | 'failed';
}

export interface CheckSummary {
  name: string;
  compliant: number;
  issues: number;
  fixed: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
}
