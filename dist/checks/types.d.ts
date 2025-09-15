export interface CheckDetails {
    current?: Record<string, unknown>;
    expected?: unknown;
    actions_needed?: CheckAction[];
    branches?: Record<string, unknown>;
    recommendations?: string[];
    [key: string]: unknown;
}
export interface CheckAction {
    action: string;
    [key: string]: unknown;
}
export interface AppliedAction {
    action: string;
    details: Record<string, unknown>;
}
export interface CollaboratorPermissions {
    admin?: boolean;
    maintain?: boolean;
    push?: boolean;
    triage?: boolean;
    pull?: boolean;
}
export interface RepositoryUpdateSettings {
    allow_merge_commit?: boolean;
    allow_squash_merge?: boolean;
    allow_rebase_merge?: boolean;
    archived?: boolean;
    [key: string]: unknown;
}
export interface RepositoryWithMergeMethods {
    allow_merge_commit?: boolean;
    allow_squash_merge?: boolean;
    allow_rebase_merge?: boolean;
    [key: string]: unknown;
}
export interface BranchProtectionConfig {
    required_status_checks?: {
        strict?: boolean;
        contexts?: string[];
    };
    enforce_admins?: boolean;
    required_pull_request_reviews?: {
        required_approving_review_count?: number;
        dismiss_stale_reviews?: boolean;
        require_code_owner_reviews?: boolean;
    };
    restrictions?: {
        users?: string[];
        teams?: string[];
    };
}
export interface SecurityConfig {
    dependabot_alerts?: boolean;
    secret_scanning?: boolean;
    secret_scanning_push_protection?: boolean;
    code_scanning?: boolean;
    [key: string]: unknown;
}
export interface SecurityAndAnalysis {
    dependency_graph?: {
        status?: string;
    };
    dependabot_security_updates?: {
        status?: string;
    };
    secret_scanning?: {
        status?: string;
    };
    secret_scanning_push_protection?: {
        status?: string;
    };
    advanced_security?: {
        status?: string;
    };
}
export interface RepositoryWithSecurity {
    security_and_analysis?: SecurityAndAnalysis;
    [key: string]: unknown;
}
export interface VulnerabilityAlert {
    state: string;
    [key: string]: unknown;
}
export interface SecurityClient {
    getVulnerabilityAlerts(owner: string, repo: string): Promise<VulnerabilityAlert[]>;
    updateVulnerabilityAlerts(owner: string, repo: string, enabled: boolean): Promise<unknown>;
    updateSecretScanning(owner: string, repo: string, enabled: boolean): Promise<unknown>;
    updateSecretScanningPushProtection(owner: string, repo: string, enabled: boolean): Promise<unknown>;
}
export interface RepositoryListOptions {
    type?: 'all' | 'public' | 'private' | 'owner' | 'member';
    sort?: 'created' | 'updated' | 'pushed' | 'full_name';
    direction?: 'asc' | 'desc';
    includeArchived?: boolean;
}
export interface OctokitRepository {
    archived?: boolean;
    [key: string]: unknown;
}
export interface SpecificRepoConfig {
    archived?: boolean;
    [key: string]: unknown;
}
//# sourceMappingURL=types.d.ts.map