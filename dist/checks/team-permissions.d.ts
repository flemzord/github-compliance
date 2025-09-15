import { BaseCheck, type CheckContext, type CheckResult } from './base';
export declare class TeamPermissionsCheck extends BaseCheck {
    readonly name = "team-permissions";
    readonly description = "Verify repository team permissions and collaborator access";
    shouldRun(context: CheckContext): boolean;
    check(context: CheckContext): Promise<CheckResult>;
    fix(context: CheckContext): Promise<CheckResult>;
    private getCollaboratorPermissionLevel;
    private mapPermissionLevel;
}
//# sourceMappingURL=team-permissions.d.ts.map