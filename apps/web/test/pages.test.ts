import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Permission, Role } from "@repo/types";
import { bearer, Fixtures, hasDb, type TestUser } from "./harness";
import { runInRequestScope } from "./request-context";

// Ekran testleri.
//
// Rota işleyicileri Adım 47'den beri test altındaydı; **ekranlar** değildi ve
// `requirePage` yönlendirmeleri elle doğrulanıyordu. Bir sayfanın kapısı
// yanlış açıldığında hiçbir şey kırılmıyor — sayfa açılıyor, ve bunu yalnızca
// oraya girmemesi gereken kişi fark ediyor.
//
// Test **sayfa fonksiyonunu çağırıyor**, JSX ağacını çizmiyor. İki şey birden
// sınanıyor ve ikisi de bu çağrıda:
//
//  1. **Kapı.** `requirePage` yanlış rolde ve eksik izinde `redirect()`
//     çağırıyor; `redirect` özel bir hata fırlatıyor ve hedef adres onun
//     `digest`inde duruyor. Testin okuduğu şey o.
//  2. **Sunucu tarafı veri çekme.** Sayfa fonksiyonu `await` ediyor: bozuk bir
//     sorgu, eksik bir alan ya da düşen bir servis burada patlıyor. Ağacı
//     çizmeye gerek yok, çünkü çizim istemcide oluyor.
//
// Tarayıcı seviyesinde e2e ayrı bir dosyada (`e2e.test.ts`): orada asıl soru
// "sayfa gerçekten boyanıyor mu".

const suite = hasDb ? describe : describe.skip;
const fx = new Fixtures("page");

/** `redirect()`in fırlattığı hatadan hedef adresi çıkarır. */
function redirectTarget(error: unknown): string | null {
  const digest = (error as { digest?: string } | null)?.digest;
  if (typeof digest !== "string" || !digest.startsWith("NEXT_REDIRECT")) {
    return null;
  }
  // "NEXT_REDIRECT;replace;/login;307;"
  return digest.split(";")[2] ?? null;
}

/**
 * Sayfayı bir kullanıcının kimliğiyle çağırır.
 *
 * Dönüş: yönlendirildiyse hedef adres, açıldıysa `null`. Sayfanın attığı
 * *başka* bir hata olduğu gibi yükseliyor — onu yutmak, kapıyı sınarken
 * sayfanın çöktüğünü gizlerdi.
 */
async function visit(
  page: (props: never) => Promise<unknown>,
  user: TestUser | null,
  props: Record<string, unknown> = {},
): Promise<string | null> {
  const headers = new Headers({ "user-agent": "vitest-page-suite" });
  if (user) headers.set("authorization", `Bearer ${await bearer(user)}`);

  return runInRequestScope({ headers, session: null }, async () => {
    try {
      await page(props as never);
      return null;
    } catch (e) {
      const target = redirectTarget(e);
      if (target === null) throw e;
      return target;
    }
  });
}

// ── kayıt defteri ───────────────────────────────────────────────────────────
//
// Her satır bir ekran. Kapının kendisi sayfanın içinde yazılı; buradaki liste
// onun *beklentisi* ve ikisi ayrıştığında test kırılıyor.

interface PageCase {
  name: string;
  load: () => Promise<{ default: (props: never) => Promise<unknown> }>;
  /** Ekranı açan izin; yoksa yalnızca rol kapısı var. */
  permission?: Permission;
  /** Bu ekranın açık olduğu rol. */
  role: Role;
  props?: Record<string, unknown>;
}

const PAGES: PageCase[] = [
  {
    name: "/admin",
    load: () => import("@/app/admin/page"),
    role: "SUPER_ADMIN",
  },
  {
    name: "/admin/products",
    load: () => import("@/app/admin/products/page"),
    permission: "products.view",
    role: "SUPER_ADMIN",
  },
  {
    // Kapı `products.view`: kategoriyi *görmek* katalogu görmenin parçası.
    // Düzenleme `categories.manage` istiyor ve ekran artık izni okuyup
    // kontrolleri ona göre çiziyor (§4.11) — yani okuma izniyle giren kişi
    // yapamayacağı bir düğmeye basmıyor.
    name: "/admin/categories",
    load: () => import("@/app/admin/categories/page"),
    permission: "products.view",
    role: "SUPER_ADMIN",
  },
  {
    name: "/admin/companies",
    load: () => import("@/app/admin/companies/page"),
    permission: "companies.view",
    role: "SUPER_ADMIN",
  },
  {
    name: "/admin/users",
    load: () => import("@/app/admin/users/page"),
    permission: "users.manage",
    role: "SUPER_ADMIN",
  },
  {
    name: "/admin/kasa",
    load: () => import("@/app/admin/kasa/page"),
    permission: "cash.view",
    role: "SUPER_ADMIN",
  },
  {
    name: "/admin/cekler",
    load: () => import("@/app/admin/cekler/page"),
    permission: "cheques.manage",
    role: "SUPER_ADMIN",
  },
  {
    name: "/admin/stok",
    load: () => import("@/app/admin/stok/page"),
    permission: "stock.view",
    role: "SUPER_ADMIN",
  },
  {
    // Plasiyere de açık: iade talebini sahada karara bağlayan o.
    name: "/admin/iadeler",
    load: () => import("@/app/admin/iadeler/page"),
    permission: "returns.manage",
    role: "SUPER_ADMIN",
  },
  {
    name: "/admin/audit",
    load: () => import("@/app/admin/audit/page"),
    permission: "audit.view",
    role: "SUPER_ADMIN",
  },
  {
    name: "/admin/activity",
    load: () => import("@/app/admin/activity/page"),
    permission: "activity.view",
    role: "SUPER_ADMIN",
  },
  {
    name: "/admin/reports",
    load: () => import("@/app/admin/reports/page"),
    permission: "reports.view",
    role: "SUPER_ADMIN",
  },
  {
    name: "/admin/analitik",
    load: () => import("@/app/admin/analitik/page"),
    permission: "analytics.view",
    role: "SUPER_ADMIN",
  },
  {
    name: "/admin/toplu-guncelleme",
    load: () => import("@/app/admin/toplu-guncelleme/page"),
    permission: "pricing.manage",
    role: "SUPER_ADMIN",
  },
  {
    name: "/admin/promotions",
    load: () => import("@/app/admin/promotions/page"),
    permission: "promotions.manage",
    role: "SUPER_ADMIN",
  },
  {
    name: "/admin/announcements",
    load: () => import("@/app/admin/announcements/page"),
    permission: "announcements.manage",
    role: "SUPER_ADMIN",
  },
  {
    name: "/admin/jobs",
    load: () => import("@/app/admin/jobs/page"),
    permission: "jobs.manage",
    role: "SUPER_ADMIN",
  },
  {
    name: "/admin/targets",
    load: () => import("@/app/admin/targets/page"),
    permission: "targets.manage",
    role: "SUPER_ADMIN",
  },
  {
    name: "/admin/deliveries",
    load: () => import("@/app/admin/deliveries/page"),
    permission: "orders.fulfil",
    role: "SUPER_ADMIN",
  },
  {
    name: "/admin/basvurular",
    load: () => import("@/app/admin/basvurular/page"),
    permission: "applications.manage",
    role: "SUPER_ADMIN",
  },
  {
    name: "/admin/prim",
    load: () => import("@/app/admin/prim/page"),
    permission: "commission.manage",
    role: "SUPER_ADMIN",
  },
  {
    name: "/admin/mutabakat",
    load: () => import("@/app/admin/mutabakat/page"),
    permission: "reconciliation.manage",
    role: "SUPER_ADMIN",
  },
  {
    name: "/admin/siparis-kurallari",
    load: () => import("@/app/admin/siparis-kurallari/page"),
    permission: "order_policy.manage",
    role: "SUPER_ADMIN",
  },
  {
    name: "/reports",
    load: () => import("@/app/reports/page"),
    permission: "reports.build",
    role: "SUPER_ADMIN",
  },
  {
    name: "/reports/new",
    load: () => import("@/app/reports/new/page"),
    permission: "reports.build",
    role: "SUPER_ADMIN",
  },
  {
    name: "/reports/dashboards",
    load: () => import("@/app/reports/dashboards/page"),
    permission: "reports.build",
    role: "SUPER_ADMIN",
  },
  {
    // Sayfa değil **layout**: sipariş detayının kabuğu (§4.7). Kayıt defterine
    // girmesinin sebebi kapı — kabuk `requirePage` çağırıyor ve o çağrı
    // sayfanınkinden gevşek olursa, ekranı açan kişi menüyü görüp içeriği
    // göremiyor. Dört soru layout'a da aynen soruluyor.
    //
    // `children` verilmesi gerekiyor ama içeriği önemsiz: layout JSX döndürüyor,
    // ağaç burada çizilmiyor.
    name: "/orders (kabuk)",
    load: () => import("@/app/orders/layout"),
    permission: "orders.view",
    role: "SUPER_ADMIN",
    props: { children: null },
  },
  {
    name: "/rep",
    load: () => import("@/app/rep/page"),
    role: "SALES_REP",
  },
  {
    name: "/rep/ziyaret",
    load: () => import("@/app/rep/ziyaret/page"),
    permission: "visits.manage",
    role: "SALES_REP",
    props: { searchParams: {} },
  },
  {
    name: "/rep/tahsilat",
    load: () => import("@/app/rep/tahsilat/page"),
    permission: "cash.manage",
    role: "SALES_REP",
    props: { searchParams: {} },
  },
  {
    name: "/kurye",
    load: () => import("@/app/kurye/page"),
    permission: "delivery.confirm",
    role: "COURIER",
  },
  {
    name: "/hesabim",
    load: () => import("@/app/hesabim/page"),
    role: "SUPER_ADMIN",
  },
];

suite("ekranlar: kapı ve sunucu tarafı", () => {
  let outsider: TestUser;

  beforeAll(async () => {
    // Yanlış rol: bayi personeli. Yönetim ve saha ekranlarının hiçbirine
    // giremez ve kendi kökÜne yollanır.
    outsider = await fx.user("COMPANY_STAFF");
  });

  afterAll(() => fx.teardown());

  describe("yetkili kullanıcı için açılıyor", () => {
    for (const page of PAGES) {
      it(page.name, async () => {
        const user = await fx.user(page.role, {
          label: `ok-${page.name.replace(/\W+/g, "")}`,
        });
        const { default: component } = await page.load();
        const target = await visit(component, user, page.props);
        expect(target).toBeNull();
      });
    }
  });

  describe("izin yoksa /403'e gidiyor", () => {
    for (const page of PAGES.filter((p) => p.permission)) {
      it(page.name, async () => {
        // Rolü doğru, izni yok: kapı "kendi köküne" değil "yetki yok"a
        // yolluyor — menüden tıklayan kişi sebebini görmeli.
        const user = await fx.user(page.role, {
          permissions: [],
          label: `noperm-${page.name.replace(/\W+/g, "")}`,
        });
        const { default: component } = await page.load();
        const target = await visit(component, user, page.props);
        expect(target).toBe(`/403?perm=${page.permission}`);
      });
    }
  });

  describe("yanlış rol kendi köküne dönüyor", () => {
    for (const page of PAGES.filter((p) => p.role !== "COMPANY_STAFF")) {
      it(page.name, async () => {
        const { default: component } = await page.load();
        const target = await visit(component, outsider, page.props);
        // `/hesabim` her role açık; onun dışındakiler bayi personelini portala
        // geri yolluyor. Tarayıcıda bu yönlendirmeyi ara katman yapıyor
        // (sayfaya hiç gelinmiyor) — ikisi aynı yere gidiyor ve `e2e.mjs`
        // bunu ayrıca sınıyor.
        // `/hesabim` her role açık; sipariş kabuğu da bayi personeline açık
        // (siparişi veren firma onun firması). Gerisi portala geri yolluyor.
        if (page.name === "/hesabim" || page.name === "/orders (kabuk)") {
          expect(target).toBeNull();
        } else expect(target).toBe("/portal");
      });
    }
  });

  describe("oturumsuz ziyaretçi girişe gidiyor", () => {
    for (const page of PAGES) {
      it(page.name, async () => {
        const { default: component } = await page.load();
        const target = await visit(component, null, page.props);
        expect(target).toBe("/login");
      });
    }
  });
});
