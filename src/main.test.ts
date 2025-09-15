import * as core from '@actions/core';
import * as configValidator from './config';
import { run } from './main';

jest.mock('@actions/core');
jest.mock('./config');

const mockedCore = core as jest.Mocked<typeof core>;
const mockedConfigValidator = configValidator as jest.Mocked<typeof configValidator>;

describe('main', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedCore.getInput.mockImplementation((name: string) => {
      switch (name) {
        case 'config_path':
          return '.github/compliance.yml';
        case 'checks':
          return '';
        case 'repos':
          return '';
        default:
          return '';
      }
    });
    mockedCore.getBooleanInput.mockImplementation((name: string) => {
      switch (name) {
        case 'dry_run':
          return true;
        case 'include_archived':
          return false;
        default:
          return false;
      }
    });
  });

  it('should run successfully with valid configuration', async () => {
    const mockConfig: configValidator.ComplianceConfig = {
      version: 1,
      defaults: {
        merge_methods: {
          allow_merge_commit: false,
          allow_squash_merge: true,
          allow_rebase_merge: false,
        },
      },
    };

    mockedConfigValidator.validateFromFile.mockResolvedValue(mockConfig);
    mockedConfigValidator.validateDefaults.mockReturnValue([]);

    await run();

    expect(mockedCore.info).toHaveBeenCalledWith(
      'Starting compliance check with config: .github/compliance.yml'
    );
    expect(mockedCore.info).toHaveBeenCalledWith('Dry run mode: true');
    expect(mockedCore.info).toHaveBeenCalledWith('Configuration validated successfully');
    expect(mockedCore.setOutput).toHaveBeenCalledWith('report_path', './compliance-report.json');
    expect(mockedCore.setOutput).toHaveBeenCalledWith('compliance_percentage', '100');
    expect(mockedCore.setOutput).toHaveBeenCalledWith('non_compliant_count', '0');
    expect(mockedCore.setFailed).not.toHaveBeenCalled();
  });

  it('should show warnings when configuration has issues', async () => {
    const mockConfig: configValidator.ComplianceConfig = {
      version: 1,
      defaults: {
        merge_methods: {
          allow_merge_commit: false,
          allow_squash_merge: false,
          allow_rebase_merge: false,
        },
      },
    };

    const warnings = ['All merge methods are disabled'];
    mockedConfigValidator.validateFromFile.mockResolvedValue(mockConfig);
    mockedConfigValidator.validateDefaults.mockReturnValue(warnings);

    await run();

    expect(mockedCore.warning).toHaveBeenCalledWith('All merge methods are disabled');
    expect(mockedCore.setFailed).not.toHaveBeenCalled();
  });

  it('should handle configuration validation errors', async () => {
    const error = new Error('Invalid configuration');
    mockedConfigValidator.validateFromFile.mockRejectedValue(error);

    await run();

    expect(mockedCore.setFailed).toHaveBeenCalledWith('Action failed: Invalid configuration');
  });

  it('should handle non-Error exceptions', async () => {
    mockedConfigValidator.validateFromFile.mockRejectedValue('String error');

    await run();

    expect(mockedCore.setFailed).toHaveBeenCalledWith('Action failed: String error');
  });
});
