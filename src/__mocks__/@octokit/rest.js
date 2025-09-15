class MockOctokit {
  constructor(options) {
    this.options = options;
    this.rest = {
      users: {
        getAuthenticated: jest.fn().mockResolvedValue({ data: { login: 'test-user' } }),
      },
      repos: {
        listForOrg: jest.fn().mockResolvedValue({ data: [] }),
        listForAuthenticatedUser: jest.fn().mockResolvedValue({ data: [] }),
        get: jest.fn().mockResolvedValue({ data: { id: 1, name: 'test' } }),
        getBranchProtection: jest.fn().mockResolvedValue({ data: null }),
        updateBranchProtection: jest.fn().mockResolvedValue({ data: {} }),
        listCollaborators: jest.fn().mockResolvedValue({ data: [] }),
        listTeams: jest.fn().mockResolvedValue({ data: [] }),
        update: jest.fn().mockResolvedValue({ data: {} }),
        removeCollaborator: jest.fn().mockResolvedValue({}),
        checkVulnerabilityAlerts: jest.fn().mockResolvedValue({}),
      },
      teams: {
        addOrUpdateRepoPermissionsInOrg: jest.fn().mockResolvedValue({}),
        removeRepoInOrg: jest.fn().mockResolvedValue({}),
      },
      secretScanning: {
        getAlert: jest.fn().mockRejectedValue(new Error('Not found')),
      },
    };
    this.paginate = {
      iterator: jest.fn().mockImplementation(() => [{ data: [] }]),
    };
  }

  static plugin(plugin) {
    return MockOctokit;
  }
}

module.exports = {
  Octokit: MockOctokit,
};
