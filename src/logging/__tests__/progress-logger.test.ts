import ora from 'ora';
import type { ProgressLogger as ProgressLoggerClass } from '../progress-logger';

jest.mock('../compact-renderer', () => ({
  __esModule: true,
  CompactRenderer: jest.fn(() => ({
    start: jest.fn(),
    stop: jest.fn(),
    updateProgress: jest.fn(),
    updateCheck: jest.fn(),
    clear: jest.fn(),
  })),
}));

const {
  ProgressLogger,
}: { ProgressLogger: typeof ProgressLoggerClass } = require('../progress-logger');
const { CompactRenderer } = require('../compact-renderer') as {
  CompactRenderer: jest.Mock;
};

if (!jest.isMockFunction(CompactRenderer)) {
  throw new Error('CompactRenderer mock was not applied');
}

type CompactRendererMockType = {
  start: jest.Mock;
  stop: jest.Mock;
  updateProgress: jest.Mock;
  updateCheck: jest.Mock;
  clear: jest.Mock;
};

const getRendererInstance = (index = 0): CompactRendererMockType => {
  const result = CompactRenderer.mock.results[index];
  if (!result || !result.value) {
    throw new Error(`Expected CompactRenderer to have been instantiated for call ${index}`);
  }
  return result.value as CompactRendererMockType;
};

describe('ProgressLogger', () => {
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    const { CompactRenderer } = jest.requireMock('../compact-renderer') as {
      CompactRenderer: jest.Mock;
    };
    CompactRenderer.mockClear();

    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs info messages as JSON when in json mode', () => {
    const logger = new ProgressLogger({ mode: 'json' });
    logger.info('json-info');

    expect(logSpy).toHaveBeenCalledTimes(1);
    const payload = logSpy.mock.calls[0][0];
    expect(typeof payload).toBe('string');
    const parsed = JSON.parse(payload as string);
    expect(parsed.level).toBe('info');
    expect(parsed.data).toBe('json-info');
  });

  it('only emits compact info logs when renderer is inactive', () => {
    const logger = new ProgressLogger({ mode: 'compact' });
    logger.info('initial message');
    expect(logSpy).toHaveBeenCalledWith('initial message');

    logger.startProgress(5, 'Scanning repositories');
    expect(CompactRenderer).toHaveBeenCalledTimes(1);
    const rendererInstance = getRendererInstance();
    expect(rendererInstance.start).toHaveBeenCalledWith(5);

    logSpy.mockClear();
    logger.info('suppressed message');
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('handles success with spinner in detailed mode', () => {
    const logger = new ProgressLogger({ mode: 'detailed' });
    logger.startProgress(3, 'Processing repositories');

    const oraMock = ora as unknown as jest.Mock;
    const spinner = oraMock.mock.results[0]?.value as {
      start: jest.Mock;
      succeed: jest.Mock;
    };
    expect(spinner.start).toHaveBeenCalled();

    logSpy.mockClear();
    logger.success('All checks completed');
    expect(spinner.succeed).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith('✓ All checks completed');
  });

  it('invokes spinner succeed when present in compact mode', () => {
    const logger = new ProgressLogger({ mode: 'compact' });
    const spinnerMock = {
      succeed: jest.fn(),
      fail: jest.fn(),
    };
    (logger as unknown as { spinner: typeof spinnerMock }).spinner = spinnerMock;

    logger.success('Compact success');

    expect(spinnerMock.succeed).toHaveBeenCalledWith('Compact success');
    expect(logSpy).toHaveBeenCalledWith('✓ Compact success');
  });

  it('respects quiet mode for warnings but still logs JSON warnings', () => {
    const quietLogger = new ProgressLogger({ quiet: true, mode: 'compact' });
    quietLogger.warning('hidden warning');
    expect(warnSpy).not.toHaveBeenCalled();

    logSpy.mockClear();
    const jsonLogger = new ProgressLogger({ quiet: true, mode: 'json' });
    jsonLogger.warning('json warning');
    const payload = logSpy.mock.calls[0][0];
    const parsed = JSON.parse(payload as string);
    expect(parsed.level).toBe('warning');
    expect(parsed.data).toBe('json warning');
  });

  it('clears renderer before printing errors in compact mode', () => {
    const logger = new ProgressLogger({ mode: 'compact' });
    logger.startProgress(1, 'Processing');
    const rendererInstance = getRendererInstance();

    logger.error('boom');

    expect(rendererInstance.clear).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith('✗ boom');
  });

  it('only logs debug output when verbose and renderer inactive', () => {
    const verboseLogger = new ProgressLogger({ verbose: true, mode: 'detailed' });
    verboseLogger.debug('detailed debug');
    expect(logSpy).toHaveBeenCalledWith('detailed debug');

    logSpy.mockClear();
    const compactLogger = new ProgressLogger({ verbose: true, mode: 'compact' });
    compactLogger.startProgress(1, 'Progress');
    compactLogger.debug('suppressed debug');
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('prints group separators in detailed mode and JSON in json mode', () => {
    const logger = new ProgressLogger({ mode: 'detailed' });
    logger.startGroup('Group Title');
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Group Title'));

    logSpy.mockClear();
    logger.endGroup();
    expect(logSpy).toHaveBeenCalledWith('─'.repeat(50));

    logSpy.mockClear();
    const jsonLogger = new ProgressLogger({ mode: 'json' });
    jsonLogger.startGroup('json-group');
    const startPayload = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(startPayload.level).toBe('group_start');

    logSpy.mockClear();
    jsonLogger.endGroup();
    const endPayload = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(endPayload.level).toBe('group_end');
  });

  it('updates spinner text and summaries in detailed mode', () => {
    const logger = new ProgressLogger({ mode: 'detailed' });
    logger.startProgress(5, 'Processing');
    const oraMock = ora as unknown as jest.Mock;
    const spinner = oraMock.mock.results[0]?.value as {
      text: string;
    };

    logger.updateProgress({
      current: 2,
      total: 5,
      repository: 'repo',
      check: 'Check',
      status: 'running',
    });

    expect(spinner.text).toContain('repo');
    expect(spinner.text).toContain('Check');
    expect(spinner.text).toContain('2/5');
    const summary = logger.checkSummaries.get('Check');
    expect(summary).toEqual({
      name: 'Check',
      compliant: 0,
      issues: 0,
      fixed: 0,
      status: 'running',
    });
  });

  it('delegates progress updates to compact renderer', () => {
    const logger = new ProgressLogger({ mode: 'compact' });
    logger.startProgress(4, 'Processing');
    const rendererInstance = getRendererInstance();

    logger.updateProgress({
      current: 1,
      total: 4,
      repository: 'Repo',
      check: 'Check',
      status: 'completed',
    });

    expect(rendererInstance.updateProgress).toHaveBeenCalledWith(1, 4, 'Repo', 'Check');
    const summary = logger.checkSummaries.get('Check');
    expect(summary?.status).toBe('completed');
  });

  it('stops progress renderer and spinner appropriately', () => {
    const detailedLogger = new ProgressLogger({ mode: 'detailed' });
    detailedLogger.startProgress(2, 'Processing');
    const oraMock = ora as unknown as jest.Mock;
    const spinner = oraMock.mock.results[0]?.value as {
      fail: jest.Mock;
    };
    detailedLogger.stopProgress(false);
    expect(spinner.fail).toHaveBeenCalled();

    const compactLogger = new ProgressLogger({ mode: 'compact' });
    compactLogger.startProgress(1, 'Processing');
    const rendererInstance = getRendererInstance();
    compactLogger.stopProgress();
    expect(rendererInstance.stop).toHaveBeenCalled();
  });

  it('updates check summaries and notifies renderer in compact mode', () => {
    const logger = new ProgressLogger({ mode: 'compact' });
    logger.startProgress(1, 'Processing');
    const rendererInstance = getRendererInstance();

    logger.updateCheckSummary('Security', { compliant: 2, fixed: 1, status: 'completed' });

    const summary = logger.checkSummaries.get('Security');
    expect(summary).toEqual({
      name: 'Security',
      compliant: 2,
      issues: 0,
      fixed: 1,
      status: 'completed',
    });
    expect(rendererInstance.updateCheck).toHaveBeenCalledWith('Security', summary);
  });

  it('renders textual summary including totals when colors disabled', () => {
    const logger = new ProgressLogger({ mode: 'detailed', colors: false });
    logger.checkSummaries.set('Complete', {
      name: 'Complete',
      compliant: 3,
      issues: 0,
      fixed: 1,
      status: 'completed',
    });
    logger.checkSummaries.set('Failed', {
      name: 'Failed',
      compliant: 0,
      issues: 2,
      fixed: 0,
      status: 'failed',
    });
    logger.checkSummaries.set('Running', {
      name: 'Running',
      compliant: 1,
      issues: 1,
      fixed: 0,
      status: 'running',
    });
    logger.checkSummaries.set('Pending', {
      name: 'Pending',
      compliant: 0,
      issues: 0,
      fixed: 0,
      status: 'pending',
    });

    logSpy.mockClear();
    logger.displaySummary();

    const outputs = logSpy.mock.calls.map((call) => call[0]);
    expect(
      outputs.some((line) => typeof line === 'string' && line.includes('Compliance Check Summary'))
    ).toBe(true);
    expect(outputs.some((line) => typeof line === 'string' && line.includes('TOTAL'))).toBe(true);
    expect(outputs.some((line) => typeof line === 'string' && line.includes('Completed in'))).toBe(
      true
    );
  });

  it('shows header information when not silent', () => {
    const logger = new ProgressLogger({ mode: 'detailed' });
    logSpy.mockClear();

    logger.showHeader({ configFile: 'config.yml', organization: 'acme', mode: 'audit' });

    const outputs = logSpy.mock.calls.map((call) => call[0]);
    expect(
      outputs.find((line) => typeof line === 'string' && line.includes('GitHub Compliance Check'))
    ).toBeDefined();
    expect(
      outputs.find((line) => typeof line === 'string' && line.includes('config.yml'))
    ).toBeDefined();
    expect(outputs.find((line) => typeof line === 'string' && line.includes('acme'))).toBeDefined();
    expect(
      outputs.find((line) => typeof line === 'string' && line.includes('Mode: audit'))
    ).toBeDefined();
  });
});
