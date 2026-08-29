// Dış erişim kapısı — Basic Auth + ters vekil.
//
// Neden var: hızlı tünel (`trycloudflare.com`) adresi rastgele ama **herkese
// açık**, ve bu kurulumdaki gösterim hesaplarının şifresi herkese açık depoda
// yazılı (`DEMO-KULLANICILAR.md`). Adresi bir kez paylaştıktan sonra o adres
// nereye giderse gitsin, arkasında patron yetkisiyle girilebilen bir sistem
// duruyor. Kapı bunu bir kullanıcı adı/parolanın arkasına alıyor.
//
// Bağımlılıksız: `node:http` ve `node:net` yetiyor. Sunumdan bir gün önce
// paket kurulumuna kalmak istemiyoruz.
//
// Kapsam bilerek dar — bu bir üretim vekili değil:
//   • Tek hedef, tek üst akış (127.0.0.1:<hedef>).
//   • TLS yok; şifrelemeyi tünel yapıyor, kapı yalnızca 127.0.0.1'i dinliyor.
//   • Oturum yok; tarayıcı Basic Auth başlığını kendisi tekrarlıyor.
//
// Kullanım:
//   node scripts/kapi.mjs           (KAPI_PORT, HEDEF_PORT, KAPI_KULLANICI,
//                                    KAPI_PAROLA ortamdan)

import http from "node:http";
import net from "node:net";
import { timingSafeEqual } from "node:crypto";

const PORT = Number(process.env.KAPI_PORT || 3010);
const TARGET = Number(process.env.HEDEF_PORT || 3000);
const USER = process.env.KAPI_KULLANICI || "demo";
const PASS = process.env.KAPI_PAROLA || "";

if (!PASS) {
  console.error("KAPI_PAROLA boş — parolasız kapı, kapı değildir. Çıkılıyor.");
  process.exit(1);
}

const EXPECTED = Buffer.from(`${USER}:${PASS}`, "utf8");

/**
 * Sabit süreli karşılaştırma.
 *
 * Parola bir sunum parolası, ama uzunluk farkından sızan bilgi bile gereksiz —
 * ve doğrusunu yazmak burada üç satır tutuyor.
 */
function authorized(header) {
  if (!header || !header.startsWith("Basic ")) return false;
  let given;
  try {
    given = Buffer.from(header.slice(6), "base64");
  } catch {
    return false;
  }
  if (given.length !== EXPECTED.length) return false;
  return timingSafeEqual(given, EXPECTED);
}

function deny(res) {
  res.writeHead(401, {
    // `realm` tarayıcının sorduğu kutuda görünüyor.
    "WWW-Authenticate": 'Basic realm="B2B gosterim", charset="UTF-8"',
    "content-type": "text/plain; charset=utf-8",
  });
  res.end("Bu adres parola ile korunuyor.\n");
}

const server = http.createServer((req, res) => {
  if (!authorized(req.headers.authorization)) {
    deny(res);
    return;
  }

  // Başlıklar olduğu gibi geçiyor. `x-forwarded-*` başlıklarını cloudflared
  // koyuyor ve Auth.js (trustHost) dönüş adresini onlardan kuruyor; burada
  // yeniden yazmak, girişten sonra kullanıcıyı localhost'a göndermek olurdu.
  const headers = { ...req.headers };
  delete headers.authorization; // Uygulamanın bu parolayı görmesine gerek yok.

  const upstream = http.request(
    { host: "127.0.0.1", port: TARGET, method: req.method, path: req.url, headers },
    (up) => {
      res.writeHead(up.statusCode || 502, up.headers);
      up.pipe(res);
    },
  );

  upstream.on("error", (err) => {
    res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    res.end(`Uygulamaya ulasilamadi: ${err.message}\n`);
  });

  req.pipe(upstream);
});

// WebSocket yükseltmesi: geliştirme sunucusunun sıcak yenilemesi bunu
// kullanıyor. Tarayıcı yükseltme isteğinde de Authorization başlığını
// yolluyor; yollamıyorsa bağlantı reddediliyor ve yalnızca sıcak yenileme
// çalışmıyor — sayfa çalışmaya devam ediyor.
server.on("upgrade", (req, socket, head) => {
  if (!authorized(req.headers.authorization)) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  const up = net.connect(TARGET, "127.0.0.1", () => {
    const lines = [`${req.method} ${req.url} HTTP/1.1`];
    for (const [k, v] of Object.entries(req.headers)) {
      if (k === "authorization") continue;
      if (Array.isArray(v)) v.forEach((one) => lines.push(`${k}: ${one}`));
      else lines.push(`${k}: ${v}`);
    }
    up.write(lines.join("\r\n") + "\r\n\r\n");
    if (head && head.length) up.write(head);
    up.pipe(socket);
    socket.pipe(up);
  });

  up.on("error", () => socket.destroy());
  socket.on("error", () => up.destroy());
});

// Yalnızca geri döngü: kapı dışarıya doğrudan açılmıyor, önünde tünel var.
server.listen(PORT, "127.0.0.1", () => {
  console.log(`kapi: 127.0.0.1:${PORT} -> 127.0.0.1:${TARGET} (kullanici: ${USER})`);
});
