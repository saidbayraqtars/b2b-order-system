import { z } from "zod";
import type { Role } from "./enums";

// ─────────────────────────────────────────────
// YETKİ KAYIT DEFTERİ (permission registry)
// ─────────────────────────────────────────────
//
// Rol artık *tek* yetki kaynağı değil. Rol iki kaba işi yapmaya devam eder —
// hangi bölüme (admin/portal/rep) girilir ve kullanıcı bir firmaya bağlı mıdır —
// ama "neyi yapabilir" sorusunun cevabı buradaki adlandırılmış izinlerdir.
// Roller yalnızca bu listeden bir ön-doldurma şablonudur; asıl küme kullanıcı
// satırında (`User.permissions`) durur ve tek tek açılıp kapatılabilir.
//
// Kurallar:
//  1. Buradaki anahtar tek gerçek kaynak. Yeni ekran/uç eklerken izni burada
//     tanımlayıp `requireUser`/`requirePage`'e vermek zorunlu — kod içinde
//     serbest metin izin adı yazılmaz, tip zaten tutmaz.
//  2. İzin *yetenek* adlandırır, ekran adlandırmaz. Aynı izni birden çok ekran
//     kullanabilir (ör. sipariş onayı hem panelde hem sipariş detayında).
//  3. `read`/`write` ayrımı yalnızca gerçekten ayrı satın alınan yerlerde var.
//     Her ekran için iki izin üretmek listeyi okunmaz yapar, kimse de
//     "kasayı görebilir ama işleyemez"i her ekran için istemez.
//  4. Süper admin de bu izinlere tabidir. Bilerek: "her şeyi yapan ama kasaya
//     giremeyen yönetici" gerçek bir ihtiyaç ve rol bypass'ı onu imkânsız
//     kılar. Kilitlenmeye karşı koruma yetki *verme* tarafında: kimse kendi
//     `users.manage` iznini alamaz ve kendisinde olmayan izni başkasına
//     veremez (bkz. user-admin.ts).

export const PermissionEnum = z.enum([
  // katalog
  "products.view",
  "products.manage",
  "categories.manage",
  "pricing.manage",
  "promotions.manage",
  // müşteriler
  "companies.view",
  "companies.manage",
  "users.manage",
  "groups.manage",
  // sipariş
  "orders.view",
  "orders.create",
  "orders.approve",
  "orders.fulfil",
  "visits.manage",
  // finans
  "cash.view",
  "cash.manage",
  "payment_terms.manage",
  "volume_tiers.manage",
  "payments.view",
  // belge & rapor
  "documents.view",
  "documents.manage",
  "reports.view",
  "reports.build",
  // sistem
  "organization.manage",
  "erp.manage",
  "announcements.manage",
  "activity.view",
  "audit.view",
  "audit.manage",
]);
export type Permission = z.infer<typeof PermissionEnum>;

export const PERMISSIONS = PermissionEnum.options;

/** Onay ekranında kullanılan görünür ad. */
export const PERMISSION_LABELS: Record<Permission, string> = {
  "products.view": "Ürünleri görüntüle",
  "products.manage": "Ürünleri yönet",
  "categories.manage": "Kategorileri yönet",
  "pricing.manage": "Fiyat ve iskontoları yönet",
  "promotions.manage": "Kampanyaları yönet",
  "companies.view": "Firmaları görüntüle",
  "companies.manage": "Firmaları yönet",
  "users.manage": "Kullanıcıları yönet",
  "groups.manage": "Müşteri gruplarını yönet",
  "orders.view": "Siparişleri görüntüle",
  "orders.create": "Sipariş gir",
  "orders.approve": "Sipariş ve kredi onayı",
  "orders.fulfil": "Sevkiyat ve faturalama",
  "visits.manage": "Saha ziyareti aç/kapat",
  "cash.view": "Kasa ve bankayı görüntüle",
  "cash.manage": "Kasa hareketi işle",
  "payment_terms.manage": "Vadeleri yönet",
  "volume_tiers.manage": "Hacim iskontosunu yönet",
  "payments.view": "Kart tahsilatlarını görüntüle",
  "documents.view": "Belgeleri görüntüle",
  "documents.manage": "Belge serilerini yönet",
  "reports.view": "Raporları görüntüle",
  "reports.build": "Rapor tasarla",
  "organization.manage": "Kuruluş ayarlarını yönet",
  "erp.manage": "ERP köprüsünü yönet",
  "announcements.manage": "Duyuruları yönet",
  "activity.view": "Hareket kayıtlarını gör",
  "audit.view": "Güvenlik kayıtlarını gör",
  "audit.manage": "Denetim kaydını dışa aktar / temizle",
};

/** Tek satırlık açıklama; yalnızca adı yetmeyen izinler için. */
export const PERMISSION_HINTS: Partial<Record<Permission, string>> = {
  "orders.approve": "Onay bekleyen ve kredi limitini aşan siparişleri serbest bırakır",
  "orders.create": "Kendi adına ya da müşteri adına sipariş oluşturur",
  "cash.manage": "Tahsilat, ödeme ve virman kaydı açar — kasa bakiyesini değiştirir",
  "pricing.manage": "Liste fiyatı, grup fiyatı ve müşteriye özel iskonto",
  "users.manage": "Hesap açar, yetki verir, şifre sıfırlar",
  "audit.view": "Giriş denemeleri, reddedilen istekler, yetki değişiklikleri",
  "audit.manage": "Kaydı dosya olarak indirir ve saklama süresini uygular — geri alınamaz",
  "reports.build": "Kendi rapor tanımını kurar; satırlar zaten kendi kapsamıyla sınırlı",
};

/** Onay kutularının gruplandığı başlıklar — sıralama ekranda korunur. */
export const PERMISSION_GROUPS: ReadonlyArray<{
  title: string;
  permissions: readonly Permission[];
}> = [
  {
    title: "Katalog",
    permissions: [
      "products.view",
      "products.manage",
      "categories.manage",
      "pricing.manage",
      "promotions.manage",
    ],
  },
  {
    title: "Müşteriler",
    permissions: ["companies.view", "companies.manage", "groups.manage", "users.manage"],
  },
  {
    title: "Sipariş",
    permissions: [
      "orders.view",
      "orders.create",
      "orders.approve",
      "orders.fulfil",
      "visits.manage",
    ],
  },
  {
    title: "Finans",
    permissions: [
      "cash.view",
      "cash.manage",
      "payments.view",
      "payment_terms.manage",
      "volume_tiers.manage",
    ],
  },
  {
    title: "Belge & Rapor",
    permissions: ["documents.view", "documents.manage", "reports.view", "reports.build"],
  },
  {
    title: "Sistem",
    permissions: [
      "organization.manage",
      "erp.manage",
      "announcements.manage",
      "activity.view",
      "audit.view",
      "audit.manage",
    ],
  },
];

/**
 * Rol şablonları: yeni kullanıcı formunda rol seçilince tikler bununla
 * doldurulur. Şablon bir *başlangıç noktası*, bir sınır değil — yetkiyi asıl
 * belirleyen kaydedilen kümedir.
 */
export const ROLE_DEFAULT_PERMISSIONS: Record<Role, readonly Permission[]> = {
  // Kurulumu devralan kişi. Yeni bir izin eklendiğinde şablonun da büyümesi
  // için liste tek tek yazılmıyor.
  SUPER_ADMIN: PERMISSIONS,
  // Kendi firmasının hesaplarını ve siparişlerini yönetir; katalogu ve
  // fiyatlandırmayı satıcı belirler, alıcı yönetici değil.
  COMPANY_ADMIN: [
    "products.view",
    "companies.view",
    "users.manage",
    "orders.view",
    "orders.create",
    "orders.approve",
    "documents.view",
    "reports.view",
    "reports.build",
  ],
  // Sipariş girer, ürünü görür. Fiyat pazarlığı ve kullanıcı açma onun işi değil.
  COMPANY_STAFF: ["products.view", "orders.view", "orders.create", "documents.view"],
  // Saha: portföyündeki firmalar, sipariş, tahsilat, ziyaret. Kasa görünürlüğü
  // tahsilat işlediği için var; katalog yönetimi yok.
  SALES_REP: [
    "products.view",
    "companies.view",
    "orders.view",
    "orders.create",
    "visits.manage",
    "cash.view",
    "cash.manage",
    "documents.view",
    "reports.view",
    "reports.build",
  ],
};

/**
 * Bir kullanıcının izin kümesi — yalnızca satırında yazılı olan.
 *
 * Rol bilerek devreye girmiyor: rolün etkisi hesap açılırken şablonu
 * doldurmakla biter. Aksi hâlde "süper admin ama kasa kapalı" ayarı sessizce
 * yok sayılırdı.
 */
export function hasPermission(
  permissions: readonly string[] | null | undefined,
  needed: Permission,
): boolean {
  return !!permissions?.includes(needed);
}

/** Verilen izinlerin *hepsi* var mı. */
export function hasAllPermissions(
  permissions: readonly string[] | null | undefined,
  needed: readonly Permission[],
): boolean {
  return needed.every((p) => hasPermission(permissions, p));
}

/** Verilen izinlerden *en az biri* var mı. */
export function hasAnyPermission(
  permissions: readonly string[] | null | undefined,
  needed: readonly Permission[],
): boolean {
  return needed.some((p) => hasPermission(permissions, p));
}

/** Bilinmeyen anahtarları atar; eski kayıtlardan gelen çöp izinleri temizler. */
export function sanitizePermissions(input: readonly string[]): Permission[] {
  const known = new Set<string>(PERMISSIONS);
  return [...new Set(input.filter((p): p is Permission => known.has(p)))].sort();
}

export const permissionListSchema = z.array(PermissionEnum).max(PERMISSIONS.length);

/** Rol adlarıyla birlikte şablon çözümlemesi — form ve seed aynı yeri okur. */
export function defaultPermissionsFor(role: Role): Permission[] {
  return [...ROLE_DEFAULT_PERMISSIONS[role]];
}

// ─────────────────────────────────────────────
// KAPSAM: HANGİ İZİN HANGİ HESAP TİPİNE VERİLEBİLİR
// ─────────────────────────────────────────────
//
// `hasPermission` bir hesabın *ne yapabileceğini* söyler. Buradaki kapsam ise
// bambaşka bir soruyu yanıtlar: bir izin bu hesap tipine **verilebilir mi**?
//
// İkisi ayrı olmak zorunda. Yetki verme tarafındaki tek sınır "kendinde olmayanı
// veremezsin" olduğu sürece, süper admin bir bayi personeline `organization.manage`
// ya da `audit.manage` verebiliyordu — yanlışlıkla ya da bilmeden. Rol kapısı
// (`/admin` yalnızca SUPER_ADMIN) bunun bir kısmını durduruyordu, ama rol listesi
// olmayan uçlar (`requireUser(undefined, "orders.fulfil")` gibi) açıktı: bayi
// hesabı satıcının sevkiyat/fatura uçlarına erişebiliyordu.
//
// Kapsam **hesap tipi** (rol ailesi) düzeyinde, tek tek rol düzeyinde değil.
// Amaç bayi ↔ satıcı ↔ saha arasındaki sınırı korumak; aynı aile içindeki daha
// ince ayrım (firma yöneticisi onaylar, personel onaylamaz) rol kapısının ve
// servis kurallarının işi ve orada kalıyor.

export const RoleFamilyEnum = z.enum([
  /** Satıcının kendi iç ekibi — kurulumun sahibi. */
  "SELLER",
  /** Müşteri tarafı: firma yöneticisi ve personeli. */
  "DEALER",
  /** Saha: plasiyer. */
  "FIELD",
]);
export type RoleFamily = z.infer<typeof RoleFamilyEnum>;

export const ROLE_FAMILY: Record<Role, RoleFamily> = {
  SUPER_ADMIN: "SELLER",
  COMPANY_ADMIN: "DEALER",
  COMPANY_STAFF: "DEALER",
  SALES_REP: "FIELD",
};

export const ROLE_FAMILY_LABELS: Record<RoleFamily, string> = {
  SELLER: "Şirket",
  DEALER: "Bayi",
  FIELD: "Satış temsilcisi",
};

/**
 * Her iznin verilebileceği hesap tipleri.
 *
 * Yalnızca `SELLER` olanlar kurulumun sahibine ait yetkilerdir: katalog,
 * fiyatlandırma, kasa yönetimi, sistem ayarları, denetim. Bir bayi ya da saha
 * hesabına hiçbir koşulda verilemezler.
 */
export const PERMISSION_SCOPE: Record<Permission, readonly RoleFamily[]> = {
  // Katalogu satıcı yönetir; bayi ve saha yalnızca görür.
  "products.view": ["SELLER", "DEALER", "FIELD"],
  "products.manage": ["SELLER"],
  "categories.manage": ["SELLER"],
  "pricing.manage": ["SELLER"],
  "promotions.manage": ["SELLER"],

  // Bayi kendi cari/firma bilgisini görür (ekstre); firma kartını satıcı yönetir.
  "companies.view": ["SELLER", "DEALER", "FIELD"],
  "companies.manage": ["SELLER"],
  // Firma yöneticisi kendi personelini açar — bu yüzden bayide de var. Kimin
  // kimi yönetebileceğini servis ayrıca kısıtlıyor (kendi firması, iki rol).
  "users.manage": ["SELLER", "DEALER"],
  "groups.manage": ["SELLER"],

  "orders.view": ["SELLER", "DEALER", "FIELD"],
  "orders.create": ["SELLER", "DEALER", "FIELD"],
  // Firma içi onay bayinin kendi işleyişi; kredi onayı tarafını servis satıcıya
  // saklıyor.
  "orders.approve": ["SELLER", "DEALER"],
  // Sevkiyat ve faturalama satıcının işi — bayiye verilirse müşteri kendi
  // siparişini sevk edilmiş/faturalanmış gösterebilir.
  "orders.fulfil": ["SELLER"],
  "visits.manage": ["SELLER", "FIELD"],

  // Kasa satıcının parası. Saha tahsilat işlediği için orada da var.
  "cash.view": ["SELLER", "FIELD"],
  "cash.manage": ["SELLER", "FIELD"],
  "payment_terms.manage": ["SELLER"],
  "volume_tiers.manage": ["SELLER"],
  "payments.view": ["SELLER"],

  "documents.view": ["SELLER", "DEALER", "FIELD"],
  "documents.manage": ["SELLER"],
  "reports.view": ["SELLER", "DEALER", "FIELD"],
  "reports.build": ["SELLER", "DEALER", "FIELD"],

  "organization.manage": ["SELLER"],
  "erp.manage": ["SELLER"],
  "announcements.manage": ["SELLER"],
  // Hareket akışı kendi kapsamına göre süzülüyor (bayi kendi firmasını görür).
  "activity.view": ["SELLER", "DEALER", "FIELD"],
  "audit.view": ["SELLER"],
  "audit.manage": ["SELLER"],
};

/** Bu izin, bu rolde bir hesaba verilebilir mi? */
export function isPermissionGrantableTo(perm: Permission, role: Role): boolean {
  return PERMISSION_SCOPE[perm].includes(ROLE_FAMILY[role]);
}

/** Bu roldeki bir hesaba verilebilecek izinlerin tamamı. */
export function grantablePermissionsFor(role: Role): Permission[] {
  return PERMISSIONS.filter((p) => isPermissionGrantableTo(p, role));
}

/**
 * İstenen kümenin bu role verilemeyecek üyeleri. Boş dizi = sorun yok.
 * Hem form hem servis aynı listeyi üretir, böylece ekranda pasif görünen bir
 * kutu ile sunucunun reddettiği izin hiçbir zaman ayrışamaz.
 */
export function outOfScopePermissions(
  requested: readonly Permission[],
  role: Role,
): Permission[] {
  return requested.filter((p) => !isPermissionGrantableTo(p, role));
}
