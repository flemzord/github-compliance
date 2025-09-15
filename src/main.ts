import * as core from '@actions/core';
import { validateDefaults, validateFromFile } from './config';

interface ActionInputs {
  token: string;
  configPath: string;
  dryRun: boolean;
  checks?: string[] | undefined;
  includeArchived: boolean;
  repos?: string[] | undefined;
}

interface ActionOutputs {
  reportPath: string;
  compliancePercentage: number;
  nonCompliantCount: number;
  summary: string;
}

function parseInputs(): ActionInputs {
  const token = core.getInput('token', { required: true });
  const configPath = core.getInput('config_path') || '.github/compliance.yml';
  const dryRun = core.getBooleanInput('dry_run') ?? true;
  const includeArchived = core.getBooleanInput('include_archived') ?? false;

  // Parse comma-separated lists
  const checksInput = core.getInput('checks');
  const checks = checksInput
    ? checksInput
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean)
    : undefined;

  const reposInput = core.getInput('repos');
  const repos = reposInput
    ? reposInput
        .split(',')
        .map((r) => r.trim())
        .filter(Boolean)
    : undefined;

  return {
    token,
    configPath,
    dryRun,
    checks: checks ?? undefined,
    includeArchived,
    repos: repos ?? undefined,
  };
}

function setOutputs(outputs: ActionOutputs): void {
  core.setOutput('report_path', outputs.reportPath);
  core.setOutput('compliance_percentage', outputs.compliancePercentage.toString());
  core.setOutput('non_compliant_count', outputs.nonCompliantCount.toString());
  core.setOutput('summary', outputs.summary);
}

async function run(): Promise<void> {
  try {
    const inputs = parseInputs();

    core.info(`Starting compliance check with config: ${inputs.configPath}`);
    core.info(`Dry run mode: ${inputs.dryRun}`);
    core.info(`Include archived repos: ${inputs.includeArchived}`);

    if (inputs.checks) {
      core.info(`Running specific checks: ${inputs.checks.join(', ')}`);
    }

    if (inputs.repos) {
      core.info(`Filtering repositories: ${inputs.repos.join(', ')}`);
    }

    // Validate configuration
    const config = await validateFromFile(inputs.configPath);
    const warnings = validateDefaults(config);

    for (const warning of warnings) {
      core.warning(warning);
    }

    core.info('Configuration validated successfully');

    // TODO: Implement actual compliance checking
    // For now, return placeholder values
    const outputs: ActionOutputs = {
      reportPath: './compliance-report.json',
      compliancePercentage: 100,
      nonCompliantCount: 0,
      summary: 'All repositories are compliant (placeholder)',
    };

    setOutputs(outputs);
    core.info(`✅ Compliance check completed: ${outputs.compliancePercentage}% compliant`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    core.error(errorMessage);
    core.setFailed(`Action failed: ${errorMessage}`);
  }
}

if (require.main === module) {
  run();
}

export { run };
