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

export interface StaticRule {
  id: string;
  name: string;
  severity: "error" | "warning";
  manifestKeys: string[];
  check: (value: unknown, manifest: unknown) => string | null;
}

export function getValueByPath(obj: unknown, path: string): unknown {
  if (obj === null || obj === undefined) {
    return undefined;
  }
  
  const parts = path.split(".");
  let current: unknown = obj;
  
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    
    if (Array.isArray(current)) {
      // Recursive array search: collect from all elements
      const subPath = parts.slice(i).join(".");
      const results: unknown[] = [];
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
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  
  return current;
}

export const defaultStaticRules: StaticRule[] = [
  {
    id: "cap-mismatch",
    name: "Capability and Description Misalignment",
    severity: "error",
    manifestKeys: ["description"],
    check: (desc: unknown, manifest: unknown) => {
      if (typeof desc !== "string") return null;
      // ReDoS safe regex (simple word alternation, no overlapping quantifiers)
      const match = /(download|curl|wget|fetch|execute|bash|shell|run command)/i.test(desc);
      if (match) {
        const requiredCaps = getValueByPath(manifest, "capabilities.required");
        const optionalCaps = getValueByPath(manifest, "capabilities.optional");
        const caps: unknown[] = [
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
    severity: "error",
    manifestKeys: ["steps.gates"],
    check: (gates: unknown) => {
      if (!Array.isArray(gates)) return null;
      for (const gate of gates) {
        if (gate && typeof gate === "object") {
          const type = (gate as Record<string, unknown>).type;
          const command = (gate as Record<string, unknown>).command;
          if (type === "command" && typeof command === "string") {
            // ReDoS safe check: combine linear substring check with simple safe regex
            const isSuspicious = 
              (command.toLowerCase().includes("curl") && (command.toLowerCase().includes("http:") || command.toLowerCase().includes("https:"))) ||
              (command.toLowerCase().includes("wget") && (command.toLowerCase().includes("http:") || command.toLowerCase().includes("https:"))) ||
              /curl\s+-[a-zA-Z0-9_-]*\s*https?:/i.test(command) ||
              /wget\s+https?:/i.test(command) ||
              /nc\s+-e/i.test(command) ||
              /\/dev\/(tcp|udp)/i.test(command);

            if (isSuspicious) {
              return `Runbook step gate command contains unsafe direct curl/wget networking or socket redirection: '${command}'`;
            }
          }
        }
      }
      return null;
    }
  }
];

export function scanStaticManifest(manifest: unknown): StaticScanResult {
  const errors: ScanError[] = [];
  
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
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
      try {
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
      } catch (e: any) {
        errors.push({
          type: "static",
          file: "skill.yaml",
          ruleId: rule.id,
          message: `${rule.name} failed during execution: ${e?.message || String(e)}`,
          severity: rule.severity
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
