import { describe, it, expect } from "vitest";
import { parseDiff } from "../git.js";

describe("parseDiff", () => {
  it("returns empty array for empty diff", () => {
    expect(parseDiff("")).toEqual([]);
    expect(parseDiff("   ")).toEqual([]);
  });

  it("parses a single file diff", () => {
    const diff = `diff --git a/src/index.ts b/src/index.ts
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +1,4 @@
 import foo from "foo";
+import bar from "bar";
 const x = 1;
-const y = 2;
+const y = 3;`;

    const result = parseDiff(diff);
    expect(result).toHaveLength(1);
    expect(result[0].file).toBe("src/index.ts");
    expect(result[0].additions).toBe(2);
    expect(result[0].deletions).toBe(1);
  });

  it("parses multiple file diffs", () => {
    const diff = `diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -1 +1 @@
-old
+new
diff --git a/b.ts b/b.ts
--- a/b.ts
+++ b/b.ts
@@ -1 +1,2 @@
 hello
+world`;

    const result = parseDiff(diff);
    expect(result).toHaveLength(2);
    expect(result[0].file).toBe("a.ts");
    expect(result[1].file).toBe("b.ts");
  });

  it("counts additions and deletions correctly", () => {
    const diff = `diff --git a/test.ts b/test.ts
--- a/test.ts
+++ b/test.ts
@@ -1,5 +1,6 @@
 line1
+added1
+added2
 line3
-removed1
+replaced
 line5`;

    const result = parseDiff(diff);
    expect(result[0].additions).toBe(3);
    expect(result[0].deletions).toBe(1);
  });
});
