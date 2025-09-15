import { BaseCheck, type CheckContext, type CheckResult } from './base';
export declare class MergeMethodsCheck extends BaseCheck {
    readonly name = "merge-methods";
    readonly description = "Verify repository merge methods configuration";
    shouldRun(context: CheckContext): boolean;
    check(context: CheckContext): Promise<CheckResult>;
    fix(context: CheckContext): Promise<CheckResult>;
}
//# sourceMappingURL=merge-methods.d.ts.map