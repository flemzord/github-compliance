import { BaseCheck, type CheckContext, type CheckResult } from './base';
export declare class SecurityScanningCheck extends BaseCheck {
    readonly name = "security-scanning";
    readonly description = "Verify repository security scanning settings";
    shouldRun(context: CheckContext): boolean;
    check(context: CheckContext): Promise<CheckResult>;
    fix(context: CheckContext): Promise<CheckResult>;
}
//# sourceMappingURL=security-scanning.d.ts.map