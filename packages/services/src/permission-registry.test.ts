import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  PERMISSIONS,
  ROLE_DEFAULT_PERMISSIONS,
  defaultPermissionsFor,
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  sanitizePermissions,
  type Permission,
  type Role,
} from "@repo/types";

// Yetki kayıt defterinin bütünlüğü.
//
// Bu testler iş kuralı denemiyor; kayıt defterinin *kendisiyle tutarlı* kalmasını
// koruyor. Yeni bir izin eklerken etiketini yazmayı ya da bir gruba koymayı
// unutmak, ekranda adsız/görünmez bir yetki üretir — çalışma zamanında sessizce.

const ROLES: Role[] = ["SUPER_ADMIN", "COMPANY_ADMIN", "COMPANY_STAFF", "SALES_REP"];

describe("yetki kayıt defteri", () => {
  it("her iznin görünür bir adı var", () => {
    const eksik = PERMISSIONS.filter((p) => !PERMISSION_LABELS[p]);
    expect(eksik).toEqual([]);
  });

  it("her izin tam olarak bir grupta", () => {
    const sayim = new Map<string, number>();
    for (const group of PERMISSION_GROUPS) {
      for (const p of group.permissions) {
        sayim.set(p, (sayim.get(p) ?? 0) + 1);
      }
    }
    // Gruplanmamış izin onay ekranında hiç görünmez; iki grupta olan iki kez.
    expect(PERMISSIONS.filter((p) => sayim.get(p) !== 1)).toEqual([]);
    expect([...sayim.keys()].filter((p) => !PERMISSIONS.includes(p as Permission))).toEqual([]);
  });

  it("rol şablonları yalnızca bilinen izinlerden oluşur", () => {
    for (const role of ROLES) {
      const bilinmeyen = ROLE_DEFAULT_PERMISSIONS[role].filter(
        (p) => !PERMISSIONS.includes(p),
      );
      expect(bilinmeyen, role).toEqual([]);
    }
  });

  it("süper admin şablonu tüm izinleri kapsar", () => {
    // Yeni bir izin eklenip şablona girmezse kurulumu devralan kişi onu
    // kendisine de veremez: kendinde olmayanı veremiyor (assertMayGrant).
    expect([...ROLE_DEFAULT_PERMISSIONS.SUPER_ADMIN].sort()).toEqual(
      [...PERMISSIONS].sort(),
    );
  });

  it("alıcı personeli yönetim yetkisi taşımaz", () => {
    const staff = defaultPermissionsFor("COMPANY_STAFF");
    expect(staff).not.toContain("users.manage");
    expect(staff).not.toContain("pricing.manage");
    expect(staff).not.toContain("cash.manage");
  });
});

describe("sanitizePermissions", () => {
  it("bilinmeyen anahtarları atar", () => {
    expect(sanitizePermissions(["orders.view", "kasa.hepsi", ""])).toEqual([
      "orders.view",
    ]);
  });

  it("tekrarı siler ve sıralar", () => {
    expect(
      sanitizePermissions(["orders.view", "cash.view", "orders.view"]),
    ).toEqual(["cash.view", "orders.view"]);
  });
});

describe("izin kontrolü", () => {
  it("rol devreye girmez — yalnızca kayıtlı küme sayılır", () => {
    // Süper admin de izinlere tabi; kontrol yalnızca diziye bakar.
    expect(hasPermission([], "cash.view")).toBe(false);
    expect(hasPermission(["cash.view"], "cash.view")).toBe(true);
  });

  it("boş/eksik küme her zaman ret", () => {
    expect(hasPermission(null, "orders.view")).toBe(false);
    expect(hasPermission(undefined, "orders.view")).toBe(false);
  });

  it("hepsi/en az biri ayrımı", () => {
    const own: Permission[] = ["orders.view", "cash.view"];
    expect(hasAllPermissions(own, ["orders.view", "cash.view"])).toBe(true);
    expect(hasAllPermissions(own, ["orders.view", "cash.manage"])).toBe(false);
    expect(hasAnyPermission(own, ["cash.manage", "cash.view"])).toBe(true);
    expect(hasAnyPermission(own, ["cash.manage"])).toBe(false);
  });
});

describe("migration backfill", () => {
  it("süper admin listesi kayıt defteriyle aynı", () => {
    // Backfill mevcut kurulumları yükseltirken yetkiyi koruyan tek yer. Kayıt
    // defterine izin eklenip buraya eklenmezse, yükselten müşteride o yetki
    // kimsede olmaz ve kimse geri veremez.
    const sql = readFileSync(
      path.join(
        __dirname,
        "../../database/prisma/migrations/20260807090000_user_permissions/migration.sql",
      ),
      "utf8",
    );
    const blok = sql.split("WHERE \"role\" = 'SUPER_ADMIN'")[0];
    const yazili = [...blok.matchAll(/'([a-z_]+\.[a-z_]+)'/g)].map((m) => m[1]);
    expect(yazili.sort()).toEqual([...PERMISSIONS].sort());
  });
});
