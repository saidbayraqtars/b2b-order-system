import type { MailMessage } from "./mail";

// E-mail bodies, in one place so wording and layout stay consistent and can be
// reviewed without reading the services that send them.
//
// Every template returns plain text as well as HTML. The text is not a fallback
// afterthought: it is what lands in a client that blocks HTML, and it is what
// the console transport prints during development.

const SIGNATURE = "B2B Sipariş Sistemi";

function layout(title: string, body: string, action?: { label: string; href: string }) {
  return `<!-- ${title} -->
<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:14px;color:#171717;line-height:1.6">
  <h2 style="font-size:18px;margin:0 0 12px">${title}</h2>
  ${body}
  ${
    action
      ? `<p style="margin:20px 0"><a href="${action.href}" style="background:#4f46e5;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block">${action.label}</a></p>
  <p style="color:#737373;font-size:12px">Buton çalışmazsa bu adresi tarayıcınıza yapıştırın:<br>${action.href}</p>`
      : ""
  }
  <p style="color:#737373;font-size:12px;margin-top:24px">${SIGNATURE}</p>
</div>`;
}

export function passwordResetMail(params: {
  name: string;
  link: string;
  ttlMinutes: number;
}): Omit<MailMessage, "to"> {
  const subject = "Şifre sıfırlama";
  const text = [
    `Merhaba ${params.name},`,
    "",
    "Şifrenizi sıfırlamak için aşağıdaki bağlantıyı açın:",
    params.link,
    "",
    `Bağlantı ${params.ttlMinutes} dakika geçerli ve yalnızca bir kez kullanılabilir.`,
    "Bu isteği siz yapmadıysanız hiçbir şey yapmanıza gerek yok — mevcut şifreniz geçerliliğini koruyor.",
    "",
    SIGNATURE,
  ].join("\n");

  return {
    subject,
    text,
    html: layout(
      subject,
      `<p>Merhaba ${params.name},</p>
       <p>Şifrenizi sıfırlamak için aşağıdaki butonu kullanın. Bağlantı
       <strong>${params.ttlMinutes} dakika</strong> geçerli ve yalnızca bir kez
       kullanılabilir.</p>
       <p style="color:#737373">Bu isteği siz yapmadıysanız bir şey yapmanıza gerek yok;
       mevcut şifreniz geçerliliğini koruyor.</p>`,
      { label: "Şifremi sıfırla", href: params.link },
    ),
  };
}

export function orderPlacedMail(params: {
  orderNumber: string;
  companyName: string;
  grandTotal: string;
  status: string;
  needsApproval: boolean;
  link: string;
}): Omit<MailMessage, "to"> {
  const subject = params.needsApproval
    ? `Onay bekleyen sipariş: ${params.orderNumber}`
    : `Sipariş alındı: ${params.orderNumber}`;

  const lead = params.needsApproval
    ? "Firmanız adına onay bekleyen bir sipariş oluşturuldu."
    : "Siparişiniz alındı.";

  const text = [
    lead,
    "",
    `Sipariş : ${params.orderNumber}`,
    `Firma   : ${params.companyName}`,
    `Tutar   : ${params.grandTotal} ₺`,
    `Durum   : ${params.status}`,
    "",
    params.link,
    "",
    SIGNATURE,
  ].join("\n");

  return {
    subject,
    text,
    html: layout(
      subject,
      `<p>${lead}</p>
       <table style="border-collapse:collapse">
         <tr><td style="padding:2px 12px 2px 0;color:#737373">Sipariş</td><td>${params.orderNumber}</td></tr>
         <tr><td style="padding:2px 12px 2px 0;color:#737373">Firma</td><td>${params.companyName}</td></tr>
         <tr><td style="padding:2px 12px 2px 0;color:#737373">Tutar</td><td>${params.grandTotal} ₺</td></tr>
         <tr><td style="padding:2px 12px 2px 0;color:#737373">Durum</td><td>${params.status}</td></tr>
       </table>`,
      { label: "Siparişi aç", href: params.link },
    ),
  };
}

export function orderStatusMail(params: {
  orderNumber: string;
  status: string;
  note: string | null;
  link: string;
}): Omit<MailMessage, "to"> {
  const subject = `Sipariş ${params.orderNumber}: ${params.status}`;
  const text = [
    `${params.orderNumber} numaralı siparişin durumu değişti: ${params.status}.`,
    ...(params.note ? ["", `Not: ${params.note}`] : []),
    "",
    params.link,
    "",
    SIGNATURE,
  ].join("\n");

  return {
    subject,
    text,
    html: layout(
      subject,
      `<p><strong>${params.orderNumber}</strong> numaralı siparişin durumu
       <strong>${params.status}</strong> olarak güncellendi.</p>
       ${params.note ? `<p style="color:#737373">Not: ${params.note}</p>` : ""}`,
      { label: "Siparişi aç", href: params.link },
    ),
  };
}

export function invoiceIssuedMail(params: {
  documentNumber: string;
  orderNumber: string;
  grandTotal: string;
  dueDate: string;
  link: string;
}): Omit<MailMessage, "to"> {
  const subject = `Fatura ${params.documentNumber}`;
  const text = [
    `${params.orderNumber} numaralı sipariş için fatura kesildi.`,
    "",
    `Fatura no : ${params.documentNumber}`,
    `Tutar     : ${params.grandTotal} ₺`,
    `Vade      : ${params.dueDate}`,
    "",
    params.link,
    "",
    SIGNATURE,
  ].join("\n");

  return {
    subject,
    text,
    html: layout(
      subject,
      `<p><strong>${params.orderNumber}</strong> numaralı sipariş için fatura kesildi.</p>
       <table style="border-collapse:collapse">
         <tr><td style="padding:2px 12px 2px 0;color:#737373">Fatura no</td><td>${params.documentNumber}</td></tr>
         <tr><td style="padding:2px 12px 2px 0;color:#737373">Tutar</td><td>${params.grandTotal} ₺</td></tr>
         <tr><td style="padding:2px 12px 2px 0;color:#737373">Vade</td><td>${params.dueDate}</td></tr>
       </table>`,
      { label: "Faturayı görüntüle", href: params.link },
    ),
  };
}
