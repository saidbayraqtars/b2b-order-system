import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  PERMISSION_SCOPE,
  PERMISSIONS,
  ROLE_DEFAULT_PERMISSIONS,
  defaultPermissionsFor,
  grantablePermissionsFor,
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  isPermissionGrantableTo,
  outOfScopePermissions,
  sanitizePermissions,
  type Permission,
  type Role,
} from "@repo/types";

// Yetki kayıt defterinin bütünlüğü.
//
// Bu testler iş kuralı denemiyor; kayıt defterinin *kendisiyle tutarlı* kalmasını
// koruyor. Yeni bir izin eklerken etiketini yazmayı ya da bir gruba koymayı
// unutmak, ekranda adsız/görünmez bir yetki üretir — çalışma zamanında sessizce.

const ROLES: Role[] = [
  "SUPER_ADMIN",
  "COMPANY_ADMIN",
  "COMPANY_STAFF",
  "SALES_REP",
  "COURIER",
];

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

describe("kapsam — hangi izin hangi hesap tipine verilebilir", () => {
  it("her iznin en az bir hesap tipi var", () => {
    const bosluk = PERMISSIONS.filter((p) => PERMISSION_SCOPE[p].length === 0);
    expect(bosluk).toEqual([]);
  });

  it("satıcıya ait yetkiler bayi ve sahaya kapalı", () => {
    // Bu liste bilinçli: müşteri hesabına verildiğinde satıcının kendi
    // işleyişini (katalog, fiyat, sistem, denetim, sevkiyat) açan izinler.
    const sadeceSatici: Permission[] = [
      "products.manage",
      "categories.manage",
      "pricing.manage",
      "promotions.manage",
      "companies.manage",
      "groups.manage",
      "orders.fulfil",
      "payment_terms.manage",
      "volume_tiers.manage",
      "payments.view",
      "documents.manage",
      "organization.manage",
      "erp.manage",
      "announcements.manage",
      "audit.view",
      "audit.manage",
      "targets.manage",
      "labels.manage",
    ];
    for (const p of sadeceSatici) {
      expect(PERMISSION_SCOPE[p], p).toEqual(["SELLER"]);
      expect(isPermissionGrantableTo(p, "COMPANY_ADMIN"), p).toBe(false);
      expect(isPermissionGrantableTo(p, "COMPANY_STAFF"), p).toBe(false);
      expect(isPermissionGrantableTo(p, "SALES_REP"), p).toBe(false);
      expect(isPermissionGrantableTo(p, "COURIER"), p).toBe(false);
    }
  });

  it("kurye kapsamı yalnızca teslimatla ilgili", () => {
    // Kuryenin eline müşteri fiyatı, kasa ya da sipariş girme yetkisi
    // geçmemeli: taşıdığı işi görsün ve teslim etsin, o kadar.
    const kurye = grantablePermissionsFor("COURIER");
    expect(kurye.sort()).toEqual(
      ["orders.view", "documents.view", "delivery.confirm"].sort(),
    );
    expect(isPermissionGrantableTo("delivery.confirm", "SALES_REP")).toBe(false);
    expect(isPermissionGrantableTo("delivery.confirm", "COMPANY_ADMIN")).toBe(false);
  });

  it("kasa bayiye kapalı, sahaya açık", () => {
    // Plasiyer tahsilat işliyor; bayi satıcının kasasını hiç görmemeli.
    for (const p of ["cash.view", "cash.manage"] as Permission[]) {
      expect(isPermissionGrantableTo(p, "SALES_REP"), p).toBe(true);
      expect(isPermissionGrantableTo(p, "COMPANY_ADMIN"), p).toBe(false);
    }
  });

  it("rol şablonları kendi kapsamının dışına çıkmaz", () => {
    // Şablon kapsamı aşarsa hesap açılışında sunucu kendi verdiği kümeyi
    // reddederdi — form da, seed de kullanılamaz hâle gelirdi.
    for (const role of ROLES) {
      expect(outOfScopePermissions(defaultPermissionsFor(role), role), role).toEqual([]);
    }
  });

  it("süper adminin kapsamı her izni içerir", () => {
    expect(grantablePermissionsFor("SUPER_ADMIN").sort()).toEqual([...PERMISSIONS].sort());
  });

  it("bayi kapsamı sahadan farklı", () => {
    const bayi = grantablePermissionsFor("COMPANY_ADMIN");
    const saha = grantablePermissionsFor("SALES_REP");
    expect(bayi).toContain("users.manage");
    expect(bayi).not.toContain("visits.manage");
    expect(saha).toContain("visits.manage");
    expect(saha).not.toContain("users.manage");
  });

  it("outOfScopePermissions yalnızca ihlalleri döner", () => {
    expect(
      outOfScopePermissions(["orders.view", "organization.manage"], "COMPANY_STAFF"),
    ).toEqual(["organization.manage"]);
    expect(outOfScopePermissions(["orders.view"], "COMPANY_STAFF")).toEqual([]);
  });
});

describe("migration backfill", () => {
  it("süper admine yazılan izinler kayıt defteriyle aynı", () => {
    // Backfill mevcut kurulumları yükseltirken yetkiyi koruyan tek yer. Kayıt
    // defterine izin eklenip migration yazılmazsa, yükselten müşteride o yetki
    // kimsede olmaz ve kimse geri veremez (kendinde olmayan izin verilemiyor).
    //
    // Tek bir dosyaya değil, **tüm** migration'lara bakılıyor: ilk sürümdeki
    // liste dondu, sonradan eklenen her izin kendi migration'ında geliyor.
    // Birleşimleri kayıt defterinin tamamını vermeli.
    const dir = path.join(__dirname, "../../database/prisma/migrations");
    const yazili = new Set<string>();

    for (const name of readdirSync(dir)) {
      const file = path.join(dir, name, "migration.sql");
      if (!existsSync(file)) continue;
      const sql = readFileSync(file, "utf8");
      // Yalnızca süper admine yazan ifadeler sayılır.
      for (const stmt of sql.split(";")) {
        if (!stmt.includes(`"role" = 'SUPER_ADMIN'`)) continue;
        for (const m of stmt.matchAll(/'([a-z_]+\.[a-z_]+)'/g)) {
          if (m[1]) yazili.add(m[1]);
        }
      }
    }

    expect([...yazili].sort()).toEqual([...PERMISSIONS].sort());
  });
});
