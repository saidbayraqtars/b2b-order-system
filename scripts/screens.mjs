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

/**
 * Sipariş listesinde en çok kalemi olan sipariş — boş ekran kaydetmemek için.
 *
 * `email` verilirse o hesabın **kendi firmasının** siparişleri arasından
 * seçiyor: bayi hesabıyla başka bir firmanın siparişine gitmek 403 döner ve
 * betik biçimli ama yanlış bir ekran kaydeder.
 */
async function richestOrder(db, email) {
  let companyId;
  if (email) {
    const user = await db.user.findUnique({
      where: { email },
      select: { companyId: true },
    });
    companyId = user?.companyId ?? undefined;
    if (!companyId) return null;
  }

  const rows = await db.order.findMany({
    where: companyId ? { companyId } : undefined,
    select: { id: true, _count: { select: { items: true } } },
    orderBy: { createdAt: "desc" },
    take: 40,
  });
  const best = rows.sort((a, b) => b._count.items - a._count.items)[0];
  return best?.id;
}

/**
 * Gösterim rapor tanımını adıyla bul.
 *
 * Kimlik yazılmıyor (`cuid`, her tohumlamada değişiyor) ve tanımın kendisi
 * `demo-reports.ts`ten geliyor. Tanım yoksa ekran atlanıyor — betik boş bir
 * rapor sayfası kaydetmektense o satırı hiç çekmiyor.
 */
async function reportId(db, name) {
  const row = await db.reportDefinition.findFirst({
    where: { name },
    select: { id: true },
  });
  return row?.id;
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
  {
    step: 8,
    slug: "hesabim",
    label: "Hesabım",
    as: "admin",
    path: "/hesabim",
  },
  // Eksik yetkinin adı adreste: ekran "yetkiniz yok" değil *hangi* yetkinin
  // eksik olduğunu söylüyor ve o cümle ancak parametreyle görülebiliyor.
  {
    step: 8,
    slug: "403",
    label: "Yetki reddi",
    as: "admin",
    path: "/403?perm=cash.manage",
  },

  // ── Adım 13 — Excel ile toplu güncelleme ────────────────────────────────
  // Fark önizlemesi ancak dosya yüklenince çiziliyor ve betik dosya
  // yüklemiyor: kaydedilen şey akışın ilk adımı. Önizlemenin kendisi
  // `bulk-import.test.ts`te 13 testle sınanıyor.
  {
    step: 13,
    slug: "toplu-fiyat",
    label: "Toplu güncelleme — fiyat",
    as: "admin",
    path: "/admin/toplu-guncelleme?bolum=fiyat",
  },
  {
    step: 13,
    slug: "toplu-stok",
    label: "Toplu güncelleme — stok sayımı",
    as: "admin",
    path: "/admin/toplu-guncelleme?bolum=stok",
  },

  // ── Adım 12 — yönetici panosu ───────────────────────────────────────────
  // Altı bölüm altı ayrı adres: sekme `?bolum=` ile URL'de, çünkü betik
  // düğmelere basmıyor ve fotoğraflanamayan ekranın doğru göründüğü
  // söylenemez.
  {
    step: 12,
    slug: "pano-durum",
    label: "Yönetici panosu — anlık durum",
    as: "admin",
    path: "/admin/analitik?bolum=durum",
  },
  {
    step: 12,
    slug: "pano-buyume",
    label: "Yönetici panosu — büyüme ve ciro köprüsü",
    as: "admin",
    path: "/admin/analitik?bolum=buyume",
  },
  {
    step: 12,
    slug: "pano-musteri",
    label: "Yönetici panosu — RFM, kohort, konsantrasyon",
    as: "admin",
    path: "/admin/analitik?bolum=musteri",
  },
  {
    step: 12,
    slug: "pano-urun",
    label: "Yönetici panosu — ABC ve ölü stok",
    as: "admin",
    path: "/admin/analitik?bolum=urun",
  },
  {
    step: 12,
    slug: "pano-nakit",
    label: "Yönetici panosu — DSO ve çek takvimi",
    as: "admin",
    path: "/admin/analitik?bolum=nakit",
  },
  {
    step: 12,
    slug: "pano-gidisat",
    label: "Yönetici panosu — ay sonu tahmini",
    as: "admin",
    path: "/admin/analitik?bolum=gidisat",
  },

  // ── Adım 11 — saha üçlüsü ve kök ────────────────────────────────────────
  // Kök sayfa oturumsuz çekiliyor: giriş yapmış bir tarayıcı için ekran
  // "Panele git" düğmesinden ibaret kalıyor ve ziyaretçinin gördüğü yüzey
  // kaydedilmiş olmuyor.
  {
    step: 11,
    slug: "kok",
    label: "Ön kapı",
    as: "anon",
    path: "/",
  },
  {
    step: 11,
    slug: "rep-pano",
    label: "Plasiyer panosu",
    as: "rep",
    path: "/rep",
  },
  {
    step: 11,
    slug: "rep-ziyaret",
    label: "Ziyaret — gün planı ve geçmiş",
    as: "rep",
    path: "/rep/ziyaret",
  },
  // Firma seçilmemişken tahsilat ekranı bir seçiciden ibaret; girişin kendisi
  // ancak cari belliyken görülüyor ve asıl fotoğraflanacak şey o.
  {
    step: 11,
    slug: "rep-tahsilat-secim",
    label: "Tahsilat — firma seçimi",
    as: "rep",
    path: "/rep/tahsilat",
  },
  {
    step: 11,
    slug: "rep-tahsilat",
    label: "Tahsilat girişi",
    as: "rep",
    path: async (db) => {
      const rep = await db.user.findFirst({
        where: { email: "temsilci1@bayraktar.local" },
        select: { id: true },
      });
      if (!rep) return null;
      // Tahsilatı **olan** bir firma: liste boşken ekranın yarısı boş kutu
      // olarak kaydediliyor ve o kutu ekranın nasıl çalıştığını söylemiyor.
      const c = await db.company.findFirst({
        where: {
          salesRepId: rep.id,
          transactions: { some: { type: "CREDIT" } },
        },
        select: { id: true },
        orderBy: { name: "asc" },
      });
      return c && `/rep/tahsilat?companyId=${c.id}`;
    },
  },

  // ── Adım 7 — rapor tasarımcısı ve panolar ───────────────────────────────
  {
    step: 7,
    slug: "rapor-listesi",
    label: "Raporlarım",
    as: "admin",
    path: "/reports",
  },
  {
    step: 7,
    slug: "rapor-tasarimci",
    label: "Rapor tasarımcısı (boş)",
    as: "admin",
    path: "/reports/new",
  },
  {
    step: 7,
    slug: "rapor-detay",
    label: "Kayıtlı rapor — tasarım + önizleme",
    as: "admin",
    path: async (db) => {
      const id = await reportId(db, "Aylık ciro");
      return id && `/reports/${id}`;
    },
  },
  // Yazdırma yüzeyi. `documents/**` gibi davranıyor: kâğıt her zaman beyaz,
  // koyu tema dönmüyor. Görüntüsü tam da bunu göstermek için burada.
  {
    step: 7,
    slug: "rapor-yazdir",
    label: "Rapor (yazdırma)",
    as: "admin",
    path: async (db) => {
      const id = await reportId(db, "Firma bazında ciro");
      return id && `/documents/reports/${id}`;
    },
  },
  {
    step: 7,
    slug: "rapor-panolar",
    label: "Pano listesi",
    as: "admin",
    path: "/reports/dashboards",
  },
  {
    step: 7,
    slug: "rapor-pano",
    label: "Pano — dört rapor tek ekranda",
    as: "admin",
    path: async (db) => {
      const row = await db.reportDashboard.findFirst({
        where: { name: "Yönetim özeti" },
        select: { id: true },
      });
      return row && `/reports/dashboards/${row.id}`;
    },
  },
  // Hazır raporların beş sekmesi beş ayrı adres — stok defterindeki kararın
  // aynısı: sekme URL'de olmayan ekran fotoğraflanamaz.
  {
    step: 7,
    slug: "admin-hazir-satis",
    label: "Hazır raporlar — satış",
    as: "admin",
    path: "/admin/reports?bolum=satis",
  },
  {
    step: 7,
    slug: "admin-hazir-urunler",
    label: "Hazır raporlar — ürünler",
    as: "admin",
    path: "/admin/reports?bolum=urunler",
  },
  {
    step: 7,
    slug: "admin-hazir-plasiyerler",
    label: "Hazır raporlar — plasiyerler",
    as: "admin",
    path: "/admin/reports?bolum=plasiyerler",
  },
  {
    step: 7,
    slug: "admin-hazir-tahsilat",
    label: "Hazır raporlar — tahsilat",
    as: "admin",
    path: "/admin/reports?bolum=tahsilat",
  },
  {
    step: 7,
    slug: "admin-hazir-alacak",
    label: "Hazır raporlar — alacak yaşlandırma",
    as: "admin",
    path: "/admin/reports?bolum=alacak",
  },

  // ── Adım 15 — sipariş kuralları ─────────────────────────────────────────
  {
    step: 15,
    slug: "siparis-kurallari",
    label: "Sipariş kuralları — asgari ve kesim saati",
    as: "admin",
    path: "/admin/siparis-kurallari",
  },

  {
    step: 15,
    slug: "zamanli-fiyatlar",
    label: "Zamanlı fiyat kuyruğu",
    as: "admin",
    path: "/admin/toplu-guncelleme?bolum=zamanli",
  },

  {
    step: 15,
    slug: "bekleyen-bakiye",
    label: "Bekleyen bakiye (backorder)",
    as: "admin",
    path: "/admin/deliveries?bolum=bekleyen",
  },

  {
    step: 15,
    slug: "mutabakat",
    label: "Cari mutabakat — yönetim",
    as: "admin",
    path: "/admin/mutabakat",
  },

  {
    step: 15,
    slug: "mutabakat-portal",
    label: "Cari mutabakat — bayi cevabı",
    as: "portal",
    path: "/portal/statement",
  },

  {
    step: 15,
    slug: "tahsilat-listesi",
    label: "Tahsilat çalışma listesi — bugün kimi arayacağım",
    as: "rep",
    path: "/rep/tahsilat",
  },

  // ── Adım 14 — arayüz artıkları ──────────────────────────────────────────
  //
  // Bu adımın çektiği şey yeni bir ekran değil, **adreslenebilir bir durum**:
  // süzgeçler artık URL'de ve bu, tam da bu betiğin fotoğraflayabildiği anlama
  // geliyor. Süzgeçli hâl daha önce hiç çekilememişti — betik düğmeye basmıyor.
  {
    step: 14,
    slug: "cekler-suzgecli",
    label: "Çek portföyü — vadesi geçmişler (süzgeç adreste)",
    as: "admin",
    path: "/admin/cekler?vadesi=gecmis",
  },
  {
    step: 14,
    slug: "guvenlik-suzgecli",
    label: "Güvenlik kaydı — yalnızca güvenlik olayları",
    as: "admin",
    path: "/admin/audit?guvenlik=1",
  },
  {
    step: 14,
    slug: "kullanicilar-suzgecli",
    label: "Kullanıcılar — saha ekibi sekmesi",
    as: "admin",
    path: "/admin/users?tip=FIELD",
  },
  // Boş durumun **eylemli** hâli: aranan şey yoksa bir sonraki adım süzgeci
  // temizlemek, katalog gerçekten boşsa ilk ürünü açmak. İki ayrı cümle, iki
  // ayrı düğme.
  {
    step: 14,
    slug: "urunler-bos-suzgec",
    label: "Ürünler — süzgeç boş döndü",
    as: "admin",
    path: "/admin/products?ara=zzzzyok",
  },
  // Sipariş detayı artık kabuklu. Adım 3'teki `admin-siparis-detay` da aynı
  // ekranı çekiyor ve o dosya da yenilendi; buradaki kayıt, kabuğun bayi
  // gözünden nasıl göründüğünü gösteriyor — rol değişince kabuk da değişiyor.
  {
    step: 14,
    slug: "siparis-detay-portal",
    label: "Sipariş detayı — bayi kabuğuyla",
    as: "portal",
    path: async (db) => {
      const id = await richestOrder(db, ACCOUNTS.portal.email);
      return id && `/orders/${id}`;
    },
  },

  // ── Adım 6 — yapılandırma ve sistem ─────────────────────────────────────
  {
    step: 6,
    slug: "admin-kurulum",
    label: "Kurulum sihirbazı",
    as: "admin",
    path: "/admin/kurulum",
  },
  {
    step: 6,
    slug: "admin-kurulus",
    label: "Kuruluş bilgileri",
    as: "admin",
    path: "/admin/organization",
  },
  {
    step: 6,
    slug: "admin-kategoriler",
    label: "Kategoriler",
    as: "admin",
    path: "/admin/categories",
  },
  {
    step: 6,
    slug: "admin-musteri-gruplari",
    label: "Müşteri grupları",
    as: "admin",
    path: "/admin/customer-groups",
  },
  {
    step: 6,
    slug: "admin-kampanyalar",
    label: "Kampanyalar",
    as: "admin",
    path: "/admin/promotions",
  },
  {
    step: 6,
    slug: "admin-duyurular",
    label: "Vitrin duyuruları",
    as: "admin",
    path: "/admin/announcements",
  },
  {
    step: 6,
    slug: "admin-sayfa-duzeni",
    label: "Sayfa düzeni",
    as: "admin",
    path: "/admin/sayfa-duzeni",
  },
  {
    step: 6,
    slug: "admin-kullanicilar",
    label: "Kullanıcılar",
    as: "admin",
    path: "/admin/users",
  },
  {
    step: 6,
    slug: "admin-hedefler",
    label: "Temsilci hedefleri",
    as: "admin",
    path: "/admin/targets",
  },
  {
    step: 6,
    slug: "admin-erp",
    label: "ERP bağlantısı",
    as: "admin",
    path: "/admin/erp",
  },
  {
    step: 6,
    slug: "admin-isler",
    label: "Bakım işleri",
    as: "admin",
    path: "/admin/jobs",
  },
  {
    step: 6,
    slug: "admin-surum",
    label: "Sürüm",
    as: "admin",
    path: "/admin/surum",
  },
  {
    step: 6,
    slug: "admin-guvenlik-kaydi",
    label: "Güvenlik kaydı",
    as: "admin",
    path: "/admin/audit",
  },
  {
    step: 6,
    slug: "admin-hareket-akisi",
    label: "Hareket akışı",
    as: "admin",
    path: "/admin/activity",
  },
];
