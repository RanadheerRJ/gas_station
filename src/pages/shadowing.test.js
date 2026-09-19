import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function jsxFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? jsxFiles(path)
      : entry.name.endsWith(".jsx")
        ? [path]
        : [];
  });
}

function translatorShadows(path) {
  const lines = readFileSync(path, "utf8").split("\n");
  let depth = 0;
  const declarations = [];
  const failures = [];

  lines.forEach((line, index) => {
    const declaration = /\b(?:const|let|var)\s+t\s*=/.test(line);
    if (declaration)
      declarations.push({ depth, line: index + 1, callsTranslator: false });

    for (const scope of declarations) {
      if (/\bt\s*\(\s*["'`]/.test(line) && index + 1 !== scope.line)
        scope.callsTranslator = true;
    }

    depth += (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
    for (let i = declarations.length - 1; i >= 0; i -= 1) {
      const scope = declarations[i];
      if (depth < scope.depth) {
        if (scope.callsTranslator) failures.push(`${path}:${scope.line}`);
        declarations.splice(i, 1);
      }
    }
  });

  for (const scope of declarations) {
    if (scope.callsTranslator) failures.push(`${path}:${scope.line}`);
  }
  return failures;
}

function expectNoTranslatorShadows(directory) {
  const failures = jsxFiles(directory).flatMap(translatorShadows);
  expect(failures, `local t shadows the translator in: ${failures.join(", ")}`).toEqual(
    []
  );
}

describe("translator bindings", () => {
  it("are not shadowed by locals in pages", () => {
    expectNoTranslatorShadows(new URL(".", import.meta.url).pathname);
  });

  it("are not shadowed by locals in components", () => {
    expectNoTranslatorShadows(new URL("../components", import.meta.url).pathname);
  });
});
