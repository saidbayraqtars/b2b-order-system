import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  brandingUrl,
  clearTenantCache,
  loadTenant,
  readBrandingAsset,
  TenantConfigError,
} from "./tenant";

// What this file is really testing is a refusal: an installation that does not
// know who it is must not print a document. Every "throws" case here is a
// legally invalid invoice that never gets printed.

const VALID = {
  slug: "acme",
  seller: {
    legalName: "Acme Toptan A.Ş.",
    taxOffice: "Kadıköy",
    taxNumber: "1234567890",
    address: { line1: "Bağdat Cad. No:1", city: "İstanbul" },
    bankAccounts: [{ label: "Ziraat", iban: "TR33 0006 1005 1978 6457 8413 26" }],
  },
  branding: { logo: "branding/logo.svg" },
};

let dir: string;
const originalEnv = process.env.TENANT_DIR;

async function writeConfig(config: unknown): Promise<void> {
  await writeFile(path.join(dir, "tenant.json"), JSON.stringify(config), "utf8");
  clearTenantCache();
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "tenant-"));
  process.env.TENANT_DIR = dir;
  clearTenantCache();
});

afterEach(async () => {
  process.env.TENANT_DIR = originalEnv;
  clearTenantCache();
  await rm(dir, { recursive: true, force: true });
});

describe("loadTenant", () => {
  it("reads a complete folder", async () => {
    await writeConfig(VALID);
    const t = await loadTenant();
    expect(t.seller.legalName).toBe("Acme Toptan A.Ş.");
    expect(t.seller.address.country).toBe("Türkiye"); // defaulted, not demanded
  });

  it("strips the spaces people type into an IBAN", async () => {
    await writeConfig(VALID);
    const t = await loadTenant();
    expect(t.seller.bankAccounts[0]!.iban).toBe("TR330006100519786457841326");
  });

  it("refuses when TENANT_DIR is not set", async () => {
    delete process.env.TENANT_DIR;
    await expect(loadTenant()).rejects.toBeInstanceOf(TenantConfigError);
  });

  it("names the missing file rather than failing vaguely", async () => {
    await expect(loadTenant()).rejects.toThrow(/tenant\.json/);
  });

  it("refuses a seller with no tax number", async () => {
    const { taxNumber, ...rest } = VALID.seller;
    void taxNumber;
    await writeConfig({ ...VALID, seller: rest });
    await expect(loadTenant()).rejects.toThrow(/seller\.taxNumber/);
  });

  it("refuses a tax number that is not 10 or 11 digits", async () => {
    await writeConfig({
      ...VALID,
      seller: { ...VALID.seller, taxNumber: "12345" },
    });
    await expect(loadTenant()).rejects.toThrow(/VKN 10, TCKN 11/);
  });

  it("lists every problem at once so one edit fixes the file", async () => {
    await writeConfig({
      slug: "acme",
      seller: { legalName: "", taxOffice: "", taxNumber: "abc", address: { line1: "", city: "" } },
    });
    const err = await loadTenant().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TenantConfigError);
    const message = (err as Error).message;
    for (const field of ["legalName", "taxOffice", "taxNumber", "line1", "city"]) {
      expect(message).toContain(field);
    }
  });

  it("reports broken JSON as broken JSON", async () => {
    await writeFile(path.join(dir, "tenant.json"), "{ not json", "utf8");
    clearTenantCache();
    await expect(loadTenant()).rejects.toThrow(/geçerli JSON değil/);
  });

  it("picks up an edit without a restart", async () => {
    await writeConfig(VALID);
    expect((await loadTenant()).seller.legalName).toBe("Acme Toptan A.Ş.");

    // Same process, no cache clear: the mtime is what invalidates it, which is
    // what makes "edit the file, refresh the page" the whole editing loop.
    await new Promise((r) => setTimeout(r, 12));
    await writeFile(
      path.join(dir, "tenant.json"),
      JSON.stringify({
        ...VALID,
        seller: { ...VALID.seller, legalName: "Yeni Unvan A.Ş." },
      }),
      "utf8",
    );
    expect((await loadTenant()).seller.legalName).toBe("Yeni Unvan A.Ş.");
  });
});

describe("readBrandingAsset", () => {
  beforeEach(async () => {
    await mkdir(path.join(dir, "branding"), { recursive: true });
    await writeFile(path.join(dir, "branding", "logo.svg"), "<svg/>", "utf8");
    await writeFile(path.join(dir, "secret.txt"), "gizli", "utf8");
  });

  it("serves a logo from the branding folder", async () => {
    const asset = await readBrandingAsset(["logo.svg"]);
    expect(asset?.mime).toBe("image/svg+xml");
    expect(asset?.data.toString()).toBe("<svg/>");
  });

  it("refuses to climb out of the branding folder", async () => {
    // The path comes off a URL, so this is the attack, not a typo.
    expect(await readBrandingAsset(["..", "secret.txt"])).toBeNull();
    expect(await readBrandingAsset(["..", "tenant.json"])).toBeNull();
  });

  it("serves only what a browser renders as a mark", async () => {
    await writeFile(path.join(dir, "branding", "notes.txt"), "x", "utf8");
    expect(await readBrandingAsset(["notes.txt"])).toBeNull();
  });

  it("returns null for a logo that is not there", async () => {
    expect(await readBrandingAsset(["yok.png"])).toBeNull();
  });
});

describe("brandingUrl", () => {
  it("turns a folder-relative path into a route", () => {
    // Written as it looks in the folder; served from the branding subtree.
    expect(brandingUrl("branding/logo.svg")).toBe("/api/branding/logo.svg");
    expect(brandingUrl("logo.svg")).toBe("/api/branding/logo.svg");
  });

  it("has nothing to show when no logo is configured", () => {
    expect(brandingUrl(undefined)).toBeNull();
  });

  it("refuses a traversal written into the config file", () => {
    expect(brandingUrl("../tenant.json")).toBeNull();
  });
});
