import { GitHubClient } from '../client';

describe('GitHubClient', () => {
  it('should create an instance', () => {
    const client = new GitHubClient({
      token: 'test-token',
      throttle: { enabled: true, retries: 3, retryDelay: 1000 },
    });

    expect(client).toBeInstanceOf(GitHubClient);
  });

  it('should set owner', () => {
    const client = new GitHubClient({
      token: 'test-token',
      throttle: { enabled: false, retries: 3, retryDelay: 1000 },
    });

    // Just test that the method can be called
    expect(() => client.setOwner('test-owner')).not.toThrow();
  });
});
