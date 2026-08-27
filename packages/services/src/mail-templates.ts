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

// ─────────────────────────────────────────────
// BAYİ BAŞVURUSU
// ─────────────────────────────────────────────

/**
 * "Başvurunuz alındı" — formu dolduran kişiye giden alındı bilgisi.
 *
 * Bilerek hiçbir söz vermiyor ("en kısa sürede", "onaylanacaktır" yok): bu
 * e-posta bir kabul değil, bir makbuz. Başvuranın elinde, aradığında
 * söyleyeceği bir kayıt kalsın diye ünvan ve tarih tekrarlanıyor.
 */
export function dealerApplicationReceivedMail(params: {
  contactName: string;
  companyName: string;
}): Omit<MailMessage, "to"> {
  const subject = "Bayi başvurunuz alındı";
  const text = [
    `Merhaba ${params.contactName},`,
    "",
    `${params.companyName} adına yaptığınız bayilik başvurusu tarafımıza ulaştı.`,
    "Başvurunuz değerlendirildiğinde sonucunu bu adrese bildireceğiz.",
    "",
    "Bu başvuruyu siz yapmadıysanız bu e-postayı yok sayabilirsiniz; başvuru",
    "tek başına hiçbir hesap açmaz.",
    "",
    SIGNATURE,
  ].join("\n");

  return {
    subject,
    text,
    html: layout(
      subject,
      `<p>Merhaba ${params.contactName},</p>
       <p><strong>${params.companyName}</strong> adına yaptığınız bayilik başvurusu
       tarafımıza ulaştı. Değerlendirildiğinde sonucunu bu adrese bildireceğiz.</p>
       <p style="color:#737373">Bu başvuruyu siz yapmadıysanız bu e-postayı yok
       sayabilirsiniz; başvuru tek başına hiçbir hesap açmaz.</p>`,
    ),
  };
}

/**
 * Onay: firma kartı ve yönetici hesabı açıldı, şifre belirlenecek.
 *
 * Şifre e-postada **yok** ve hiç üretilmiyor. Hesap rastgele, kimsenin
 * bilmediği bir özetle açılıyor; içeri giren tek yol bu bağlantı. Postaya
 * yazılmış bir şifre, kutusu yıllarca açık duran kalıcı bir anahtardır.
 */
export function dealerApplicationApprovedMail(params: {
  contactName: string;
  companyName: string;
  link: string;
  ttlHours: number;
}): Omit<MailMessage, "to"> {
  const subject = "Bayi başvurunuz onaylandı";
  const text = [
    `Merhaba ${params.contactName},`,
    "",
    `${params.companyName} için bayilik başvurunuz onaylandı ve portal hesabınız açıldı.`,
    "",
    "Şifrenizi belirlemek için aşağıdaki bağlantıyı açın:",
    params.link,
    "",
    `Bağlantı ${params.ttlHours} saat geçerli ve yalnızca bir kez kullanılabilir.`,
    "Süresi dolarsa giriş ekranındaki \"Şifremi unuttum\" ile yenisini isteyebilirsiniz.",
    "",
    SIGNATURE,
  ].join("\n");

  return {
    subject,
    text,
    html: layout(
      subject,
      `<p>Merhaba ${params.contactName},</p>
       <p><strong>${params.companyName}</strong> için bayilik başvurunuz onaylandı ve
       portal hesabınız açıldı. Giriş yapabilmek için önce şifrenizi belirleyin.</p>
       <p style="color:#737373">Bağlantı <strong>${params.ttlHours} saat</strong> geçerli
       ve yalnızca bir kez kullanılabilir. Süresi dolarsa giriş ekranındaki
       “Şifremi unuttum” ile yenisini isteyebilirsiniz.</p>`,
      { label: "Şifremi belirle", href: params.link },
    ),
  };
}

/**
 * Ret.
 *
 * Gerekçe e-postaya **girmiyor**: karar notu iç bir kayıt ve çoğu zaman
 * "cari riski", "bölge doluluğu" gibi müşteriye söylenmeyecek bir cümle.
 * Başvurana giden şey kararın kendisi ve konuşulacak bir kapı.
 */
export function dealerApplicationRejectedMail(params: {
  contactName: string;
  companyName: string;
}): Omit<MailMessage, "to"> {
  const subject = "Bayi başvurunuz hakkında";
  const text = [
    `Merhaba ${params.contactName},`,
    "",
    `${params.companyName} adına yaptığınız bayilik başvurusu şu aşamada olumlu`,
    "sonuçlanmadı. İlginiz için teşekkür ederiz.",
    "",
    "Koşullar değiştiğinde yeniden başvurabilirsiniz.",
    "",
    SIGNATURE,
  ].join("\n");

  return {
    subject,
    text,
    html: layout(
      subject,
      `<p>Merhaba ${params.contactName},</p>
       <p><strong>${params.companyName}</strong> adına yaptığınız bayilik başvurusu şu
       aşamada olumlu sonuçlanmadı. İlginiz için teşekkür ederiz.</p>
       <p style="color:#737373">Koşullar değiştiğinde yeniden başvurabilirsiniz.</p>`,
    ),
  };
}
