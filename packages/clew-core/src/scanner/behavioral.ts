import * as acorn from "acorn";
import ts from "typescript";
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

function preprocessTypeScript(code: string): string {
  try {
    return ts.transpileModule(code, {
      compilerOptions: {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        jsx: ts.JsxEmit.React
      }
    }).outputText;
  } catch {
    return code;
  }
}

function getLiteralOrTemplateString(node: unknown): string | null {
  if (!isASTNode(node)) return null;
  if (node.type === "Literal" && typeof node.value === "string") {
    return node.value;
  }
  if (node.type === "TemplateLiteral") {
    const expressions = node.expressions;
    const quasis = node.quasis;
    if (
      Array.isArray(expressions) &&
      expressions.length === 0 &&
      Array.isArray(quasis) &&
      quasis.length === 1
    ) {
      const quasi = quasis[0];
      if (isASTNode(quasi) && typeof quasi.value === "object" && quasi.value !== null) {
        const valObj = quasi.value as Record<string, unknown>;
        if (typeof valObj.cooked === "string") {
          return valObj.cooked;
        }
      }
    }
  }
  return null;
}

function isPropertyOrParameter(node: ASTNode, parent: ASTNode | null): boolean {
  if (!parent) return false;

  if (parent.type === "MemberExpression" && parent.property === node && !parent.computed) {
    if (node.name === "require") {
      return false;
    }
    return true;
  }
  if (parent.type === "Property" && parent.key === node && !parent.computed) {
    return true;
  }
  if (parent.type === "MethodDefinition" && parent.key === node && !parent.computed) {
    return true;
  }
  if (parent.type === "PropertyDefinition" && parent.key === node && !parent.computed) {
    return true;
  }
  if (
    ["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"].includes(parent.type)
  ) {
    const params = parent.params;
    if (Array.isArray(params) && params.includes(node)) {
      return true;
    }
  }
  return false;
}

function isGlobalObject(node: unknown): boolean {
  if (!isASTNode(node)) return false;

  if (node.type === "Identifier") {
    return typeof node.name === "string" && ["globalThis", "window", "global", "self"].includes(node.name);
  }

  if (node.type === "MemberExpression") {
    if (isGlobalObject(node.object)) {
      let propName: string | null = null;
      if (!node.computed) {
        const property = node.property;
        if (isASTNode(property) && property.type === "Identifier" && typeof property.name === "string") {
          propName = property.name;
        }
      } else {
        propName = getLiteralOrTemplateString(node.property);
      }
      if (propName && ["globalThis", "window", "global", "self"].includes(propName)) {
        return true;
      }
    }
  }

  return false;
}

function checkObjectPatternDestructuring(
  pattern: ASTNode,
  source: unknown,
  filename: string,
  errors: ScanError[]
): void {
  if (pattern.type !== "ObjectPattern") return;
  if (!isGlobalObject(source)) return;

  const properties = pattern.properties;
  if (Array.isArray(properties)) {
    for (const prop of properties) {
      if (isASTNode(prop) && prop.type === "Property") {
        let propName: string | null = null;
        if (!prop.computed) {
          const key = prop.key;
          if (isASTNode(key) && key.type === "Identifier" && typeof key.name === "string") {
            propName = key.name;
          }
        } else {
          propName = getLiteralOrTemplateString(prop.key);
        }

        if (propName && ["eval", "fetch", "Function", "require"].includes(propName)) {
          errors.push({
            type: "behavioral",
            file: filename,
            message: `Unauthorized global identifier usage via destructuring: '${propName}'`,
            severity: "error"
          });
        }
      }
    }
  }
}

function scanJavaScriptAST(filename: string, code: string): ScanError[] {
  const errors: ScanError[] = [];
  try {
    const lowerFn = filename.toLowerCase();
    const isTypeScript = lowerFn.endsWith(".ts") || lowerFn.endsWith(".tsx") || lowerFn.endsWith(".jsx");
    const transpiledCode = isTypeScript ? preprocessTypeScript(code) : code;

    const ast = acorn.parse(transpiledCode, { ecmaVersion: "latest", sourceType: "module" });
    
    const walk = (node: unknown, parent: ASTNode | null = null): void => {
      if (!isASTNode(node)) return;

      if (node.type === "Identifier") {
        const name = node.name;
        if (
          typeof name === "string" && 
          ["eval", "fetch", "Function", "require"].includes(name) &&
          !isPropertyOrParameter(node, parent)
        ) {
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
            const value = getLiteralOrTemplateString(firstArg);
            if (value) {
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

      if (node.type === "ImportDeclaration" || node.type === "ImportExpression") {
        const source = node.source;
        const value = getLiteralOrTemplateString(source);
        if (value) {
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

      if (node.type === "MemberExpression") {
        const object = node.object;
        if (isGlobalObject(object)) {
          let propName: string | null = null;
          if (!node.computed) {
            const property = node.property;
            if (isASTNode(property) && property.type === "Identifier" && typeof property.name === "string") {
              propName = property.name;
            }
          } else {
            propName = getLiteralOrTemplateString(node.property);
          }

          if (propName && ["eval", "fetch", "Function", "require"].includes(propName)) {
            errors.push({
              type: "behavioral",
              file: filename,
              message: `Unauthorized global identifier usage via namespace: '${propName}'`,
              severity: "error"
            });
          }
        }
      }

      if (node.type === "VariableDeclarator") {
        const id = node.id;
        const init = node.init;
        if (isASTNode(id) && init) {
          checkObjectPatternDestructuring(id, init, filename, errors);
        }
      }

      if (node.type === "AssignmentExpression") {
        const left = node.left;
        const right = node.right;
        if (isASTNode(left) && right) {
          checkObjectPatternDestructuring(left, right, filename, errors);
        }
      }

      if (node.type === "AssignmentPattern") {
        const left = node.left;
        const right = node.right;
        if (isASTNode(left) && right) {
          checkObjectPatternDestructuring(left, right, filename, errors);
        }
      }

      for (const key of Object.keys(node)) {
        const child = node[key];
        if (Array.isArray(child)) {
          for (const item of child) {
            walk(item, node);
          }
        } else if (isASTNode(child)) {
          walk(child, node);
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

function cleanComments(code: string, isShell: boolean): string {
  return code
    .split("\n")
    .map((line, idx) => {
      // Preserve shebang on line 1
      if (idx === 0 && line.trim().startsWith("#!")) {
        return line;
      }
      
      let inDoubleQuote = false;
      let inSingleQuote = false;
      let i = 0;
      
      while (i < line.length) {
        const char = line[i];
        const prevChar = i > 0 ? line[i - 1] : "";
        const prevTwo = i > 1 ? line.substring(i - 2, i) : "";
        
        // Handle escaped characters inside quotes
        if (char === "\\" && (inDoubleQuote || inSingleQuote)) {
          i += 2;
          continue;
        }
        
        if (char === '"' && !inSingleQuote) {
          inDoubleQuote = !inDoubleQuote;
        } else if (char === "'" && !inDoubleQuote) {
          inSingleQuote = !inSingleQuote;
        } else if (char === "#" && !inDoubleQuote && !inSingleQuote) {
          // Check for Shell parameter expansions: $# or ${#
          if (isShell) {
            if (prevChar === "$") {
              i++;
              continue;
            }
            if (prevTwo === "${") {
              i++;
              continue;
            }
            if (prevChar !== "" && !/[\s;|&(){}[\]<>]/.test(prevChar)) {
              i++;
              continue;
            }
          }
          // Found a comment! Truncate the line here.
          return line.substring(0, i);
        }
        i++;
      }
      return line;
    })
    .join("\n");
}

function scanPythonHeuristics(filename: string, code: string): ScanError[] {
  const errors: ScanError[] = [];
  const cleanCode = cleanComments(code, false);

  const rules = [
    { pattern: /\bimport\s+subprocess\b/i, msg: "subprocess" },
    { pattern: /\bfrom\s+subprocess\s+import\b/i, msg: "subprocess" },
    { pattern: /\bimport\s+urllib\b/i, msg: "urllib" },
    { pattern: /\bfrom\s+urllib\s+import\b/i, msg: "urllib" },
    { pattern: /\bimport\s+requests\b/i, msg: "requests" },
    { pattern: /\bfrom\s+requests\s+import\b/i, msg: "requests" },
    { pattern: /\bimport\s+socket\b/i, msg: "socket" },
    { pattern: /\bfrom\s+socket\s+import\b/i, msg: "socket" },
    { pattern: /\bos\.system\s*\(/, msg: "os.system(" },
    { pattern: /\bos\.popen\s*\(/, msg: "os.popen(" },
    { pattern: /\bsubprocess\./, msg: "subprocess usage" },
    { pattern: /\beval\s*\(/, msg: "eval(" },
    { pattern: /\bexec\s*\(/, msg: "exec(" },
    { pattern: /\bpty\.spawn\s*\(/, msg: "pty.spawn(" }
  ];

  for (const rule of rules) {
    if (rule.pattern.test(cleanCode)) {
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
  const cleanCode = cleanComments(code, true);
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
    if (rule.pattern.test(cleanCode)) {
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

function detectLanguageFromShebang(code: string): string | null {
  const firstLine = code.split("\n", 1)[0]?.trim();
  if (firstLine && firstLine.startsWith("#!")) {
    const interpreter = firstLine.toLowerCase();
    if (interpreter.includes("python")) {
      return ".py";
    }
    if (
      interpreter.includes("sh") ||
      interpreter.includes("bash") ||
      interpreter.includes("zsh") ||
      interpreter.includes("dash") ||
      interpreter.includes("ksh")
    ) {
      return ".sh";
    }
    if (
      interpreter.includes("node") ||
      interpreter.includes("deno") ||
      interpreter.includes("bun")
    ) {
      return ".js";
    }
  }
  return null;
}

export function scanScriptSafety(filename: string, code: string): ScriptScanResult {
  let errors: ScanError[] = [];
  const lowerName = filename.toLowerCase();

  let detectedExt = "";
  if (
    lowerName.endsWith(".js") ||
    lowerName.endsWith(".ts") ||
    lowerName.endsWith(".tsx") ||
    lowerName.endsWith(".jsx") ||
    lowerName.endsWith(".mjs") ||
    lowerName.endsWith(".cjs")
  ) {
    detectedExt = ".js";
  } else if (lowerName.endsWith(".py")) {
    detectedExt = ".py";
  } else if (lowerName.endsWith(".sh")) {
    detectedExt = ".sh";
  } else {
    const shebangExt = detectLanguageFromShebang(code);
    if (shebangExt) {
      detectedExt = shebangExt;
    }
  }

  if (detectedExt === ".js") {
    errors = scanJavaScriptAST(filename, code);
  } else if (detectedExt === ".py") {
    errors = scanPythonHeuristics(filename, code);
  } else if (detectedExt === ".sh") {
    errors = scanShellHeuristics(filename, code);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
