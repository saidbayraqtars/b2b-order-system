import { describe, expect, it } from "vitest";
import { DATASETS, type DatasetDef } from "./report-registry";

// The registry is the security boundary *and* the join declaration. A field
// whose path reaches through a relation nobody declared compiles fine and then
// fails the first time someone groups by it — in production, on a Friday. These
// checks are cheap and catch it at commit time.

function prefixesOf(path: string): string[] {
  const segments = path.split(".");
  segments.pop(); // the column itself
  return segments.map((_, i) => segments.slice(0, i + 1).join("."));
}

describe("dataset registry", () => {
  const entries = Object.entries(DATASETS) as Array<[string, DatasetDef]>;

  it.each(entries)("%s declares a join for every relation a field uses", (_, ds) => {
    const declared = new Set(ds.sql.joins.map((j) => j.prefix));
    const missing = new Set<string>();

    for (const field of Object.values(ds.fields)) {
      for (const prefix of prefixesOf(field.path)) {
        if (!declared.has(prefix)) missing.add(prefix);
      }
    }
    expect([...missing]).toEqual([]);
  });

  it.each(entries)("%s declares a join for every relation its scope uses", (_, ds) => {
    const declared = new Set(ds.sql.joins.map((j) => j.prefix));
    const roles = ["SUPER_ADMIN", "SALES_REP", "COMPANY_ADMIN", "COMPANY_STAFF"] as const;

    for (const role of roles) {
      const scope = ds.scope({ userId: "u1", role, companyId: "c1" });
      // Scopes are one level of nesting at most today; walk anyway.
      const walk = (obj: Record<string, unknown>, prefix: string) => {
        for (const [key, value] of Object.entries(obj)) {
          const path = prefix ? `${prefix}.${key}` : key;
          if (value && typeof value === "object" && !Array.isArray(value)) {
            expect(declared.has(path)).toBe(true);
            walk(value as Record<string, unknown>, path);
          }
        }
      };
      walk(scope, "");
    }
  });

  it.each(entries)("%s gives every join a unique alias", (_, ds) => {
    const aliases = [ds.sql.alias, ...ds.sql.joins.map((j) => j.alias)];
    expect(new Set(aliases).size).toBe(aliases.length);
  });

  it.each(entries)("%s orders joins so each one's parent comes first", (_, ds) => {
    const seen = new Set<string>();
    for (const join of ds.sql.joins) {
      const parent = join.prefix.split(".").slice(0, -1).join(".");
      // A join on "order.company" cannot precede the join on "order": its ON
      // clause names an alias that would not exist yet.
      if (parent !== "") expect(seen.has(parent)).toBe(true);
      seen.add(join.prefix);
    }
  });

  it.each(entries)("%s never lets a field name reach the database", (_, ds) => {
    // Paths are ours; this guards against a typo turning into an injection
    // surface if someone ever wires a field key straight through.
    for (const [key, field] of Object.entries(ds.fields)) {
      expect(key).toMatch(/^[A-Za-z][A-Za-z0-9_]*$/);
      expect(field.path).toMatch(/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)*$/);
    }
  });
});
