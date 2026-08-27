// Ekran görüntüsü kayıt defteri.
//
// Her yenilenen ekran buraya bir satır olarak giriyor ve `screenshots.mjs` bu
// listeyi gezip `docs/design/screens/adim-<n>/<slug>.png` üretiyor. Liste ayrı
// bir dosyada duruyor çünkü bir adımı bitirdiğinizde dokunmanız gereken tek yer
// burası — sürücü betiğini okumanız gerekmiyor.
//
// `path` ya düz bir yol ya da veritabanından bir kimlik çözen bir fonksiyon.
// Kimliği sabit yazmıyoruz: gösterim verisi `cuid` üretiyor ve her yeniden
// tohumlamada değişiyor.

/**
 * Giriş yapılacak gösterim hesapları. Şifreler `DEMO-KULLANICILAR.md`de.
 *
 * Buradaki anahtarlara ek olarak `as: "anon"` da geçerli: oturum açılmadan
 * çekilen ekranlar (giriş, bayi başvurusu, şifre sıfırlama). Onlar için giriş
 * yapmak sayfayı hiç göstermezdi — giriş yapmış bir tarayıcı `/login`e
 * uğramaz, uygulamaya döner.
 */
export const ACCOUNTS = {
  admin: { email: "patron@bayraktar.local", password: "143688" },
  portal: { email: "yonetici@akbayi.local", password: "143688" },
  rep: { email: "temsilci1@bayraktar.local", password: "143688" },
};

/** Sipariş listesinde en çok kalemi olan sipariş — boş ekran kaydetmemek için. */
async function richestOrder(db) {
  const rows = await db.order.findMany({
    select: { id: true, _count: { select: { items: true } } },
    orderBy: { createdAt: "desc" },
    take: 40,
  });
  const best = rows.sort((a, b) => b._count.items - a._count.items)[0];
  return best?.id;
}

export const SCREENS = [
  // ── Adım 2 — portal / vitrin ────────────────────────────────────────────
  {
    step: 2,
    slug: "portal-vitrin",
    label: "Portal — ürün vitrini",
    as: "portal",
    path: "/portal",
  },
  {
    step: 2,
    slug: "portal-siparisler",
    label: "Portal — sipariş listesi",
    as: "portal",
    path: "/portal/orders",
  },
  {
    step: 2,
    slug: "portal-ekstre",
    label: "Portal — cari ekstre",
    as: "portal",
    path: "/portal/statement",
  },
  {
    step: 2,
    slug: "portal-urun-detay",
    label: "Portal — ürün detayı",
    as: "portal",
    path: async (db) => {
      const p = await db.product.findFirst({
        where: { isActive: true, variants: { some: { prices: { some: {} } } } },
        select: { id: true },
        orderBy: { name: "asc" },
      });
      return p && `/portal/urun/${p.id}`;
    },
  },

  // ── Adım 3 — yönetim çekirdeği ──────────────────────────────────────────
  {
    step: 3,
    slug: "admin-pano",
    label: "Yönetim panosu",
    as: "admin",
    path: "/admin",
  },
  {
    step: 3,
    slug: "admin-firmalar",
    label: "Firma listesi",
    as: "admin",
    path: "/admin/companies",
  },
  {
    step: 3,
    slug: "admin-firma-detay",
    label: "Firma detayı",
    as: "admin",
    path: async (db) => {
      const c = await db.company.findFirst({
        where: { isActive: true, orders: { some: {} } },
        select: { id: true },
        orderBy: { name: "asc" },
      });
      return c && `/admin/companies/${c.id}`;
    },
  },
  {
    step: 3,
    slug: "admin-firma-ekstre",
    label: "Firma cari ekstresi",
    as: "admin",
    path: async (db) => {
      const c = await db.company.findFirst({
        where: { transactions: { some: {} } },
        select: { id: true },
        orderBy: { name: "asc" },
      });
      return c && `/admin/companies/${c.id}/statement`;
    },
  },
  {
    step: 3,
    slug: "admin-firma-yeni",
    label: "Yeni firma formu",
    as: "admin",
    path: "/admin/companies/new",
  },
  {
    step: 3,
    slug: "admin-urunler",
    label: "Ürün listesi",
    as: "admin",
    path: "/admin/products",
  },
  {
    step: 3,
    slug: "admin-urun-detay",
    label: "Ürün düzenleme",
    as: "admin",
    path: async (db) => {
      const p = await db.product.findFirst({
        where: { variants: { some: { prices: { some: {} } } } },
        select: { id: true },
        orderBy: { name: "asc" },
      });
      return p && `/admin/products/${p.id}`;
    },
  },
  {
    step: 3,
    slug: "admin-siparis-detay",
    label: "Sipariş detayı",
    as: "admin",
    path: async (db) => {
      const id = await richestOrder(db);
      return id && `/orders/${id}`;
    },
  },

  // ── Adım 8 — giriş ve hesap ─────────────────────────────────────────────
  { step: 8, slug: "giris", label: "Giriş ekranı", as: "anon", path: "/login" },
  {
    step: 8,
    slug: "kayit",
    label: "Bayilik başvurusu",
    as: "anon",
    path: "/kayit",
  },
  {
    step: 8,
    slug: "sifremi-unuttum",
    label: "Şifremi unuttum",
    as: "anon",
    path: "/sifremi-unuttum",
  },
  {
    step: 8,
    slug: "admin-basvurular",
    label: "Bayi başvuruları (yönetim)",
    as: "admin",
    path: "/admin/basvurular",
  },
];
