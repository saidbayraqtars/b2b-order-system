import { prisma } from "@repo/database";
import type { OrderStatus } from "@prisma/client";
import { BusinessError } from "./errors";
import { Dec, round2, ZERO, type Money } from "./money";
import { qty } from "./quantity";

// Siparişi müşterinin ERP'sine yazmak — b2b tarafı.
//
// Yön burada tersine dönüyor. Okuma tarafında ajan bize gönderiyor
// ([[erp-ingest]]); yazma tarafında **biz ajana bir komut gönderiyoruz**, ajanın
// yanındaki Cloudflare Tunnel üzerinden:
//
//   b2b  ──"writeOrder" + normalize satırlar──▶  tünel  ──▶  ajan  ──▶  VegaDB
//
// Gönderdiğimiz şey SQL **değil**. Komutun adı ve siparişin satırları gidiyor;
// hangi tabloya nasıl yazılacağını bilen taraf, müşterinin kendi makinesindeki
// ajan. Bu, okuma tarafındaki güvenlik sınırının aynısı: b2b sunucusunu ele
// geçiren biri, ajanın kendi kodunda yazılı üç komuttan başkasını çalıştıramaz.
//
// **Kuyruk yok, yeni tablo yok.** Siparişin kendisi kuyruk: `Order` zaten
// burada duruyor, aktarılıp aktarılmadığı da onun üzerinde (`erpDocumentNo`).
// Ayrı bir "aktarım kuyruğu" tablosu, siparişle çelişebilecek ikinci bir liste
// olurdu.

/** Aktarılabilecek durumlar. */
const PUSHABLE: readonly OrderStatus[] = [
  "CONFIRMED",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
];

const REQUEST_TIMEOUT_MS = 60_000;

export interface ErpPushEndpoint {
  url: string;
  token: string;
  accessClientId: string | null;
  accessClientSecret: string | null;
}

/**
 * Ajanın adresi ve komut token'ı — **ortamdan**, veritabanından değil.
 *
 * Sanal POS sağlayıcısının sırrı da böyle duruyor ve gerekçe aynı: bu token
 * müşterinin muhasebe veritabanına yazma yetkisinin anahtarı. Veritabanında
 * dursaydı, bir yedek dosyasını eline geçiren kişi de eline geçirirdi.
 * Yapılandırılmamışsa özellik yok — düğme çıkmaz, uç 501 döner.
 */
export function erpPushEndpoint(): ErpPushEndpoint | null {
  const url = (process.env.ERP_AGENT_URL ?? "").trim().replace(/\/+$/, "");
  const token = (process.env.ERP_AGENT_TOKEN ?? "").trim();
  if (!url || !token) return null;
  return {
    url,
    token,
    accessClientId: (process.env.ERP_AGENT_ACCESS_CLIENT_ID ?? "").trim() || null,
    accessClientSecret: (process.env.ERP_AGENT_ACCESS_CLIENT_SECRET ?? "").trim() || null,
  };
}

export interface ErpCommandResponse {
  ok: boolean;
  code?: string;
  message?: string;
  result?: unknown;
}

/**
 * Ajana bir komut gönderir.
 *
 * Cloudflare Access hizmet token'ı ayarlıysa başlıklara eklenir: tünelin önünde
 * duran kapı, ajanın kendi token'ının yerine değil **önüne** geçiyor.
 */
async function sendCommand(
  endpoint: ErpPushEndpoint,
  command: string,
  requestId: string,
  payload: unknown,
): Promise<ErpCommandResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${endpoint.token}`,
  };
  if (endpoint.accessClientId && endpoint.accessClientSecret) {
    headers["CF-Access-Client-Id"] = endpoint.accessClientId;
    headers["CF-Access-Client-Secret"] = endpoint.accessClientSecret;
  }

  const res = await fetch(`${endpoint.url}/command`, {
    method: "POST",
    headers,
    body: JSON.stringify({ command, requestId, payload }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const text = await res.text();
  let body: ErpCommandResponse;
  try {
    body = JSON.parse(text) as ErpCommandResponse;
  } catch {
    // A tunnel that is down answers with Cloudflare's own HTML error page, and
    // "Unexpected token <" would tell the operator nothing about which of the
    // two hops failed.
    throw new BusinessError(
      "ERP_WRITE_FAILED",
      `ERP ajanı beklenmeyen bir yanıt verdi (HTTP ${res.status}). ` +
        `Tünel ve ajan ayakta mı kontrol edin.`,
    );
  }
  return body;
}

/**
 * Yönetim ekranından çalıştırılabilen komutlar — **yalnızca okuyanlar**.
 *
 * `writeOrder` bu listede yok ve olmayacak: bir belge, yönetim ekranındaki
 * genel bir "komut çalıştır" kutusundan değil, siparişinin kendi ekranındaki
 * onaydan gider. Buradaki ikisi kurulum işi — tünel ayakta mı, sipariş
 * tabloları bu kurulumda neye benziyor.
 */
const DIAGNOSTIC_COMMANDS = ["ping", "describeOrderTables"] as const;
export type ErpDiagnosticCommand = (typeof DIAGNOSTIC_COMMANDS)[number];

export function isErpDiagnosticCommand(value: unknown): value is ErpDiagnosticCommand {
  return DIAGNOSTIC_COMMANDS.includes(value as ErpDiagnosticCommand);
}

/** Ajana teşhis komutu gönderir. Hiçbir şey yazmaz, hiçbir kayıt tutmaz. */
export async function runErpDiagnostic(command: ErpDiagnosticCommand): Promise<unknown> {
  const endpoint = erpPushEndpoint();
  if (!endpoint) {
    throw new BusinessError(
      "ERP_WRITE_DISABLED",
      "ERP ajanının adresi tanımlı değil (ERP_AGENT_URL / ERP_AGENT_TOKEN).",
    );
  }

  let response: ErpCommandResponse;
  try {
    response = await sendCommand(endpoint, command, `diag-${command}`, {});
  } catch (e) {
    if (e instanceof BusinessError) throw e;
    throw new BusinessError(
      "ERP_WRITE_FAILED",
      `ERP ajanına ulaşılamadı: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  if (!response.ok) {
    throw new BusinessError(
      "ERP_WRITE_FAILED",
      response.message?.trim() || `ERP ajanı reddetti (${response.code ?? "HATA"})`,
    );
  }
  return response.result ?? {};
}

export interface ErpWriteOrderResult {
  documentNumber: string;
  documentInd: number;
  lineCount: number;
  duplicate: boolean;
  omittedColumns: string[];
}

export interface ErpPushStatus {
  /** Ortam yapılandırılmış mı — düğmenin görünüp görünmeyeceği. */
  configured: boolean;
  documentNo: string | null;
  documentInd: number | null;
  pushedAt: string | null;
  pushedByName: string | null;
  error: string | null;
  /** Şu an aktarılabilir mi, aktarılamıyorsa nedeni. */
  canPush: boolean;
  reason: string | null;
}

function reasonNotPushable(status: OrderStatus): string | null {
  if (PUSHABLE.includes(status)) return null;
  if (status === "CANCELLED" || status === "REJECTED") {
    return "İptal/reddedilmiş sipariş ERP'ye aktarılmaz.";
  }
  return "Sipariş önce onaylanmalı — onaylanmamış sipariş bir taahhüt değil.";
}

export async function getErpPushStatus(orderId: string): Promise<ErpPushStatus> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      status: true,
      erpDocumentNo: true,
      erpDocumentInd: true,
      erpPushedAt: true,
      erpPushError: true,
      erpPushedBy: { select: { name: true } },
    },
  });
  if (!order) {
    throw new BusinessError("ORDER_NOT_FOUND", "Sipariş bulunamadı", { orderId });
  }

  const configured = erpPushEndpoint() !== null;
  const already = Boolean(order.erpDocumentNo);
  const reason = already
    ? "Bu sipariş ERP'ye zaten aktarıldı."
    : (reasonNotPushable(order.status) ??
      (configured ? null : "ERP ajanının adresi bu kurulumda tanımlı değil."));

  return {
    configured,
    documentNo: order.erpDocumentNo,
    documentInd: order.erpDocumentInd,
    pushedAt: order.erpPushedAt?.toISOString() ?? null,
    pushedByName: order.erpPushedBy?.name ?? null,
    error: order.erpPushError,
    canPush: configured && !already && reason === null,
    reason,
  };
}

interface PayloadLine {
  productCode: string;
  name: string;
  quantity: number;
  unit: string | null;
  unitPrice: number;
  lineTotal: number;
  vatRate: number;
  note: string | null;
}

/**
 * Siparişi ERP'ye aktarır.
 *
 * İki koruma burada, ajana gitmeden önce:
 *
 *  - **Eşleşmeyen kod varsa hiç gönderilmez.** Ajan da reddederdi, ama hatayı
 *    burada üretmek operatöre hangi ürünün eşleşmediğini söylüyor — tünelin
 *    öbür ucundan dönen mesaj değil, kendi kataloğumuzun dili.
 *  - **Zaten aktarılmışsa gönderilmez.** İkinci koruma ajanda: sipariş numarası
 *    belgeye yazılıyor ve orada da aranıyor. İkisi birlikte, "iki kez tıklandı"
 *    ile "iki kez yazıldı" arasındaki farkı kapatıyor.
 */
export async function pushOrderToErp(
  orderId: string,
  actor: { userId: string },
): Promise<ErpWriteOrderResult> {
  const endpoint = erpPushEndpoint();
  if (!endpoint) {
    throw new BusinessError(
      "ERP_WRITE_DISABLED",
      "ERP ajanının adresi tanımlı değil (ERP_AGENT_URL / ERP_AGENT_TOKEN).",
    );
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      currency: true,
      note: true,
      shippingFee: true,
      createdAt: true,
      erpDocumentNo: true,
      company: { select: { id: true, name: true, externalCode: true } },
      items: {
        select: {
          productName: true,
          sku: true,
          quantity: true,
          lineTotal: true,
          promotionDiscount: true,
          vatRate: true,
          variant: { select: { externalCode: true, unit: true } },
        },
        orderBy: { productName: "asc" },
      },
    },
  });
  if (!order) {
    throw new BusinessError("ORDER_NOT_FOUND", "Sipariş bulunamadı", { orderId });
  }
  if (order.erpDocumentNo) {
    throw new BusinessError(
      "ERP_ALREADY_PUSHED",
      `Bu sipariş ERP'ye zaten aktarıldı (belge ${order.erpDocumentNo}).`,
    );
  }
  const notPushable = reasonNotPushable(order.status);
  if (notPushable) {
    throw new BusinessError("ERP_WRITE_NOT_ALLOWED", notPushable);
  }
  if (order.items.length === 0) {
    throw new BusinessError("EMPTY_ORDER", "Siparişte satır yok");
  }
  if (!order.company.externalCode) {
    throw new BusinessError(
      "ERP_MAPPING_MISSING",
      `${order.company.name} firmasının ERP cari kodu tanımlı değil. ` +
        `Firma kartındaki "ERP kodu" alanını doldurun.`,
    );
  }

  const unmatched = order.items
    .filter((i) => !i.variant.externalCode)
    .map((i) => `${i.sku} (${i.productName})`);
  if (unmatched.length > 0) {
    // Kısmi aktarım yok: eksik satırla yazılmış bir sipariş, ERP'de doğru
    // görünüp yanlış olan bir belge demek.
    throw new BusinessError(
      "ERP_MAPPING_MISSING",
      `ERP stok kodu olmayan satır var: ${unmatched.slice(0, 5).join(", ")}` +
        (unmatched.length > 5 ? ` (+${unmatched.length - 5} tane daha)` : ""),
      { unmatched },
    );
  }

  let netTotal: Money = ZERO;
  let vatTotal: Money = ZERO;
  const lines: PayloadLine[] = order.items.map((item) => {
    // Satırın ERP'ye giden net tutarı: kendi iskontoları zaten `lineTotal`'ın
    // içinde düşülmüş, kampanya indirimi ayrı duruyor ve buradan düşülüyor.
    // Bedelsiz (isGift) satır böylece sıfıra iniyor — bedeli olmayan mal,
    // siparişte de bedelsiz görünmeli.
    const net = round2(item.lineTotal.minus(item.promotionDiscount));
    const vat = round2(net.times(item.vatRate).dividedBy(100));
    netTotal = netTotal.plus(net);
    vatTotal = vatTotal.plus(vat);

    const unitPrice = item.quantity.gt(0) ? net.dividedBy(item.quantity) : ZERO;
    return {
      productCode: item.variant.externalCode!,
      name: item.productName,
      // Kesir ERP'ye olduğu gibi gidiyor: 0,750 kg'lık satır ERP'de de 0,750.
      quantity: qty(item.quantity),
      unit: item.variant.unit,
      unitPrice: Number(unitPrice.toDecimalPlaces(4).toFixed(4)),
      lineTotal: Number(net.toFixed(2)),
      vatRate: item.vatRate,
      note: null,
    };
  });

  // Kargo bedeli belgeye **satır olarak girmiyor**: karşılığı bir stok kartı
  // olmayan bir satır, ERP'de eşleşmeyen bir kalem demek. Nota yazılıyor ki
  // faturayı Vega'da kesen kişi rakamı görsün.
  const shipping = new Dec(order.shippingFee);
  const noteParts = [`b2b sipariş ${order.orderNumber}`];
  if (order.note?.trim()) noteParts.push(order.note.trim());
  if (shipping.greaterThan(0)) {
    noteParts.push(`Kargo bedeli: ${shipping.toFixed(2)} (siparişe satır olarak yazılmadı)`);
  }

  const payload = {
    reference: order.orderNumber,
    customerCode: order.company.externalCode,
    date: order.createdAt.toISOString(),
    currency: order.currency,
    exchangeRate: 1,
    note: noteParts.join(" · "),
    netTotal: Number(netTotal.toFixed(2)),
    grandTotal: Number(netTotal.plus(vatTotal).toFixed(2)),
    lines,
  };

  const run = await prisma.erpSyncRun.create({
    data: { kind: "ORDER_WRITE", status: "RUNNING", received: 1 },
    select: { id: true },
  });

  const fail = async (message: string): Promise<never> => {
    await prisma.erpSyncRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        skipped: 1,
        error: message.slice(0, 500),
        finishedAt: new Date(),
        // Aktarılamayan belge, eşleşmeyen cari kodu gibi: operatörün elinde
        // kalan tek şey numarası olsun.
        issues: {
          create: {
            externalCode: order.orderNumber,
            label: order.company.name,
            reason: message.slice(0, 500),
          },
        },
      },
    });
    await prisma.order.update({
      where: { id: order.id },
      data: { erpPushError: message.slice(0, 500) },
    });
    throw new BusinessError("ERP_WRITE_FAILED", message);
  };

  let response: ErpCommandResponse;
  try {
    response = await sendCommand(endpoint, "writeOrder", order.id, payload);
  } catch (e) {
    if (e instanceof BusinessError) return fail(e.message);
    const reason = e instanceof Error ? e.message : String(e);
    return fail(`ERP ajanına ulaşılamadı: ${reason}`);
  }

  if (!response.ok) {
    return fail(response.message?.trim() || `ERP ajanı reddetti (${response.code ?? "HATA"})`);
  }

  const result = (response.result ?? {}) as Partial<ErpWriteOrderResult>;
  const documentNumber = String(result.documentNumber ?? "").trim();
  const documentInd = Number(result.documentInd ?? 0);
  if (!documentNumber || !Number.isFinite(documentInd) || documentInd <= 0) {
    return fail("ERP ajanı belge numarası döndürmedi — belge yazıldıysa elle kontrol edin.");
  }

  await prisma.$transaction([
    prisma.order.update({
      where: { id: order.id },
      data: {
        erpDocumentNo: documentNumber,
        erpDocumentInd: documentInd,
        erpPushedAt: new Date(),
        erpPushedById: actor.userId,
        erpPushError: null,
      },
    }),
    prisma.erpSyncRun.update({
      where: { id: run.id },
      data: { status: "SUCCEEDED", applied: 1, finishedAt: new Date() },
    }),
  ]);

  return {
    documentNumber,
    documentInd,
    lineCount: Number(result.lineCount ?? lines.length),
    duplicate: Boolean(result.duplicate),
    omittedColumns: Array.isArray(result.omittedColumns) ? result.omittedColumns : [],
  };
}
