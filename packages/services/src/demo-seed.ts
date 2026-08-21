/* eslint-disable no-console */
import { prisma } from "@repo/database";
import type { CollectionMethod, PaymentMethod } from "@repo/types";
import { assignCourier, confirmDelivery } from "./delivery";
import { createInvoice } from "./invoice";
import { changeOrderStatus } from "./order-lifecycle";
import { createOrder } from "./order";
import { recordPayment } from "./payment";
import { createShipment } from "./shipment";
import { normalizePeriodStart } from "./sales-target";
import { applySetupPack } from "./setup";
import { postStockMovement } from "./stock-ledger";
import { recordLotEntry } from "./stock-lot";

/**
 * Gösterim veritabanı — sunumda anlatılacak hikâyenin verisi.
 *
 * `seed-demo.ts` her rolden bir hesap ve gerçek bir katalog açıyor; bu betik
 * onun üstüne **işleyen bir yılın izini** koyuyor: plasiyer başına ~20
 * tamamlanmış sipariş, Samsun ilçelerine dağılmış onlarca müşteri noktası,
 * haftalara yayılmış ziyaretler, tahsilatlar, çekler ve hedefler. Boş bir
 * ekranda hiçbir rapor bir şey söylemiyor — sunumda gösterilecek olan da zaten
 * raporlar.
 *
 * Üç kuralı var:
 *
 *  1. **Sipariş, tahsilat ve stok servis katmanından geçer.** Satırları elle
 *     yazmak daha hızlı olurdu ama gösterim verisi o zaman gerçeğe benzemezdi:
 *     cari bakiye defterle, stok hareketle, kasa tahsilatla tutmazdı ve ilk
 *     açılan raporda fark görünürdü.
 *  2. **Tarihler sonradan geriye çekilir.** Servisler "şimdi" yazar; geçmişe
 *     yayılmış bir sipariş geçmişi ancak yazıldıktan sonra tarihleri
 *     düzeltilerek elde edilir. Rapor ekranları dönem seçtiği için hepsinin
 *     bugüne yığılması gösterimi işe yaramaz hâle getirirdi.
 *  3. **Rastgelelik tohumlu.** Aynı tohum aynı veriyi üretir: sunum provası ile
 *     sunumun kendisi aynı ekranları göstersin.
 *
 * Kullanım:
 *   pnpm --filter @repo/services demo:seed            # temizlik + paket + veri
 *   DEMO_SEED_FORCE=1 pnpm --filter @repo/services demo:seed   # yeniden yükle
 */

// ─────────────────────────────────────────────
// GÜVENLİK KAPISI
// ─────────────────────────────────────────────

/**
 * Üretimde çalışmaz.
 *
 * Bu betik müşteri kurulumunda çalıştırılırsa gerçek kataloğa uydurma sipariş
 * ve cari hareket yazar — geri alınması elle temizlik demek. `bootstrap.ts` ile
 * aynı ayrım: gösterim verisi ile gerçek kurulumun yolu hiç kesişmemeli.
 */
function assertNotProduction(): void {
  if (process.env.NODE_ENV === "production" && process.env.DEMO_SEED_FORCE !== "1") {
    console.error(
      "HATA: NODE_ENV=production. Gösterim verisi gerçek kuruluma yazılmaz.\n" +
        "Gerçekten isteniyorsa DEMO_SEED_FORCE=1 ile çalıştırın.",
    );
    process.exit(1);
  }
}

// ─────────────────────────────────────────────
// TOHUMLU RASTGELELİK
// ─────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = mulberry32(20260821);
const pick = <T>(list: readonly T[]): T => list[Math.floor(rnd() * list.length)]!;
const between = (min: number, max: number): number =>
  min + Math.floor(rnd() * (max - min + 1));

const DAY = 24 * 60 * 60 * 1000;
const today = new Date();

function daysAgo(n: number, hour = 10): Date {
  const d = new Date(today.getTime() - n * DAY);
  d.setHours(hour, between(0, 59), between(0, 59), 0);
  return d;
}

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

// ─────────────────────────────────────────────
// 0. TEMİZLİK
// ─────────────────────────────────────────────

/** Geliştirme tohumundan kalan, gösterimde yeri olmayan hesaplar. */
const LEGACY_EMAILS = [
  "admin@b2b.local",
  "rep@b2b.local",
  "manager@ornek.local",
  "staff@ornek.local",
];

/** Rota testlerinden kalan firma adları — hepsi damgalı, karışma ihtimali yok. */
const JUNK_COMPANY_PREFIXES = ["FO Firma", "Firma cash", "Job Firma", "Test Firma"];

/**
 * Test ve tohum artıklarını siler.
 *
 * Rota testleri kendi kullanıcısını, firmasını ve siparişini açıp temizliyor,
 * ama yarıda kesilen bir koşu artığını bırakıyor: sunumda kullanıcı listesinde
 * "Yeni Plasiyer" adında on beş satır görünmesi, ekranın kendisi kadar dikkat
 * çekiyor.
 *
 * Sıra, kısıtlı (RESTRICT) yabancı anahtarların sırası: siparişin bağlıları →
 * sipariş → firmanın bağlıları → firma → kullanıcı. Nullable olanları
 * veritabanı kendisi boşaltıyor (ON DELETE SET NULL), onlara dokunulmuyor.
 */
/**
 * Zaman damgalı fikstür artıkları — grup, ürün, kasa.
 *
 * Adında on haneli bir sayı taşıyan satır gerçek katalogdan gelmiş olamaz;
 * testler bunu böyle işaretliyor. Ayrı bir işlev çünkü kullanıcı/firma artığı
 * kalmadığında bile bunlar duruyor olabilir.
 */
async function cleanupStamped(): Promise<void> {
  // Fikstürlerin açtığı grup ve ürünler: adlarında zaman damgası taşıyor, gerçek
  // katalogda böyle bir ad yok.
  const stamped = /\d{9,}/;
  const groups = await prisma.customerGroup.findMany({ select: { id: true, name: true } });
  await prisma.customerGroup.deleteMany({
    where: { id: { in: groups.filter((g) => stamped.test(g.name)).map((g) => g.id) } },
  });
  const accounts = await prisma.cashAccount.findMany({ select: { id: true, name: true } });
  const junkAccounts = accounts.filter((a) => stamped.test(a.name)).map((a) => a.id);
  await prisma.cashMovement.deleteMany({ where: { accountId: { in: junkAccounts } } });
  await prisma.paymentMethodAccount.deleteMany({
    where: { accountId: { in: junkAccounts } },
  });
  await prisma.cashAccount.deleteMany({ where: { id: { in: junkAccounts } } });

  const products = await prisma.product.findMany({ select: { id: true, name: true } });
  await prisma.product.deleteMany({
    where: { id: { in: products.filter((p) => stamped.test(p.name)).map((p) => p.id) } },
  });

}

async function cleanup(): Promise<void> {
  const junkUsers = await prisma.user.findMany({
    where: {
      OR: [{ email: { endsWith: "@test.local" } }, { email: { in: LEGACY_EMAILS } }],
    },
    select: { id: true },
  });
  const junkCompanies = await prisma.company.findMany({
    where: {
      OR: [
        ...JUNK_COMPANY_PREFIXES.map((p) => ({ name: { startsWith: p } })),
        { name: "Örnek Ticaret A.Ş." },
      ],
    },
    select: { id: true },
  });

  const userIds = junkUsers.map((u) => u.id);
  const companyIds = junkCompanies.map((c) => c.id);
  if (userIds.length === 0 && companyIds.length === 0) {
    console.log("• Temizlenecek artık yok.");
    return;
  }

  const orders = await prisma.order.findMany({
    where: { OR: [{ companyId: { in: companyIds } }, { createdById: { in: userIds } }] },
    select: { id: true },
  });
  const orderIds = orders.map((o) => o.id);

  const txns = await prisma.transaction.findMany({
    where: {
      OR: [
        { orderId: { in: orderIds } },
        { companyId: { in: companyIds } },
        { recordedById: { in: userIds } },
      ],
    },
    select: { id: true },
  });
  const txnIds = txns.map((t) => t.id);

  const intents = await prisma.paymentIntent.findMany({
    where: { OR: [{ orderId: { in: orderIds } }, { companyId: { in: companyIds } }] },
    select: { id: true },
  });
  const intentIds = intents.map((i) => i.id);

  const cheques = await prisma.cheque.findMany({
    where: { OR: [{ companyId: { in: companyIds } }, { transactionId: { in: txnIds } }] },
    select: { id: true },
  });
  const chequeIds = cheques.map((c) => c.id);

  const shipments = await prisma.shipment.findMany({
    where: { OR: [{ orderId: { in: orderIds } }, { shippedById: { in: userIds } }] },
    select: { id: true },
  });
  const shipmentIds = shipments.map((s) => s.id);

  const invoices = await prisma.invoice.findMany({
    where: {
      OR: [
        { orderId: { in: orderIds } },
        { companyId: { in: companyIds } },
        { createdById: { in: userIds } },
      ],
    },
    select: { id: true },
  });
  const invoiceIds = invoices.map((i) => i.id);

  await prisma.cashMovement.deleteMany({
    where: {
      OR: [
        { orderId: { in: orderIds } },
        { transactionId: { in: txnIds } },
        { recordedById: { in: userIds } },
      ],
    },
  });
  await prisma.chequeEvent.deleteMany({ where: { chequeId: { in: chequeIds } } });
  await prisma.cheque.deleteMany({ where: { id: { in: chequeIds } } });
  await prisma.paymentIntentEvent.deleteMany({ where: { intentId: { in: intentIds } } });
  await prisma.paymentIntent.deleteMany({ where: { id: { in: intentIds } } });
  // Ters kayıt işaretçisi önce boşaltılıyor: iki satır birbirini gösterirken
  // ikisini birden silmek kısıta takılıyor.
  await prisma.transaction.updateMany({
    where: { reversalOfId: { in: txnIds } },
    data: { reversalOfId: null },
  });
  await prisma.transaction.deleteMany({ where: { id: { in: txnIds } } });
  await prisma.stockMovement.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.promotionRedemption.deleteMany({
    where: { OR: [{ orderId: { in: orderIds } }, { companyId: { in: companyIds } }] },
  });
  await prisma.shipmentItem.deleteMany({ where: { shipmentId: { in: shipmentIds } } });
  await prisma.shipment.deleteMany({ where: { id: { in: shipmentIds } } });
  await prisma.invoiceItem.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
  await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
  await prisma.orderStatusHistory.deleteMany({
    where: { OR: [{ orderId: { in: orderIds } }, { changedById: { in: userIds } }] },
  });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });

  await prisma.cartItem.deleteMany({
    where: { cart: { companyId: { in: companyIds } } },
  });
  await prisma.cart.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.checkIn.deleteMany({
    where: { OR: [{ salesRepId: { in: userIds } }, { companyId: { in: companyIds } }] },
  });
  await prisma.visitRequest.deleteMany({
    where: {
      OR: [
        { companyId: { in: companyIds } },
        { salesRepId: { in: userIds } },
        { createdById: { in: userIds } },
      ],
    },
  });
  await prisma.salesTarget.deleteMany({
    where: { OR: [{ salesRepId: { in: userIds } }, { createdById: { in: userIds } }] },
  });
  await prisma.companyDiscount.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.address.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
  await prisma.company.updateMany({
    where: { salesRepId: { in: userIds } },
    data: { salesRepId: null },
  });
  await prisma.user.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });

  console.log(
    `✓ Temizlik: ${userIds.length} kullanıcı, ${companyIds.length} firma, ${orderIds.length} sipariş silindi.`,
  );
}

/**
 * Kasa bakiyelerini defterden yeniden hesaplar.
 *
 * `CashAccount.currentBalance` hareketlerin önbelleği: yazan her yer ikisini
 * aynı işlemde günceller. Gösterim koşusu ise hareketleri toplu siliyor, o
 * yüzden önbelleği burada defterin kendisinden tazelemek gerekiyor — yoksa
 * kasa ekranı, altındaki listenin toplamından fazlasını gösteriyor.
 */
async function resyncCashBalances(): Promise<void> {
  const accounts = await prisma.cashAccount.findMany({
    select: { id: true, openingBalance: true },
  });
  for (const a of accounts) {
    const sums = await prisma.cashMovement.groupBy({
      by: ["direction"],
      where: { accountId: a.id },
      _sum: { amount: true },
    });
    const net = sums.reduce((acc, row) => {
      const amount = Number(row._sum.amount ?? 0);
      return row.direction === "IN" ? acc + amount : acc - amount;
    }, Number(a.openingBalance));
    await prisma.cashAccount.update({
      where: { id: a.id },
      data: { currentBalance: net },
    });
  }
}

/**
 * Silinen sipariş hareketlerinin malını defterlere geri koyar.
 *
 * Stok bakiyesi hareketlerin toplamı **değil**, hareketlerle oynatılan bir
 * sayı: açılış miktarları defter kurulmadan önce yazılmış. Dolayısıyla bir
 * siparişin hareket satırlarını silmek bakiyeyi kendiliğinden düzeltmiyor —
 * silinen her çıkışın adedi elle geri eklenmezse gösterim ikinci koşuda
 * "stok yetersiz" diye duruyordu.
 */
async function restoreStockFor(orderIds: string[]): Promise<void> {
  if (orderIds.length === 0) return;

  const movements = await prisma.stockMovement.findMany({
    where: { orderId: { in: orderIds } },
    select: {
      variantId: true,
      warehouseId: true,
      lotId: true,
      direction: true,
      quantity: true,
    },
  });

  const byVariant = new Map<string, number>();
  const byWarehouse = new Map<string, number>();
  const byLot = new Map<string, number>();
  const add = (map: Map<string, number>, key: string, delta: number) =>
    map.set(key, (map.get(key) ?? 0) + delta);

  for (const m of movements) {
    // Hareketin *tersi*: çıkışsa geri konur, girişse (iptal iadesi) geri alınır.
    const back = m.direction === "OUT" ? m.quantity : -m.quantity;
    add(byVariant, m.variantId, back);
    if (m.warehouseId) add(byWarehouse, `${m.variantId}|${m.warehouseId}`, back);
    if (m.lotId) add(byLot, m.lotId, back);
  }

  await prisma.stockMovement.deleteMany({ where: { orderId: { in: orderIds } } });

  for (const [variantId, delta] of byVariant) {
    await prisma.productVariant.update({
      where: { id: variantId },
      data: { stock: { increment: delta } },
    });
  }
  for (const [key, delta] of byWarehouse) {
    const [variantId, warehouseId] = key.split("|") as [string, string];
    await prisma.variantStock.updateMany({
      where: { variantId, warehouseId },
      data: { onHand: { increment: delta } },
    });
  }
  for (const [lotId, delta] of byLot) {
    await prisma.stockLot.update({
      where: { id: lotId },
      data: { onHand: { increment: delta } },
    });
  }
}

/**
 * Önceki gösterim koşusunun hareketlerini siler.
 *
 * Yalnızca `DMO-` kodlu firmalara ait olanlar: gerçek kurulumda böyle bir kod
 * yok, gösterim veritabanındaki elle açılmış kayıtlar da bu kodu taşımıyor. Bu
 * yüzden betiği ikinci kez çalıştırmak veriyi ikiye katlamıyor, tazeliyor.
 */
async function purgeDemoActivity(companyIds: string[]): Promise<void> {
  if (companyIds.length === 0) return;

  const orders = await prisma.order.findMany({
    where: { companyId: { in: companyIds } },
    select: { id: true },
  });
  const orderIds = orders.map((o) => o.id);
  const txns = await prisma.transaction.findMany({
    where: { OR: [{ orderId: { in: orderIds } }, { companyId: { in: companyIds } }] },
    select: { id: true },
  });
  const txnIds = txns.map((t) => t.id);

  await prisma.cashMovement.deleteMany({
    where: { OR: [{ orderId: { in: orderIds } }, { transactionId: { in: txnIds } }] },
  });
  await prisma.chequeEvent.deleteMany({
    where: { cheque: { companyId: { in: companyIds } } },
  });
  await prisma.cheque.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.transaction.updateMany({
    where: { reversalOfId: { in: txnIds } },
    data: { reversalOfId: null },
  });
  await prisma.transaction.deleteMany({ where: { id: { in: txnIds } } });
  await restoreStockFor(orderIds);
  await prisma.promotionRedemption.deleteMany({
    where: { OR: [{ orderId: { in: orderIds } }, { companyId: { in: companyIds } }] },
  });
  await prisma.shipmentItem.deleteMany({
    where: { shipment: { orderId: { in: orderIds } } },
  });
  await prisma.shipment.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.invoiceItem.deleteMany({
    where: { invoice: { orderId: { in: orderIds } } },
  });
  await prisma.invoice.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.checkIn.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.visitRequest.deleteMany({ where: { companyId: { in: companyIds } } });

  // Cari bakiye defterden türetiliyor: hareketleri silinen firma sıfırdan
  // başlamalı, yoksa ekstre boş görünürken bakiye dolu kalır.
  await prisma.company.updateMany({
    where: { id: { in: companyIds } },
    data: { currentBalance: 0 },
  });
  await resyncCashBalances();
  console.log(`• Önceki koşu temizlendi: ${orderIds.length} sipariş.`);
}

// ─────────────────────────────────────────────
// 1. MÜŞTERİ NOKTALARI
// ─────────────────────────────────────────────

interface DemoCompany {
  name: string;
  district: string;
  lat: number;
  lng: number;
  group: "Bakkal / Market" | "Zincir Market" | "Toptancı" | "HORECA";
  rep: 0 | 1 | 2;
  creditLimit: number;
  termDays: number;
}

/**
 * Samsun ve ilçeleri — koordinatlar gerçek yerleşim merkezleri.
 *
 * Ziyaret haritası ve rota ekranı koordinat olmadan boş bir kutu; sunumda
 * gösterilecek olan da tam olarak o harita. İlçelere yayılmış olmaları
 * bilerek: tek mahalleye toplanmış yirmi pin, "saha" diye bir şeyin olduğunu
 * anlatmıyor.
 */
const COMPANIES: readonly DemoCompany[] = [
  { name: "Atakum Gross Market", district: "Atakum", lat: 41.3316, lng: 36.2312, group: "Zincir Market", rep: 2, creditLimit: 4500000, termDays: 45 },
  { name: "Sahil Şarküteri", district: "Atakum", lat: 41.3251, lng: 36.2589, group: "Bakkal / Market", rep: 2, creditLimit: 750000, termDays: 30 },
  { name: "İlkadım Toptan Gıda", district: "İlkadım", lat: 41.2928, lng: 36.3313, group: "Toptancı", rep: 0, creditLimit: 6000000, termDays: 45 },
  { name: "Çiftlik Market", district: "İlkadım", lat: 41.286, lng: 36.3155, group: "Bakkal / Market", rep: 0, creditLimit: 540000, termDays: 30 },
  { name: "Canik Kardeşler Gıda", district: "Canik", lat: 41.2717, lng: 36.3644, group: "Toptancı", rep: 0, creditLimit: 2700000, termDays: 30 },
  { name: "Yeni Mahalle Bakkaliye", district: "Canik", lat: 41.265, lng: 36.372, group: "Bakkal / Market", rep: 0, creditLimit: 360000, termDays: 14 },
  { name: "Tekkeköy Toptan Gıda", district: "Tekkeköy", lat: 41.2167, lng: 36.4667, group: "Toptancı", rep: 1, creditLimit: 3600000, termDays: 45 },
  { name: "Aygün Market", district: "Tekkeköy", lat: 41.2043, lng: 36.453, group: "Bakkal / Market", rep: 1, creditLimit: 600000, termDays: 30 },
  { name: "Bafra Merkez Gıda", district: "Bafra", lat: 41.5678, lng: 35.9069, group: "Toptancı", rep: 1, creditLimit: 3000000, termDays: 45 },
  { name: "Bafra Yıldız Market", district: "Bafra", lat: 41.5601, lng: 35.8975, group: "Bakkal / Market", rep: 1, creditLimit: 450000, termDays: 30 },
  { name: "Çarşamba Gıda Pazarı", district: "Çarşamba", lat: 41.1989, lng: 36.7269, group: "Zincir Market", rep: 2, creditLimit: 5400000, termDays: 45 },
  { name: "Terme Öz Market", district: "Terme", lat: 41.2078, lng: 36.9744, group: "Bakkal / Market", rep: 2, creditLimit: 480000, termDays: 30 },
  { name: "Vezirköprü Toptan Gıda", district: "Vezirköprü", lat: 41.1436, lng: 35.4586, group: "Toptancı", rep: 1, creditLimit: 2100000, termDays: 30 },
  { name: "Havza Şarküteri", district: "Havza", lat: 40.9694, lng: 35.6642, group: "Bakkal / Market", rep: 1, creditLimit: 420000, termDays: 30 },
  { name: "Ladik Market", district: "Ladik", lat: 40.9142, lng: 35.8925, group: "Bakkal / Market", rep: 1, creditLimit: 300000, termDays: 14 },
  { name: "Alaçam Sahil Market", district: "Alaçam", lat: 41.6106, lng: 35.6081, group: "Bakkal / Market", rep: 1, creditLimit: 360000, termDays: 30 },
  { name: "Kavak Gıda Ticaret", district: "Kavak", lat: 41.0781, lng: 36.0417, group: "Bakkal / Market", rep: 0, creditLimit: 390000, termDays: 30 },
  { name: "Ballıca Market", district: "19 Mayıs", lat: 41.4642, lng: 36.01, group: "Bakkal / Market", rep: 0, creditLimit: 330000, termDays: 14 },
  { name: "Salıpazarı Toptan", district: "Salıpazarı", lat: 41.0947, lng: 36.8272, group: "Toptancı", rep: 2, creditLimit: 1800000, termDays: 30 },
  { name: "Asarcık Market", district: "Asarcık", lat: 41.0322, lng: 36.2381, group: "Bakkal / Market", rep: 0, creditLimit: 270000, termDays: 14 },
  { name: "Liman Balık Restoran", district: "İlkadım", lat: 41.301, lng: 36.34, group: "HORECA", rep: 0, creditLimit: 750000, termDays: 30 },
  { name: "Atakum Kebap Salonu", district: "Atakum", lat: 41.329, lng: 36.245, group: "HORECA", rep: 2, creditLimit: 540000, termDays: 30 },
  { name: "Otel Samsun Grand", district: "İlkadım", lat: 41.2896, lng: 36.331, group: "HORECA", rep: 0, creditLimit: 1500000, termDays: 45 },
  { name: "Karadeniz Pide Salonu", district: "Canik", lat: 41.274, lng: 36.356, group: "HORECA", rep: 2, creditLimit: 360000, termDays: 14 },
];

interface SeededCompany {
  id: string;
  name: string;
  repId: string;
  addressId: string;
  lat: number;
  lng: number;
}

async function seedCompanies(repIds: string[]): Promise<SeededCompany[]> {
  const groups = await prisma.customerGroup.findMany({ select: { id: true, name: true } });
  const groupId = (name: string) => groups.find((g) => g.name === name)?.id ?? null;

  const out: SeededCompany[] = [];
  let n = 0;
  for (const c of COMPANIES) {
    n += 1;
    // Kimlik: ERP kodu. Köprü eşleşmeyi bunun üzerinden yapıyor ve gösterim
    // firmalarının da bir kodu olması, ERP demosunu mümkün kılıyor.
    const externalCode = `DMO-${String(n).padStart(3, "0")}`;
    const existing = await prisma.company.findUnique({
      where: { externalCode },
      select: { id: true, addresses: { select: { id: true }, take: 1 } },
    });

    const repId = repIds[c.rep]!;
    if (existing) {
      // Var olan firmanın künyesi tazeleniyor: limit ya da plasiyer ataması
      // betikte değiştiğinde ikinci koşu onu da taşısın.
      await prisma.company.update({
        where: { id: existing.id },
        data: {
          creditLimit: c.creditLimit,
          paymentTermDays: c.termDays,
          customerGroupId: groupId(c.group),
          salesRepId: repId,
          requiresOrderApproval: c.group === "Zincir Market",
        },
      });
      out.push({
        id: existing.id,
        name: c.name,
        repId,
        addressId: existing.addresses[0]!.id,
        lat: c.lat,
        lng: c.lng,
      });
      continue;
    }

    const company = await prisma.company.create({
      data: {
        name: c.name,
        externalCode,
        taxNumber: `55${String(1000000 + n * 7919).slice(0, 8)}`,
        taxOffice: `Samsun ${c.district}`,
        phone: `0362 ${between(200, 899)} ${between(10, 99)} ${between(10, 99)}`,
        email: `siparis@${externalCode.toLowerCase()}.demo`,
        creditLimit: c.creditLimit,
        paymentTermDays: c.termDays,
        customerGroupId: groupId(c.group),
        salesRepId: repId,
        // Zincirlerde onay akışı açık: personelin verdiği sipariş yöneticiye
        // düşer. Sunumdaki onay ekranının verisi buradan geliyor.
        requiresOrderApproval: c.group === "Zincir Market",
      },
      select: { id: true },
    });

    const address = await prisma.address.create({
      data: {
        companyId: company.id,
        label: "Merkez",
        line1: `${c.district} Mah. ${between(1, 90)}. Sk. No:${between(1, 60)}`,
        city: "Samsun",
        district: c.district,
        latitude: c.lat,
        longitude: c.lng,
        isDefault: true,
      },
      select: { id: true },
    });

    out.push({
      id: company.id,
      name: c.name,
      repId,
      addressId: address.id,
      lat: c.lat,
      lng: c.lng,
    });
  }
  console.log(`✓ ${out.length} müşteri noktası (Samsun ve ilçeleri).`);
  return out;
}

// ─────────────────────────────────────────────
// 2. STOK: MAL KABUL VE PARTİLER
// ─────────────────────────────────────────────

interface DemoVariant {
  id: string;
  sku: string;
  name: string;
  unitsPerCase: number;
  moqUnits: number;
  tracksLots: boolean;
  shelfLifeDays: number | null;
  stock: number;
}

/** Bu betiğin yazdığı mal kabullerin işareti — ikinci koşuda tanınsınlar diye. */
const ENTRY_NOTE = "Gösterim açılış mal kabulü";

async function seedStock(variants: DemoVariant[], adminId: string): Promise<void> {
  const warehouse = await prisma.warehouse.findFirst({
    where: { isActive: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: { id: true },
  });

  let lots = 0;
  for (const v of variants) {
    // Ölçü **koli**: elli koli, kolisi 24'lük maden suyunda 1.200 adet, kolisi
    // 5'lik pirinçte 250. Adet üzerinden sabit bir sayı, kolisi büyük olan
    // kalemi sunumun ortasında tükendi gösteriyordu.
    const current = await prisma.productVariant.findUnique({
      where: { id: v.id },
      select: { stock: true },
    });
    if ((current?.stock ?? 0) >= 60 * v.unitsPerCase) continue;

    // Üç parti: biri eski (SKT'si yakın), ikisi taze. FEFO gösterimi ancak aynı
    // kalemde farklı tarihli partiler varken bir şey anlatıyor.
    const batches = [
      { age: between(50, 80), qty: between(40, 70) * v.unitsPerCase },
      { age: between(20, 40), qty: between(70, 110) * v.unitsPerCase },
      { age: between(2, 12), qty: between(90, 140) * v.unitsPerCase },
    ];
    for (const b of batches) {
      const entered = daysAgo(b.age, 8);
      if (!v.tracksLots) {
        // Parti takibi kapalı kalem: defterin tek kapısı yine aynı, yalnızca
        // parti satırı yok.
        await prisma.$transaction((tx) =>
          postStockMovement(tx, {
            variantId: v.id,
            warehouseId: warehouse?.id ?? null,
            direction: "IN",
            quantity: b.qty,
            source: "MANUAL",
            description: ENTRY_NOTE,
            occurredAt: entered,
            recordedById: adminId,
          }),
        );
        continue;
      }
      const shelf = v.shelfLifeDays ?? 120;
      const expiry = new Date(entered.getTime() + shelf * DAY);
      await recordLotEntry(
        {
          variantId: v.id,
          warehouseId: warehouse?.id,
          expiryDate: isoDay(expiry),
          producedAt: isoDay(entered),
          quantity: b.qty,
          note: ENTRY_NOTE,
          occurredAt: isoDay(entered),
        },
        adminId,
      );
      lots += 1;
    }
  }
  console.log(`✓ Mal kabul: ${variants.length} kalem, ${lots} parti.`);
}

// ─────────────────────────────────────────────
// 3. SİPARİŞLER
// ─────────────────────────────────────────────

const PAYMENT_METHODS: readonly PaymentMethod[] = [
  "OPEN_ACCOUNT",
  "OPEN_ACCOUNT",
  "OPEN_ACCOUNT",
  "OPEN_ACCOUNT",
  "CASH",
  "BANK_TRANSFER",
  "CHEQUE",
];

interface PlacedOrder {
  id: string;
  companyId: string;
  repId: string;
  placedAt: Date;
  status: string;
  total: number;
  paymentMethod: PaymentMethod;
}

/**
 * Bir siparişin bütün izlerini geçmişe çeker.
 *
 * Servisler "şimdi" yazıyor — doğrusu da bu. Geçmişe yayılmış bir sipariş
 * geçmişi ancak yazıldıktan sonra tarihleri düzeltilerek elde ediliyor, ve
 * düzeltmenin siparişle birlikte **defterin bütün satırlarını** kapsaması şart:
 * biri geride kalırsa ekstre ile stok raporu aynı işi iki ayrı günde gösterir.
 */
const daySequence = new Map<string, number>();

/**
 * Geriye çekilen siparişin **numarası** da o güne ait olmalı.
 *
 * Numara `ORD-YYYYMMDD-0001` biçiminde ve üretimi "bugün kaç sipariş var"
 * sayımına dayanıyor. Tarihi geriye çekilen sipariş o sayımdan düştüğü için
 * bir sonraki sipariş aynı numarayı alıyor ve eşsizlik kısıtına takılıyordu.
 * Numarayı burada, geçmiş günün kendi sayacından vermek ikisini birden
 * çözüyor: çakışma kalmıyor ve belge numarası tarihiyle tutuyor.
 */
async function backdatedOrderNumber(placedAt: Date): Promise<string> {
  const key = `${placedAt.getFullYear()}${String(placedAt.getMonth() + 1).padStart(2, "0")}${String(
    placedAt.getDate(),
  ).padStart(2, "0")}`;
  let seq = daySequence.get(key);
  if (seq === undefined) {
    seq = await prisma.order.count({
      where: { orderNumber: { startsWith: `ORD-${key}-` } },
    });
  }
  seq += 1;
  daySequence.set(key, seq);
  return `ORD-${key}-${String(seq).padStart(4, "0")}`;
}

async function backdateOrder(orderId: string, placedAt: Date): Promise<void> {
  // Numara çakışırsa sıradaki denenir: gün sayacı, betiğin dışında yazılmış
  // (tohumdan ya da elle) siparişleri bilmiyor.
  for (let attempt = 0; ; attempt++) {
    try {
      await prisma.order.update({
        where: { id: orderId },
        data: {
          createdAt: placedAt,
          updatedAt: placedAt,
          orderNumber: await backdatedOrderNumber(placedAt),
        },
      });
      break;
    } catch (e) {
      if (attempt >= 50) throw e;
    }
  }
  await prisma.orderStatusHistory.updateMany({
    where: { orderId, fromStatus: null },
    data: { createdAt: placedAt },
  });
  await prisma.transaction.updateMany({
    where: { orderId },
    data: { createdAt: placedAt },
  });
  await prisma.stockMovement.updateMany({
    where: { orderId },
    data: { occurredAt: placedAt },
  });
  await prisma.cashMovement.updateMany({
    where: { orderId },
    data: { occurredAt: placedAt, createdAt: placedAt },
  });
}

async function advance(
  orderId: string,
  status: "PROCESSING" | "SHIPPED" | "DELIVERED" | "CANCELLED",
  at: Date,
  actorId: string,
): Promise<void> {
  await changeOrderStatus(
    orderId,
    { status },
    { userId: actorId, role: "SUPER_ADMIN", companyId: null },
  );
  await prisma.orderStatusHistory.updateMany({
    where: { orderId, toStatus: status },
    data: { createdAt: at },
  });
  const stamp =
    status === "SHIPPED"
      ? { shippedAt: at }
      : status === "DELIVERED"
        ? { deliveredAt: at }
        : status === "CANCELLED"
          ? { cancelledAt: at }
          : {};
  await prisma.order.update({ where: { id: orderId }, data: { ...stamp, updatedAt: at } });
}

/**
 * Siparişi irsaliye ve kurye üzerinden kapatır.
 *
 * Durumu doğrudan DELIVERED'a çekmek daha kısa olurdu, ama o zaman sevkiyat
 * belgesi, kuryenin teslim kaydı ve fatura hiç doğmazdı — dağıtım ekranı ile
 * kurye uygulaması boş kalırdı. Sistemde durum zaten **sonuç**: ne sevk
 * edildiyse odur.
 */
async function fulfil(
  orderId: string,
  shipAt: Date,
  deliverAt: Date,
  adminId: string,
  courierId: string | null,
  withInvoice: boolean,
): Promise<void> {
  const items = await prisma.orderItem.findMany({
    where: { orderId },
    select: { id: true, quantity: true },
  });

  const { shipmentId } = await createShipment(
    orderId,
    {
      items: items.map((i) => ({ orderItemId: i.id, quantity: i.quantity })),
      carrier: pick(["Kendi aracımız", "Soğuk zincir aracı", "Bölge dağıtım"]),
      shippedAt: shipAt.toISOString(),
    },
    { userId: adminId, role: "SUPER_ADMIN" },
  );
  if (courierId) await assignCourier(shipmentId, courierId);
  await prisma.shipment.update({
    where: { id: shipmentId },
    data: { shippedAt: shipAt, createdAt: shipAt },
  });
  await prisma.orderStatusHistory.updateMany({
    where: { orderId, toStatus: "SHIPPED" },
    data: { createdAt: shipAt },
  });
  await prisma.order.update({
    where: { id: orderId },
    data: { shippedAt: shipAt, updatedAt: shipAt },
  });

  if (deliverAt > today) return; // yolda: teslim kaydı henüz yok

  await confirmDelivery({
    shipmentId,
    receivedByName: pick(["Depo sorumlusu", "Market müdürü", "Kasiyer", "İşletmeci"]),
    actorId: courierId ?? adminId,
    actorIsAdmin: courierId === null,
  });
  await prisma.shipment.update({
    where: { id: shipmentId },
    data: { deliveredAt: deliverAt },
  });
  await prisma.orderStatusHistory.updateMany({
    where: { orderId, toStatus: "DELIVERED" },
    data: { createdAt: deliverAt },
  });
  await prisma.order.update({
    where: { id: orderId },
    data: { deliveredAt: deliverAt, updatedAt: deliverAt },
  });

  if (!withInvoice) return;
  const invoice = await createInvoice(
    orderId,
    { issuedAt: deliverAt.toISOString() },
    { userId: adminId, role: "SUPER_ADMIN" },
  );
  await prisma.invoice.update({
    where: { id: invoice.invoiceId },
    data: { issuedAt: deliverAt, createdAt: deliverAt },
  });
}

async function seedOrders(
  companies: SeededCompany[],
  variants: DemoVariant[],
  adminId: string,
  courierIds: string[],
): Promise<PlacedOrder[]> {
  const placed: PlacedOrder[] = [];
  let failed = 0;

  // Plasiyer başına ~20 sipariş, 12 haftaya yayılmış. Eski olanlar teslim
  // edilmiş, son günlerdekiler yolda: sipariş panosu ancak her durumdan birer
  // satır varken bir pano gibi görünüyor.
  for (const company of companies) {
    const count = between(2, 4);
    for (let i = 0; i < count; i++) {
      // Dörtte biri son on güne düşüyor: pano ancak yolda olan işlerle bir pano.
      const age = rnd() < 0.25 ? between(1, 9) : between(10, 84);
      const placedAt = daysAgo(age, between(9, 17));
      const lineCount = between(3, 7);
      const chosen = new Set<number>();
      while (chosen.size < lineCount) chosen.add(Math.floor(rnd() * variants.length));

      const items = [...chosen].map((idx) => {
        const v = variants[idx]!;
        const cases = between(1, 4);
        return {
          variantId: v.id,
          quantity: Math.max(v.moqUnits, cases * v.unitsPerCase),
        };
      });

      const paymentMethod = pick(PAYMENT_METHODS);
      try {
        const result = await createOrder(
          {
            companyId: company.id,
            paymentMethod,
            items,
            note: i === 0 ? "Saha siparişi" : undefined,
          },
          { createdById: company.repId, createdByRole: "SALES_REP" },
        );

        await backdateOrder(result.orderId, placedAt);

        // Durum, siparişin yaşına göre: 10 günden eski olanların işi bitmiş
        // olmalı, dünkü sipariş daha yola çıkmamış olabilir.
        let status = result.status as string;
        if (result.status === "CONFIRMED") {
          const courierId = courierIds.length > 0 ? pick(courierIds) : null;
          if (age > 8) {
            await advance(result.orderId, "PROCESSING", daysAgo(age - 1, 9), adminId);
            await fulfil(
              result.orderId,
              daysAgo(age - 1, 14),
              daysAgo(age - 2, 11),
              adminId,
              courierId,
              rnd() > 0.35,
            );
            status = "DELIVERED";
          } else if (age > 4) {
            await advance(result.orderId, "PROCESSING", daysAgo(age - 1, 9), adminId);
            await fulfil(
              result.orderId,
              daysAgo(age - 1, 15),
              daysAgo(-1, 12),
              adminId,
              courierId,
              false,
            );
            status = "SHIPPED";
          } else if (age > 2) {
            await advance(result.orderId, "PROCESSING", daysAgo(age, 16), adminId);
            status = "PROCESSING";
          }
        }

        placed.push({
          id: result.orderId,
          companyId: company.id,
          repId: company.repId,
          placedAt,
          status,
          total: Number(result.grandTotal),
          paymentMethod,
        });
      } catch (e) {
        // Stoku biten bir kalem ya da limiti dolan bir cari: gösterim verisinde
        // ikisi de olağan. Sayılıyor, betik durmuyor.
        failed += 1;
        if (failed <= 3) {
          console.log(`  · atlandı (${company.name}): ${(e as Error).message}`);
        }
      }
    }
  }

  // Birkaç iptal: iptal edilmiş sipariş, stoğun geri gelişini ve cari ters
  // kaydını gösteren tek örnek.
  const cancellable = placed.filter((o) => o.status === "PROCESSING").slice(0, 3);
  for (const o of cancellable) {
    await advance(o.id, "CANCELLED", daysAgo(1, 12), adminId);
    o.status = "CANCELLED";
  }

  const byStatus = placed.reduce<Record<string, number>>((acc, o) => {
    acc[o.status] = (acc[o.status] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    `✓ ${placed.length} sipariş (${Object.entries(byStatus)
      .map(([s, n]) => `${n} ${s.toLowerCase()}`)
      .join(", ")})${failed > 0 ? `, ${failed} atlandı` : ""}.`,
  );
  return placed;
}

/**
 * Onay bekleyen siparişler.
 *
 * Onay akışı yalnızca **bayinin kendi personeli** sipariş verdiğinde işliyor;
 * plasiyerin girdiği sipariş satıcı tarafındandır ve kimseden onay beklemez. Bu
 * yüzden onay ekranının verisi ancak portalden verilmiş bir siparişle doğuyor.
 */
async function seedApprovalQueue(variants: DemoVariant[]): Promise<void> {
  const staff = await prisma.user.findMany({
    where: { role: "COMPANY_STAFF", isActive: true, companyId: { not: null } },
    select: { id: true, companyId: true },
    take: 3,
  });

  let n = 0;
  for (const u of staff) {
    const companyId = u.companyId!;
    const waiting = await prisma.order.count({
      where: { companyId, status: "PENDING_APPROVAL" },
    });
    if (waiting > 0) continue;

    await prisma.company.update({
      where: { id: companyId },
      data: { requiresOrderApproval: true },
    });

    const items = [0, 1, 2].map((i) => {
      const v = variants[(i * 5) % variants.length]!;
      return { variantId: v.id, quantity: Math.max(v.moqUnits, 2 * v.unitsPerCase) };
    });

    try {
      const result = await createOrder(
        { companyId, paymentMethod: "OPEN_ACCOUNT", items, note: "Portalden verildi" },
        { createdById: u.id, createdByRole: "COMPANY_STAFF" },
      );
      await backdateOrder(result.orderId, daysAgo(between(1, 4), 11));
      n += 1;
    } catch {
      // Limiti dolu ya da stoğu biten bir kalem: onay kuyruğu gösterimi bir
      // siparişle de anlaşılıyor.
    }
  }
  console.log(`✓ ${n} sipariş onay kuyruğunda (bayi personeli verdi).`);
}

// ─────────────────────────────────────────────
// 4. TAHSİLAT
// ─────────────────────────────────────────────

const COLLECTION_METHODS: readonly CollectionMethod[] = [
  "CASH",
  "CASH",
  "BANK_TRANSFER",
  "BANK_TRANSFER",
  "CHEQUE",
];

async function seedCollections(orders: PlacedOrder[]): Promise<void> {
  const delivered = orders.filter(
    (o) => o.status === "DELIVERED" && o.paymentMethod === "OPEN_ACCOUNT",
  );

  let n = 0;
  for (const order of delivered) {
    // Her borç kapanmıyor: kapanmayanlar yaşlandırma raporunun kendisi.
    const roll = rnd();
    if (roll > 0.8) continue;
    const ratio = roll > 0.55 ? 0.4 + rnd() * 0.3 : 1;
    const amount = Math.round(order.total * ratio * 100) / 100;
    if (amount < 1) continue;

    const method = pick(COLLECTION_METHODS);
    const collectedAt = new Date(order.placedAt.getTime() + between(5, 30) * DAY);
    if (collectedAt > today) continue;

    const result = await recordPayment(
      {
        companyId: order.companyId,
        amount,
        collectionMethod: method,
        description: ratio === 1 ? "Tahsilat" : "Kısmi tahsilat",
        ...(method === "CHEQUE"
          ? {
              cheque: {
                serialNumber: `ÇK${between(100000, 999999)}`,
                bankName: pick(["Ziraat", "İş Bankası", "Halkbank", "Vakıfbank"]),
                dueDate: new Date(collectedAt.getTime() + between(30, 90) * DAY),
              },
            }
          : {}),
      },
      order.repId,
    );

    await prisma.transaction.update({
      where: { id: result.transactionId },
      data: { createdAt: collectedAt },
    });
    if (result.cashMovementId) {
      await prisma.cashMovement.update({
        where: { id: result.cashMovementId },
        data: { occurredAt: collectedAt, createdAt: collectedAt },
      });
    }
    if (result.chequeId) {
      await prisma.cheque.update({
        where: { id: result.chequeId },
        data: { createdAt: collectedAt },
      });
    }
    n += 1;
  }
  console.log(`✓ ${n} tahsilat (nakit, havale, çek).`);
}

// ─────────────────────────────────────────────
// 5. SAHA: ZİYARET, ÇAĞRI, HEDEF
// ─────────────────────────────────────────────

const VISIT_NOTES = [
  "Sipariş alındı, raf düzeni kontrol edildi.",
  "Ürün tanıtımı yapıldı, numune bırakıldı.",
  "Vadesi gelen bakiye hatırlatıldı.",
  "Yeni kampanya anlatıldı.",
  "Soğuk dolap yerleşimi konuşuldu.",
  "Müşteri yoktu, ikinci kez uğranacak.",
  "Sipariş listesi hazırlandı, yarın onaylanacak.",
];

async function seedVisits(companies: SeededCompany[], adminId: string): Promise<void> {
  const byRep = new Map<string, SeededCompany[]>();
  for (const c of companies) {
    const list = byRep.get(c.repId) ?? [];
    list.push(c);
    byRep.set(c.repId, list);
  }

  let visits = 0;
  for (const [repId, list] of byRep) {
    // Her plasiyer haftada beş gün sahada, günde 2-4 nokta. Sekiz hafta
    // geriye gidiliyor: haftalık rapor da aylık rapor da dolu çıksın.
    for (let day = 1; day <= 56; day++) {
      const date = new Date(today.getTime() - day * DAY);
      const weekday = date.getDay();
      if (weekday === 0) continue; // pazar

      const stops = between(2, 4);
      let hour = 9;
      for (let s = 0; s < stops; s++) {
        const company = pick(list);
        const checkInAt = new Date(date);
        checkInAt.setHours(hour, between(0, 55), 0, 0);
        const duration = between(12, 65);
        const checkOutAt = new Date(checkInAt.getTime() + duration * 60_000);
        hour += between(1, 2);
        if (hour > 18) break;

        await prisma.checkIn.create({
          data: {
            salesRepId: repId,
            companyId: company.id,
            // Kapının koordinatı, birkaç metre kaydırılmış: telefonun GPS'i de
            // zaten tam kapının üstünü göstermiyor.
            latitude: company.lat + (rnd() - 0.5) * 0.0016,
            longitude: company.lng + (rnd() - 0.5) * 0.0016,
            checkInAt,
            checkOutAt,
            durationMinutes: duration,
            note: pick(VISIT_NOTES),
            source: rnd() > 0.15 ? "MOBILE" : "WEB",
          },
        });
        visits += 1;
      }
    }
  }

  // Açık ziyaret çağrıları: bayinin "uğrayın" dediği, plasiyerin listesinde
  // bekleyen işler.
  let requests = 0;
  for (const company of companies) {
    if (rnd() > 0.4) continue;
    const requestedFor = new Date(today.getTime() + between(0, 6) * DAY);
    await prisma.visitRequest.create({
      data: {
        companyId: company.id,
        salesRepId: company.repId,
        requestedFor,
        note: pick([
          "Stok azaldı, sipariş vereceğiz.",
          "Yeni ürünleri görmek istiyoruz.",
          "Bakiye mutabakatı yapalım.",
          "İade edilecek mal var.",
        ]),
        status: rnd() > 0.5 ? "OPEN" : "PLANNED",
        sortIndex: requests,
        createdById: adminId,
      },
    });
    requests += 1;
  }

  console.log(`✓ ${visits} ziyaret kaydı, ${requests} ziyaret çağrısı.`);
}

async function seedTargets(repIds: string[], adminId: string): Promise<void> {
  let n = 0;
  for (const repId of repIds) {
    for (let back = 0; back < 3; back++) {
      const month = new Date(today.getFullYear(), today.getMonth() - back, 1);
      const periodStart = normalizePeriodStart("MONTHLY", month);
      for (const [metric, value] of [
        ["REVENUE", between(400, 900) * 1000],
        ["VISITS", between(40, 70)],
      ] as const) {
        await prisma.salesTarget.upsert({
          where: {
            salesRepId_metric_period_periodStart: {
              salesRepId: repId,
              metric,
              period: "MONTHLY",
              periodStart,
            },
          },
          update: { targetValue: value },
          create: {
            salesRepId: repId,
            metric,
            period: "MONTHLY",
            periodStart,
            targetValue: value,
            createdById: adminId,
            note: "Gösterim hedefi",
          },
        });
        n += 1;
      }
    }
  }
  console.log(`✓ ${n} saha hedefi (3 ay × ciro + ziyaret).`);
}

// ─────────────────────────────────────────────
// ANA AKIŞ
// ─────────────────────────────────────────────

async function main(): Promise<void> {
  assertNotProduction();

  // Temizlik her şeyden önce: kadro sorgusu silinecek hesapları da getirirse,
  // gösterim firmaları birazdan silinmiş bir plasiyere bağlanır.
  await cleanup();
  await cleanupStamped();

  const admin = await prisma.user.findFirst({
    where: { role: "SUPER_ADMIN" },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true },
  });
  if (!admin) {
    console.error("HATA: süper admin yok. Önce db:bootstrap ya da db:seed-demo.");
    process.exit(1);
  }

  const reps = await prisma.user.findMany({
    where: { role: "SALES_REP", isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  if (reps.length === 0) {
    console.error("HATA: plasiyer yok. Önce db:seed-demo.");
    process.exit(1);
  }
  const repIds = [reps[0]!.id, reps[1]?.id ?? reps[0]!.id, reps[2]?.id ?? reps[0]!.id];

  const already = await prisma.company.count({
    where: { externalCode: { startsWith: "DMO-" } },
  });
  if (already > 0 && process.env.DEMO_SEED_FORCE !== "1") {
    console.log(
      `• Gösterim verisi zaten yüklü (${already} firma). Üstüne yazmak için DEMO_SEED_FORCE=1.`,
    );
    return;
  }

  // İskelet: grup, kategori, vade, depo, kasa. Gösterim firmaları gruplara
  // bağlanacağı için bu adım siparişlerden önce gelmek zorunda.
  const pack = await applySetupPack("gida-toptan");
  console.log(
    `✓ Sektör paketi: ${Object.entries(pack.created)
      .map(([k, v]) => `${v} ${k.toLowerCase()}`)
      .join(", ") || "eksik yoktu"}.`,
  );

  const variantRows = await prisma.productVariant.findMany({
    where: { sku: { startsWith: "GD-" }, isActive: true },
    select: {
      id: true,
      sku: true,
      unitsPerCase: true,
      moqUnits: true,
      stock: true,
      tracksLots: true,
      shelfLifeDays: true,
      product: { select: { name: true } },
    },
  });
  if (variantRows.length === 0) {
    console.error("HATA: gıda kataloğu yok. Önce db:seed-gida.");
    process.exit(1);
  }
  const variants: DemoVariant[] = variantRows.map((v) => ({
    id: v.id,
    sku: v.sku,
    name: v.product.name,
    unitsPerCase: v.unitsPerCase,
    moqUnits: v.moqUnits,
    tracksLots: v.tracksLots,
    shelfLifeDays: v.shelfLifeDays,
    stock: v.stock,
  }));

  const couriers = await prisma.user.findMany({
    where: { role: "COURIER", isActive: true },
    select: { id: true },
  });

  const companies = await seedCompanies(repIds);
  await purgeDemoActivity(companies.map((c) => c.id));
  await seedStock(variants, admin.id);
  const orders = await seedOrders(
    companies,
    variants,
    admin.id,
    couriers.map((c) => c.id),
  );
  await seedApprovalQueue(variants);
  await seedCollections(orders);
  await seedVisits(companies, admin.id);
  await seedTargets(repIds, admin.id);

  const [companyCount, orderCount, checkInCount, txnCount] = await Promise.all([
    prisma.company.count(),
    prisma.order.count(),
    prisma.checkIn.count(),
    prisma.transaction.count(),
  ]);
  console.log(
    `\nHazır: ${companyCount} firma, ${orderCount} sipariş, ${checkInCount} ziyaret, ${txnCount} cari hareket.`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
