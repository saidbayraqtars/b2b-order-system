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
  courier: { email: "kurye1@bayraktar.local", password: "143688" },
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

  // ── Adım 4 — finans ─────────────────────────────────────────────────────
  {
    step: 4,
    slug: "admin-kasa",
    label: "Kasa & banka",
    as: "admin",
    path: "/admin/kasa",
  },
  {
    step: 4,
    slug: "admin-cekler",
    label: "Çek & senet portföyü",
    as: "admin",
    path: "/admin/cekler",
  },
  {
    step: 4,
    slug: "admin-iadeler",
    label: "İadeler",
    as: "admin",
    path: "/admin/iadeler",
  },
  {
    step: 4,
    slug: "admin-kurlar",
    label: "Döviz kurları",
    as: "admin",
    path: "/admin/kurlar",
  },
  {
    step: 4,
    slug: "admin-vadeler",
    label: "Vade tanımları",
    as: "admin",
    path: "/admin/payment-terms",
  },
  {
    step: 4,
    slug: "admin-hacim-iskontosu",
    label: "Hacim iskontosu",
    as: "admin",
    path: "/admin/volume-tiers",
  },

  // ── Adım 5 — operasyon ──────────────────────────────────────────────────
  {
    step: 5,
    slug: "admin-dagitim",
    label: "Dağıtım — kurye atama",
    as: "admin",
    path: "/admin/deliveries",
  },
  {
    step: 5,
    slug: "kurye-masasi",
    label: "Kurye masası",
    as: "courier",
    path: "/kurye",
  },
  // Stok tezgâhının dört sekmesi dört ayrı adres: sekme `?bolum=` ile URL'de
  // durduğu için hepsi ayrı ayrı çekilebiliyor. Bileşen durumunda tutulsaydı
  // yalnızca ilki fotoğraflanabilirdi.
  {
    step: 5,
    slug: "admin-stok-durum",
    label: "Stok defteri — stok durumu",
    as: "admin",
    path: "/admin/stok?bolum=durum",
  },
  {
    step: 5,
    slug: "admin-stok-partiler",
    label: "Stok defteri — partiler & SKT",
    as: "admin",
    path: "/admin/stok?bolum=partiler",
  },
  {
    step: 5,
    slug: "admin-stok-hareketler",
    label: "Stok defteri — hareketler",
    as: "admin",
    path: "/admin/stok?bolum=hareketler",
  },
  {
    step: 5,
    slug: "admin-stok-depolar",
    label: "Stok defteri — depolar",
    as: "admin",
    path: "/admin/stok?bolum=depolar",
  },
  {
    step: 5,
    slug: "admin-etiketler",
    label: "Etiket & fiş tasarımcısı",
    as: "admin",
    path: "/admin/labels",
  },
  {
    step: 5,
    slug: "admin-belge-serileri",
    label: "Belge serileri",
    as: "admin",
    path: "/admin/documents",
  },
  // Yazdırma yüzeyleri. Bunlar kâğıda basılıyor: beyaz zemin ve siyah yazı
  // koyu temada da dönmüyor, o yüzden buradaki iki çekim tasarım dilinin
  // renk kurallarına *uymadığını* göstermek için duruyor.
  {
    step: 5,
    slug: "belge-irsaliye",
    label: "İrsaliye (yazdırma)",
    as: "admin",
    path: async (db) => {
      const s = await db.shipment.findFirst({
        select: { id: true },
        orderBy: { shippedAt: "desc" },
      });
      return s && `/documents/shipments/${s.id}`;
    },
  },
  {
    step: 5,
    slug: "belge-kargo-etiketi",
    label: "Kargo etiketi (yazdırma)",
    as: "admin",
    path: async (db) => {
      const s = await db.shipment.findFirst({
        select: { id: true },
        orderBy: { shippedAt: "desc" },
      });
      return s && `/documents/labels?kind=CARGO_LABEL&shipments=${s.id}`;
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
