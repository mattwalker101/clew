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
});
