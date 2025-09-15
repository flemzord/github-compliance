import type { RepositoryListOptions } from '../checks/types';
import type { BranchProtectionRule, Collaborator, GitHubClientOptions, Repository, RepositorySettings, SecuritySettings, TeamPermission } from './types';
export declare class GitHubClient {
    private octokit;
    private owner?;
    constructor(options: GitHubClientOptions);
    /**
     * Set the organization/owner context for subsequent operations
     */
    setOwner(owner: string): void;
    /**
     * Get current authenticated user info
     */
    getCurrentUser(): Promise<{
        login: string;
        id: number;
        user_view_type?: string;
        node_id: string;
        avatar_url: string;
        gravatar_id: string | null;
        url: string;
        html_url: string;
        followers_url: string;
        following_url: string;
        gists_url: string;
        starred_url: string;
        subscriptions_url: string;
        organizations_url: string;
        repos_url: string;
        events_url: string;
        received_events_url: string;
        type: string;
        site_admin: boolean;
        name: string | null;
        company: string | null;
        blog: string | null;
        location: string | null;
        email: string | null;
        notification_email?: string | null;
        hireable: boolean | null;
        bio: string | null;
        twitter_username?: string | null;
        public_repos: number;
        public_gists: number;
        followers: number;
        following: number;
        created_at: string;
        updated_at: string;
        private_gists: number;
        total_private_repos: number;
        owned_private_repos: number;
        disk_usage: number;
        collaborators: number;
        two_factor_authentication: boolean;
        plan?: {
            collaborators: number;
            name: string;
            space: number;
            private_repos: number;
        };
        business_plus?: boolean;
        ldap_dn?: string;
    } | {
        login: string;
        id: number;
        user_view_type?: string;
        node_id: string;
        avatar_url: string;
        gravatar_id: string | null;
        url: string;
        html_url: string;
        followers_url: string;
        following_url: string;
        gists_url: string;
        starred_url: string;
        subscriptions_url: string;
        organizations_url: string;
        repos_url: string;
        events_url: string;
        received_events_url: string;
        type: string;
        site_admin: boolean;
        name: string | null;
        company: string | null;
        blog: string | null;
        location: string | null;
        email: string | null;
        notification_email?: string | null;
        hireable: boolean | null;
        bio: string | null;
        twitter_username?: string | null;
        public_repos: number;
        public_gists: number;
        followers: number;
        following: number;
        created_at: string;
        updated_at: string;
        plan?: {
            collaborators: number;
            name: string;
            space: number;
            private_repos: number;
        };
        private_gists?: number;
        total_private_repos?: number;
        owned_private_repos?: number;
        disk_usage?: number;
        collaborators?: number;
    }>;
    /**
     * List repositories for the authenticated user or organization
     */
    listRepositories(options?: {
        owner?: string;
    } & RepositoryListOptions): Promise<Repository[]>;
    /**
     * Get detailed repository information
     */
    getRepository(owner: string, repo: string): Promise<Repository>;
    /**
     * Get branch protection rules for a specific branch
     */
    getBranchProtection(owner: string, repo: string, branch: string): Promise<BranchProtectionRule | null>;
    /**
     * Update branch protection rules
     */
    updateBranchProtection(owner: string, repo: string, branch: string, protection: Partial<BranchProtectionRule>): Promise<BranchProtectionRule>;
    /**
     * Get repository collaborators with permissions
     */
    getCollaborators(owner: string, repo: string): Promise<Collaborator[]>;
    /**
     * Get team permissions for a repository
     */
    getTeamPermissions(owner: string, repo: string): Promise<TeamPermission[]>;
    /**
     * Update repository settings (merge methods, etc.)
     */
    updateRepository(owner: string, repo: string, settings: Partial<RepositorySettings>): Promise<Repository>;
    /**
     * Add or update team permission for repository
     */
    addTeamToRepository(owner: string, repo: string, teamSlug: string, permission: 'pull' | 'triage' | 'push' | 'maintain' | 'admin'): Promise<void>;
    /**
     * Remove team from repository
     */
    removeTeamFromRepository(owner: string, repo: string, teamSlug: string): Promise<void>;
    /**
     * Remove collaborator from repository
     */
    removeCollaborator(owner: string, repo: string, username: string): Promise<void>;
    /**
     * Get security settings for a repository (best effort - some require specific scopes)
     */
    getSecuritySettings(owner: string, repo: string): Promise<SecuritySettings>;
}
//# sourceMappingURL=client.d.ts.map