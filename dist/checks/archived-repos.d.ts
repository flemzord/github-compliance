import { BaseCheck, type CheckContext, type CheckResult } from './base';
export declare class ArchivedReposCheck extends BaseCheck {
    readonly name = "archived-repos";
    readonly description = "Verify repository archival status and cleanup";
    shouldRun(context: CheckContext): boolean;
    check(context: CheckContext): Promise<CheckResult>;
    fix(context: CheckContext): Promise<CheckResult>;
}
//# sourceMappingURL=archived-repos.d.ts.map