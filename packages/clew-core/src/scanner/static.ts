export interface ScanError {
  type: "static" | "behavioral" | "semantic";
  file: string;
  ruleId?: string;
  message: string;
  severity: "error" | "warning";
}

export interface StaticScanResult {
  valid: boolean;
  errors: ScanError[];
}

export function getValueByPath(obj: any, path: string): any {
  if (obj === null || obj === undefined) {
    return undefined;
  }
  
  const parts = path.split(".");
  let current: any = obj;
  
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    
    if (Array.isArray(current)) {
      // Recursive array search: collect from all elements
      const subPath = parts.slice(i).join(".");
      const results: any[] = [];
      for (const item of current) {
        const val = getValueByPath(item, subPath);
        if (val !== undefined) {
          if (Array.isArray(val)) {
            results.push(...val);
          } else {
            results.push(val);
          }
        }
      }
      return results;
    }
    
    if (typeof current === "object" && current !== null) {
      current = current[part];
    } else {
      return undefined;
    }
  }
  
  return current;
}

export const defaultStaticRules = [
  {
    id: "cap-mismatch",
    name: "Capability and Description Misalignment",
    severity: "error" as const,
    manifestKeys: ["description"],
    check: (desc: string, manifest: any) => {
      if (typeof desc !== "string") return null;
      // ReDoS safe regex (simple word alternation, no overlapping quantifiers)
      const match = /(download|curl|wget|fetch|execute|bash|shell|run command)/i.test(desc);
      if (match) {
        const requiredCaps = getValueByPath(manifest, "capabilities.required") || [];
        const optionalCaps = getValueByPath(manifest, "capabilities.optional") || [];
        const caps = [
          ...(Array.isArray(requiredCaps) ? requiredCaps : []),
          ...(Array.isArray(optionalCaps) ? optionalCaps : [])
        ];
        if (!caps.includes("internet") && !caps.includes("terminal")) {
          return "Skill description mentions network/execution operations but does not declare 'internet' or 'terminal' capabilities!";
        }
      }
      return null;
    }
  },
  {
    id: "unrestricted-network-gate",
    name: "Block Arbitrary Fetch Step Gates",
    severity: "error" as const,
    manifestKeys: ["steps.gates"],
    check: (gates: any[]) => {
      if (!Array.isArray(gates)) return null;
      for (const gate of gates) {
        if (gate && gate.type === "command" && typeof gate.command === "string") {
          const cmd = gate.command;
          // ReDoS safe check: combine linear substring check with simple safe regex
          const isSuspicious = 
            (cmd.toLowerCase().includes("curl") && (cmd.toLowerCase().includes("http:") || cmd.toLowerCase().includes("https:"))) ||
            (cmd.toLowerCase().includes("wget") && (cmd.toLowerCase().includes("http:") || cmd.toLowerCase().includes("https:"))) ||
            /curl\s+-[a-zA-Z0-9_-]*\s*https?:/i.test(cmd) ||
            /wget\s+https?:/i.test(cmd) ||
            /nc\s+-e/i.test(cmd);

          if (isSuspicious) {
            return `Runbook step gate command contains unsafe direct curl/wget networking: '${gate.command}'`;
          }
        }
      }
      return null;
    }
  }
];

export function scanStaticManifest(manifest: any): StaticScanResult {
  const errors: ScanError[] = [];
  
  if (!manifest || typeof manifest !== "object") {
    return {
      valid: false,
      errors: [{
        type: "static",
        file: "skill.yaml",
        message: "Manifest must be a valid object",
        severity: "error"
      }]
    };
  }

  for (const rule of defaultStaticRules) {
    for (const key of rule.manifestKeys) {
      const value = getValueByPath(manifest, key);
      if (value !== undefined) {
        const errorMsg = rule.check(value, manifest);
        if (errorMsg) {
          errors.push({
            type: "static",
            file: "skill.yaml",
            ruleId: rule.id,
            message: `${rule.name}: ${errorMsg}`,
            severity: rule.severity
          });
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
