// Test script to verify direct collaborators API behavior
const { Octokit } = require('@octokit/rest');

async function testCollaborators() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error('Please set GITHUB_TOKEN environment variable');
    process.exit(1);
  }

  const octokit = new Octokit({ auth: token });

  // Test repository
  const owner = 'flemzord';
  const repo = 'github-compliance-action';

  console.log(`\nTesting collaborators for ${owner}/${repo}:\n`);

  try {
    // Get all collaborators (default behavior)
    console.log('1. All collaborators (default):');
    const allCollabs = await octokit.rest.repos.listCollaborators({
      owner,
      repo,
      per_page: 100,
    });
    console.log(`   Found ${allCollabs.data.length} collaborators`);
    allCollabs.data.forEach((c) => {
      console.log(`   - ${c.login} (${c.type})`);
    });

    // Get direct collaborators only
    console.log('\n2. Direct collaborators only (affiliation=direct):');
    const directCollabs = await octokit.rest.repos.listCollaborators({
      owner,
      repo,
      affiliation: 'direct',
      per_page: 100,
    });
    console.log(`   Found ${directCollabs.data.length} direct collaborators`);
    directCollabs.data.forEach((c) => {
      console.log(`   - ${c.login} (${c.type})`);
    });

    // Get teams
    console.log('\n3. Teams with access:');
    const teams = await octokit.rest.repos.listTeams({
      owner,
      repo,
      per_page: 100,
    });
    console.log(`   Found ${teams.data.length} teams`);
    teams.data.forEach((t) => {
      console.log(`   - ${t.name} (${t.permission})`);
    });
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testCollaborators();
