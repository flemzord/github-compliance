// Create shared mock functions that can be reset between tests
const mockRest = {
  users: {
    getAuthenticated: jest.fn().mockResolvedValue({
      data: {
        login: 'test-user',
        id: 12345,
        type: 'User',
      },
    }),
  },
  repos: {
    listForOrg: jest.fn().mockResolvedValue({
      data: [
        {
          id: 1,
          name: 'test-repo',
          full_name: 'test-org/test-repo',
          private: false,
          archived: false,
          disabled: false,
          fork: false,
          default_branch: 'main',
          updated_at: '2023-01-01T00:00:00Z',
          pushed_at: '2023-01-01T00:00:00Z',
          stargazers_count: 10,
          forks_count: 5,
          open_issues_count: 2,
          size: 1024,
          language: 'TypeScript',
        },
      ],
    }),
    listForAuthenticatedUser: jest.fn().mockResolvedValue({
      data: [
        {
          id: 2,
          name: 'user-repo',
          full_name: 'test-user/user-repo',
          private: true,
          archived: false,
          disabled: false,
          fork: false,
          default_branch: 'main',
          updated_at: '2023-01-01T00:00:00Z',
          pushed_at: '2023-01-01T00:00:00Z',
          stargazers_count: 1,
          forks_count: 0,
          open_issues_count: 0,
          size: 512,
          language: 'JavaScript',
        },
      ],
    }),
    get: jest.fn().mockResolvedValue({
      data: {
        id: 1,
        name: 'test-repo',
        full_name: 'test-org/test-repo',
        private: false,
        archived: false,
        disabled: false,
        fork: false,
        default_branch: 'main',
        updated_at: '2023-01-01T00:00:00Z',
        pushed_at: '2023-01-01T00:00:00Z',
        stargazers_count: 10,
        forks_count: 5,
        open_issues_count: 2,
        size: 1024,
        language: 'TypeScript',
        permissions: {
          admin: true,
          maintain: true,
          push: true,
          triage: true,
          pull: true,
        },
      },
    }),
    getBranch: jest.fn().mockResolvedValue({
      data: {
        name: 'main',
        commit: {
          sha: 'abc123',
          url: 'https://api.github.com/repos/owner/repo/commits/abc123',
        },
        protected: true,
      },
    }),
    getBranchProtection: jest.fn().mockResolvedValue({
      data: {
        required_status_checks: {
          strict: true,
          contexts: ['ci/test'],
          checks: [{ context: 'ci/test' }],
        },
        enforce_admins: true,
        required_pull_request_reviews: {
          dismiss_stale_reviews: true,
          require_code_owner_reviews: true,
          required_approving_review_count: 2,
          require_last_push_approval: false,
        },
        restrictions: null,
        allow_force_pushes: false,
        allow_deletions: false,
        required_conversation_resolution: true,
        lock_branch: false,
        allow_fork_syncing: true,
      },
    }),
    updateBranchProtection: jest.fn().mockResolvedValue({
      data: {
        required_status_checks: {
          strict: true,
          contexts: ['ci/test'],
          checks: [{ context: 'ci/test' }],
        },
        enforce_admins: true,
        required_pull_request_reviews: {
          dismiss_stale_reviews: true,
          require_code_owner_reviews: true,
          required_approving_review_count: 2,
          require_last_push_approval: false,
        },
        restrictions: null,
        allow_force_pushes: false,
        allow_deletions: false,
        required_conversation_resolution: true,
        lock_branch: false,
        allow_fork_syncing: true,
      },
    }),
    listCollaborators: jest.fn().mockResolvedValue({
      data: [
        {
          id: 1,
          login: 'collaborator1',
          type: 'User',
          permissions: {
            admin: false,
            maintain: false,
            push: true,
            triage: true,
            pull: true,
          },
        },
      ],
    }),
    listTeams: jest.fn().mockResolvedValue({
      data: [
        {
          id: 1,
          name: 'Team Alpha',
          slug: 'team-alpha',
          permission: 'write',
        },
      ],
    }),
    update: jest.fn().mockResolvedValue({
      data: {
        id: 1,
        name: 'updated-repo',
        allow_merge_commit: true,
        allow_squash_merge: true,
        allow_rebase_merge: false,
        delete_branch_on_merge: true,
      },
    }),
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

const mockPaginate = {
  iterator: jest.fn().mockImplementation((fn, _options) => {
    // Mock pagination iterator that yields one page of data
    return [
      {
        data:
          fn === mockRest.repos.listForOrg
            ? [
                {
                  id: 1,
                  name: 'test-repo',
                  full_name: 'test-org/test-repo',
                  private: false,
                  archived: false,
                  disabled: false,
                  fork: false,
                  default_branch: 'main',
                  updated_at: '2023-01-01T00:00:00Z',
                  pushed_at: '2023-01-01T00:00:00Z',
                  stargazers_count: 10,
                  forks_count: 5,
                  open_issues_count: 2,
                  size: 1024,
                  language: 'TypeScript',
                },
              ]
            : fn === mockRest.repos.listForAuthenticatedUser
              ? [
                  {
                    id: 2,
                    name: 'user-repo',
                    full_name: 'test-user/user-repo',
                    private: true,
                    archived: false,
                    disabled: false,
                    fork: false,
                    default_branch: 'main',
                    updated_at: '2023-01-01T00:00:00Z',
                    pushed_at: '2023-01-01T00:00:00Z',
                    stargazers_count: 1,
                    forks_count: 0,
                    open_issues_count: 0,
                    size: 512,
                    language: 'JavaScript',
                  },
                ]
              : fn === mockRest.repos.listCollaborators
                ? [
                    {
                      id: 1,
                      login: 'collaborator1',
                      type: 'User',
                      permissions: {
                        admin: false,
                        maintain: false,
                        push: true,
                        triage: true,
                        pull: true,
                      },
                    },
                  ]
                : fn === mockRest.repos.listTeams
                  ? [
                      {
                        id: 1,
                        name: 'Team Alpha',
                        slug: 'team-alpha',
                        permission: 'write',
                      },
                    ]
                  : [],
      },
    ];
  }),
};

class MockOctokit {
  constructor(options) {
    this.options = options;
    this.rest = mockRest;
    this.paginate = mockPaginate;
  }

  static plugin(_plugin) {
    return MockOctokit;
  }
}

module.exports = {
  Octokit: MockOctokit,
  // Export the mock objects so tests can access them
  __mockRest: mockRest,
  __mockPaginate: mockPaginate,
};
