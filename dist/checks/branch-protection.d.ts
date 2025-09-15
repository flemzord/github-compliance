import { BaseCheck, type CheckContext, type CheckResult } from './base';
export declare class BranchProtectionCheck extends BaseCheck {
    readonly name = "branch-protection";
    readonly description = "Verify repository branch protection rules";
    shouldRun(context: CheckContext): boolean;
    check(context: CheckContext): Promise<CheckResult>;
    fix(context: CheckContext): Promise<CheckResult>;
    private buildProtectionRules;
}
//# sourceMappingURL=branch-protection.d.ts.map