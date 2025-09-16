import logUpdate from 'log-update';
import { CompactRenderer } from '../compact-renderer';
import type { CheckSummary } from '../types';

type LogUpdateMock = jest.MockedFunction<typeof logUpdate> & {
  clear: jest.Mock;
  done: jest.Mock;
};

describe('CompactRenderer', () => {
  let renderer: CompactRenderer;
  let originalStderrWrite: typeof process.stderr.write;
  let logUpdateMock: LogUpdateMock;
  let originalColumnsDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();

    logUpdateMock = logUpdate as unknown as LogUpdateMock;
    logUpdateMock.mockClear();
    logUpdateMock.clear.mockClear();
    logUpdateMock.done.mockClear();

    originalStderrWrite = process.stderr.write;
    originalColumnsDescriptor = Object.getOwnPropertyDescriptor(process.stdout, 'columns');
    Object.defineProperty(process.stdout, 'columns', {
      configurable: true,
      value: 120,
    });

    renderer = new CompactRenderer();
  });

  afterEach(() => {
    renderer.stop();
    process.stderr.write = originalStderrWrite;
    if (originalColumnsDescriptor) {
      Object.defineProperty(process.stdout, 'columns', originalColumnsDescriptor);
    } else {
      delete (process.stdout as unknown as { columns?: number }).columns;
    }
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('renders progress updates and truncates long lines', () => {
    renderer.start(5);
    expect(logUpdateMock).toHaveBeenCalled();
    expect(logUpdateMock.clear).toHaveBeenCalled();
    expect(process.stderr.write).not.toBe(originalStderrWrite);

    Object.defineProperty(process.stdout, 'columns', {
      configurable: true,
      value: 30,
    });
    process.stdout.emit('resize');

    renderer.updateProgress(2, 5, 'a-very-long-repository-name-to-truncate', 'LongCheck');
    jest.advanceTimersByTime(300);

    const lastCallIndex = logUpdateMock.mock.calls.length - 1;
    const lastCall = logUpdateMock.mock.calls[lastCallIndex]?.[0] as string;
    expect(lastCall).toContain('2/5');
    expect(lastCall).toContain('a-very-long-repository');
    expect(lastCall).toContain('...');
  });

  it('renders check summaries with stats details', () => {
    renderer.start(4);
    const completed: CheckSummary = {
      name: 'Security',
      compliant: 2,
      issues: 1,
      fixed: 1,
      status: 'completed',
    };
    const failed: CheckSummary = {
      name: 'Permissions',
      compliant: 0,
      issues: 2,
      fixed: 0,
      status: 'failed',
    };

    renderer.updateCheck('Security', completed);
    renderer.updateCheck('Permissions', failed);
    renderer.updateProgress(3, 4, 'repo', 'Security');
    jest.advanceTimersByTime(300);

    const outputIndex = logUpdateMock.mock.calls.length - 1;
    const output = logUpdateMock.mock.calls[outputIndex]?.[0] as string;
    expect(output).toContain('Security');
    expect(output).toContain('2 compliant');
    expect(output).toContain('1 issues');
    expect(output).toContain('1 fixed');
    expect(output).toContain('Permissions');
    expect(output).toContain('2 issues');
    expect(output).toContain('repos/s');
  });

  it('clears and stops rendering restoring stderr', () => {
    renderer.start(1);
    const overriddenWrite = process.stderr.write;
    expect(overriddenWrite).not.toBe(originalStderrWrite);

    renderer.clear();
    expect(logUpdateMock.clear.mock.calls.length).toBeGreaterThan(0);

    renderer.stop();
    expect(logUpdateMock.done).toHaveBeenCalled();
    expect(process.stderr.write).not.toBe(overriddenWrite);
  });
});
