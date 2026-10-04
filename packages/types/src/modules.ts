import { z } from "zod";
import type { Permission } from "./permission";

// Modüller — kurulum başına açılıp kapanan özellik kümeleri.
//
// Sistem tek başına satılıyor ve her müşteri her şeyi kullanmıyor: çek
// almayan bir toptancının menüsünde "Çek & senet", kurye çalıştırmayanın
// menüsünde "Dağıtım" durmamalı. Modül kapatmak **veriyi silmez**, yalnızca
// ekranları ve uçları kapatır; yeniden açıldığında her şey yerinde.
//
// Mekanizma tek yerde: bir modülün **kendine ait** izinleri, modül kapalıyken
// herkesin etkin izin kümesinden düşülür (`effectivePermissions`). Menü, sayfa
// kapısı, API kapısı ve mobil gezinme zaten izinle çalıştığı için hepsi
// kendiliğinden uyar; her ekrana ayrı `if` yazılmaz.
//
// İki modül yalnızca ekran değil **hesap** da değiştirir: kampanya ve hacim
// iskontosu kapalıyken fiyatlama onları uygulamaz. Aksi hâlde menüden
// kaybolan bir kampanya sepette indirim yapmaya devam ederdi.
//
// Bir modüle yalnızca o modüle ait izin yazılır. `orders.fulfil` gibi
// paylaşılan bir izin buraya girerse modülü kapatmak sevkiyatı ve faturayı da
// kapatırdı; böyle ekranlar `paths` ile ayrıca kapatılıyor.

export const ModuleKeyEnum = z.enum([
  "kampanya",
  "hacim",
  "saha",
  "hedef",
  "prim",
  "teslimat",
  "iade",
  "cek",
  "mutabakat",
  "kart",
  "rapor_tasarimci",
  "analitik",
  "erp",
  "basvuru",
  "etiket",
  "duyuru",
]);
export type ModuleKey = z.infer<typeof ModuleKeyEnum>;

export interface ModuleDef {
  label: string;
  description: string;
  /** Yalnızca bu modüle ait izinler. Modül kapalıyken kimsede etkin değil. */
  permissions: readonly Permission[];
  /**
   * İzinle kapanamayan sayfalar (paylaşılan izinle açılanlar). Sayfa kapısı
   * ve menü bunlara ayrıca bakar.
   */
  paths?: readonly string[];
  /** Kapalıyken fiyat hesabı da değişir — ekranda ayrıca söylenir. */
  affectsPricing?: boolean;
}

export const MODULES: Record<ModuleKey, ModuleDef> = {
  kampanya: {
    label: "Kampanyalar",
    description: "Kupon, sepet ve ürün kampanyaları. Kapalıyken hiçbir kampanya uygulanmaz.",
    permissions: ["promotions.manage"],
    affectsPricing: true,
  },
  hacim: {
    label: "Hacim iskontosu",
    description: "Ciroya göre basamaklı iskonto. Kapalıyken hiçbir firma basamak iskontosu almaz.",
    permissions: ["volume_tiers.manage"],
    affectsPricing: true,
  },
  saha: {
    label: "Saha ziyareti",
    description: "Plasiyerin ziyaret açıp kapatması, ziyaret çağrıları ve harita.",
    permissions: ["visits.manage"],
    // Müşterinin "ziyaret isteyin" ekranı `companies.view` ile açılıyor.
    paths: ["/portal/ziyaret"],
  },
  hedef: {
    label: "Satış hedefleri",
    description: "Temsilci başına dönemlik hedef ve gerçekleşme.",
    permissions: ["targets.manage"],
  },
  prim: {
    label: "Prim / hakediş",
    description: "Temsilci prim planları ve hakediş hesabı.",
    permissions: ["commission.manage"],
  },
  teslimat: {
    label: "Kurye ile teslimat",
    description: "Kurye ataması, teslim onayı ve dağıtım ekranı.",
    permissions: ["delivery.confirm"],
    paths: ["/admin/deliveries", "/kurye"],
  },
  iade: {
    label: "İadeler",
    description: "Müşterinin iade talebi ve satıcının teslim alması.",
    permissions: ["returns.manage"],
  },
  cek: {
    label: "Çek & senet",
    description: "Kâğıt portföyü: tahsile verme, ciro, karşılıksız.",
    permissions: ["cheques.manage"],
  },
  mutabakat: {
    label: "Cari mutabakat",
    description: "Dönemlik mutabakat mektubu ve müşteri yanıtı.",
    permissions: ["reconciliation.manage"],
  },
  kart: {
    label: "Kart tahsilatları",
    description: "Sanal POS ve elden POS ile kart tahsilatı listesi.",
    permissions: ["payments.view"],
  },
  rapor_tasarimci: {
    label: "Rapor tasarımcısı",
    description: "Kullanıcının kendi raporunu kurması ve zamanlaması.",
    permissions: ["reports.build"],
  },
  analitik: {
    label: "Yönetici panosu",
    description: "Kârlılık, kohort, RFM ve ay sonu tahmini.",
    permissions: ["analytics.view"],
  },
  erp: {
    label: "ERP köprüsü",
    description: "Müşterinin ERP'sinden cari/stok/fiyat eşitleme ve sipariş aktarımı.",
    permissions: ["erp.manage", "erp.push"],
  },
  basvuru: {
    label: "Bayilik başvurusu",
    description: "Giriş ekranındaki \"bayi olun\" formu ve başvuruların onayı.",
    permissions: ["applications.manage"],
    paths: ["/kayit"],
  },
  etiket: {
    label: "Etiket & fiş tasarımı",
    description: "Kargo etiketi ve 80 mm fiş şablonları.",
    permissions: ["labels.manage"],
  },
  duyuru: {
    label: "Duyurular",
    description: "Portalda ve mobilde gösterilen duyurular.",
    permissions: ["announcements.manage"],
  },
};

export const MODULE_KEYS = ModuleKeyEnum.options;

/** Kapalı modüllerin izinleri. */
export function disabledPermissions(disabled: Iterable<ModuleKey>): Set<Permission> {
  const out = new Set<Permission>();
  for (const key of disabled) for (const p of MODULES[key].permissions) out.add(p);
  return out;
}

/** Kullanıcının izinleri, kapalı modüllerinkiler düşülmüş. */
export function effectivePermissions(
  permissions: readonly Permission[],
  disabled: Iterable<ModuleKey>,
): Permission[] {
  const off = disabledPermissions(disabled);
  return off.size === 0 ? [...permissions] : permissions.filter((p) => !off.has(p));
}

/** Bu izin hangi modülün? Paylaşılan izinler hiçbir modülün değildir. */
export function moduleOfPermission(permission: Permission): ModuleKey | null {
  for (const key of MODULE_KEYS) {
    if (MODULES[key].permissions.includes(permission)) return key;
  }
  return null;
}

/** Bu yol (ve alt yolları) bir modüle mi bağlı? */
export function moduleOfPath(pathname: string): ModuleKey | null {
  for (const key of MODULE_KEYS) {
    for (const p of MODULES[key].paths ?? []) {
      if (pathname === p || pathname.startsWith(`${p}/`)) return key;
    }
  }
  return null;
}

export const setModuleSchema = z.object({ enabled: z.boolean() });
export type SetModuleInput = z.infer<typeof setModuleSchema>;
