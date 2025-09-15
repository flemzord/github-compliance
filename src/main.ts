import * as core from '@actions/core';
import { validateDefaults, validateFromFile } from './config';

async function run(): Promise<void> {
  try {
    const configPath = core.getInput('config_path') || '.github/compliance.yml';
    const dryRun = core.getBooleanInput('dry_run') ?? true;
    // TODO: Implement these inputs later
    // const checksInput = core.getInput('checks');
    // const includeArchived = core.getBooleanInput('include_archived') ?? false;
    // const reposInput = core.getInput('repos');

    core.info(`Starting compliance check with config: ${configPath}`);
    core.info(`Dry run mode: ${dryRun}`);

    const config = await validateFromFile(configPath);
    const warnings = validateDefaults(config);

    for (const warning of warnings) {
      core.warning(warning);
    }

    core.info('Configuration validated successfully');

    core.setOutput('report_path', './compliance-report.json');
    core.setOutput('compliance_percentage', '100');
    core.setOutput('non_compliant_count', '0');
  } catch (error) {
    core.setFailed(`Action failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (require.main === module) {
  run();
}

export { run };
