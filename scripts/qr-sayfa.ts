// Bağlantı sayfası: adresler + QR kodları, tek bir HTML dosyası.
//
// Neden: sunumda telefona adres yazdırmak istemiyoruz. Hızlı tünel adresi
// (`kucuk-mavi-kus-1234.trycloudflare.com`) elle yazılacak bir şey değil, ve
// mobil uygulamada sunucu adresi bir cihaz ayarı — kameraya okutmak tek
// makul yol.
//
// QR çizimi depodaki `qrSvg` ile yapılıyor (bağımlılıksız, `packages/services`
// içinde zaten var). Dışarıdaki bir QR *servisine* adres göndermek, kurulumun
// adresini üçüncü bir tarafa bildirmek olurdu.
//
// Kullanım:
//   npx tsx scripts/qr-sayfa.ts "http://192.168.1.20:3000" "https://xyz.trycloudflare.com" "demo" "parola"

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { qrSvg } from "../packages/services/src/qr";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "var", "baglan.html");

const [lan, publicUrl, user, pass] = process.argv.slice(2);

function card(title: string, url: string, note: string): string {
  if (!url) return "";
  return `
    <section>
      <h2>${title}</h2>
      <a class="url" href="${url}">${url}</a>
      <p class="note">${note}</p>
      ${qrSvg(url, { scale: 5 })}
    </section>`;
}

const credentials =
  user && pass
    ? `<p class="cred">Dış adres parola soruyor — kullanıcı <b>${user}</b>, parola <b>${pass}</b></p>`
    : "";

const html = `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>B2B — bağlantı adresleri</title>
<style>
  body { font: 15px/1.5 system-ui, sans-serif; margin: 0; padding: 32px;
         background: #f6f6f5; color: #18181b; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: #71717a; margin: 0 0 24px; }
  .grid { display: flex; flex-wrap: wrap; gap: 20px; }
  section { background: #fff; border: 1px solid #e4e4e7; border-radius: 10px;
            padding: 20px; max-width: 340px; }
  h2 { font-size: 14px; text-transform: uppercase; letter-spacing: .06em;
       color: #71717a; margin: 0 0 10px; }
  .url { display: block; font-family: ui-monospace, Consolas, monospace;
         font-size: 13px; word-break: break-all; margin-bottom: 6px; color: #18181b; }
  .note { color: #71717a; font-size: 13px; margin: 0 0 14px; }
  .cred { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px;
          padding: 12px 14px; max-width: 720px; }
  svg { width: 100%; height: auto; }
</style>
</head>
<body>
  <h1>B2B gösterim sunucusu</h1>
  <p class="sub">Bu sayfa yerelde üretildi; adresler dışarı gönderilmedi.</p>
  ${credentials}
  <div class="grid">
    ${card("Aynı ağdaki cihaz", lan, "Telefon aynı wifi'deyse bunu okut. Mobil uygulamada sunucu adresi olarak da bu girilir.")}
    ${card("Dış erişim", publicUrl, "Tünel açık olduğu sürece geçerli. Sunucu kapanınca adres ölür.")}
  </div>
</body>
</html>`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html, "utf8");
// eslint-disable-next-line no-console
console.log(OUT);
