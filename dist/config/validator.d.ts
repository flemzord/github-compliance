import { type ComplianceConfig } from './schema';
export declare class ConfigValidationError extends Error {
    readonly issues: string[];
    constructor(message: string, issues?: string[]);
}
export declare function validateFromFile(configPath: string): Promise<ComplianceConfig>;
export declare function validateFromString(yamlContent: string, sourcePath?: string): Promise<ComplianceConfig>;
export declare function validateFromString(configPath: string): Promise<{
    config: ComplianceConfig;
    warnings: string[];
}>;
export declare function validateDefaults(config: ComplianceConfig): string[];
//# sourceMappingURL=validator.d.ts.map