import * as acorn from "acorn";
import { ScanError } from "./static.js";

export interface ScriptScanResult {
  valid: boolean;
  errors: ScanError[];
}

interface ASTNode {
  type: string;
  [key: string]: unknown;
}

function isASTNode(node: unknown): node is ASTNode {
  return (
    typeof node === "object" &&
    node !== null &&
    "type" in node &&
    typeof (node as { type: unknown }).type === "string"
  );
}

function scanJavaScriptAST(filename: string, code: string): ScanError[] {
  const errors: ScanError[] = [];
  try {
    const ast = acorn.parse(code, { ecmaVersion: "latest", sourceType: "module" });
    const walk = (node: unknown): void => {
      if (!isASTNode(node)) return;

      if (node.type === "Identifier") {
        const name = node.name;
        if (typeof name === "string" && ["eval", "fetch", "Function"].includes(name)) {
          errors.push({
            type: "behavioral",
            file: filename,
            message: `Unauthorized global identifier usage: '${name}'`,
            severity: "error"
          });
        }
      }

      if (node.type === "CallExpression") {
        const callee = node.callee;
        if (isASTNode(callee) && callee.type === "Identifier" && callee.name === "require") {
          const args = node.arguments;
          if (Array.isArray(args) && args.length > 0) {
            const firstArg = args[0];
            if (isASTNode(firstArg) && firstArg.type === "Literal") {
              const value = firstArg.value;
              if (typeof value === "string") {
                const forbidden = ["child_process", "net", "http", "https", "dgram"];
                if (forbidden.includes(value)) {
                  errors.push({
                    type: "behavioral",
                    file: filename,
                    message: `Unauthorized import of system module: '${value}'`,
                    severity: "error"
                  });
                }
              }
            }
          }
        }
      }

      for (const key of Object.keys(node)) {
        const child = node[key];
        if (Array.isArray(child)) {
          for (const item of child) {
            walk(item);
          }
        } else if (isASTNode(child)) {
          walk(child);
        }
      }
    };
    walk(ast);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    errors.push({
      type: "behavioral",
      file: filename,
      message: `Syntax validation failed: ${message}`,
      severity: "error"
    });
  }
  return errors;
}

function scanPythonHeuristics(filename: string, code: string): ScanError[] {
  const errors: ScanError[] = [];
  const rules = [
    { pattern: /\bsubprocess\b/, msg: "subprocess" },
    { pattern: /\burllib\b/, msg: "urllib" },
    { pattern: /\brequests\b/, msg: "requests" },
    { pattern: /\bsocket\b/, msg: "socket" },
    { pattern: /os\.system\s*\(/, msg: "os.system(" },
    { pattern: /os\.popen\s*\(/, msg: "os.popen(" },
    { pattern: /\beval\s*\(/, msg: "eval(" },
    { pattern: /\bexec\s*\(/, msg: "exec(" },
    { pattern: /pty\.spawn\s*\(/, msg: "pty.spawn(" }
  ];

  for (const rule of rules) {
    if (rule.pattern.test(code)) {
      errors.push({
        type: "behavioral",
        file: filename,
        message: `Unauthorized Python safety violation: '${rule.msg}'`,
        severity: "error"
      });
    }
  }
  return errors;
}

function scanShellHeuristics(filename: string, code: string): ScanError[] {
  const errors: ScanError[] = [];
  const rules = [
    { pattern: /\bcurl\b/, msg: "curl" },
    { pattern: /\bwget\b/, msg: "wget" },
    { pattern: /\bnc\b/, msg: "nc" },
    { pattern: /\bnetcat\b/, msg: "netcat" },
    { pattern: /\btelnet\b/, msg: "telnet" },
    { pattern: /\bssh\b/, msg: "ssh" },
    { pattern: /\bsh\s+-c\b/, msg: "sh -c" },
    { pattern: /\bbash\s+-c\b/, msg: "bash -c" },
    { pattern: /(?<![#!])\/bin\/sh\b/, msg: "/bin/sh" },
    { pattern: /(?<![#!])\/bin\/bash\b/, msg: "/bin/bash" },
    { pattern: /\bsudo\b/, msg: "sudo" },
    { pattern: /\bsu\b/, msg: "su" },
    { pattern: /\/dev\/tcp\b/, msg: "/dev/tcp" },
    { pattern: /\/dev\/udp\b/, msg: "/dev/udp" }
  ];

  for (const rule of rules) {
    if (rule.pattern.test(code)) {
      errors.push({
        type: "behavioral",
        file: filename,
        message: `Unauthorized Shell safety violation: '${rule.msg}'`,
        severity: "error"
      });
    }
  }
  return errors;
}

export function scanScriptSafety(filename: string, code: string): ScriptScanResult {
  let errors: ScanError[] = [];
  if (filename.endsWith(".js") || filename.endsWith(".ts")) {
    errors = scanJavaScriptAST(filename, code);
  } else if (filename.endsWith(".py")) {
    errors = scanPythonHeuristics(filename, code);
  } else if (filename.endsWith(".sh")) {
    errors = scanShellHeuristics(filename, code);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
