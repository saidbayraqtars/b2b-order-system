import { createHash, createHmac } from "node:crypto";
import { access, constants, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { type S3Config, readS3Config, storageKind } from "./storage-config";
import { uploadRoot } from "./upload-root";

/**
 * Yüklenen dosyaların nereye yazıldığı.
 *
 * İki sürücü var ve ikisi de aynı arayüzü konuşuyor: **yerel disk** (varsayılan)
 * ve **S3 uyumlu nesne deposu** (AWS S3, MinIO, Cloudflare R2, Wasabi…).
 * Üstteki kod hangisinin çalıştığını bilmiyor — `media.ts` bir anahtar verip
 * bayt istiyor, küçültme önbelleği de aynı kapıdan geçiyor.
 *
 * Ayrımın sebebi: b2b müşteri başına ayrı kuruluyor. Tek sunucuda çalışan bir
 * müşteri için disk doğru cevap — kurulum yok, yedek `tar` ile alınıyor.
 * Kapsayıcıyı iki kopya çalıştıran ya da diski kalıcı olmayan (Fly, Render,
 * Cloud Run) bir müşteri için disk yanlış cevap: ikinci kopya birincinin
 * yüklediği görseli göremez, imaj yenilenince katalog fotoğrafsız kalır.
 *
 * **Yarım yapılandırma sessizce diske düşmez.** `S3_BUCKET` verilmiş ama
 * anahtarlar eksikse sürücü hata fırlatır. Alternatifi — diske yazıp devam
 * etmek — kapsayıcı yeniden başlayana kadar çalışan, sonra bütün görselleri
 * kaybeden bir kurulum demek; sessiz veri kaybı, gürültülü hatadan beterdir.
 *
 * Bağımlılık eklenmedi: imza (SigV4) `node:crypto` ile, istekler `fetch` ile.
 * `@aws-sdk/client-s3` bu iş için yüz küsur paketlik bir ağaç, buradan
 * kullanılan yüzey ise dört fiil ve bir listeleme. Kurulum müşterinin
 * sunucusunda güncelleniyor; taşınan her bağımlılık orada bir gün
 * "npm install çalışmadı" demenin başka bir yolu.
 */

/** Depodaki bir nesne — yetim tarama listesi bunu okur. */
export interface StoredObject {
  /** `klasor/dosya.jpg` — URL'deki hâliyle aynı, `/` ile ayrılmış. */
  key: string;
  bytes: number;
  /** Son değişiklik, epoch ms. Yetim taraması yaş eşiğini buna bakarak koyuyor. */
  modifiedAt: number;
}

export interface StorageDriver {
  readonly kind: "local" | "s3";
  /** Günlük ve sağlık çıktısı için; sır içermez. */
  readonly describe: string;
  put(key: string, data: Buffer, mime: string): Promise<void>;
  /** Yoksa null — çağıran 404 veriyor, "yok" ile "okuyamadım" ayrımı yapmıyoruz. */
  get(key: string): Promise<Buffer | null>;
  /** Gerçekten bir şey silindiyse true; zaten yoksa false (hata değil). */
  remove(key: string): Promise<boolean>;
  /**
   * Görünür nesnelerin tamamı. Nokta ile başlayan bölüm içeren anahtarlar
   * **listelenmez**: onlar türetilmiş veri (küçültme önbelleği), yüklenmiş
   * dosya değil. Kural burada duruyor ki yetim taraması iki sürücüde de aynı
   * şeyi görsün.
   */
  list(): Promise<StoredObject[]>;
  /** Depo yazılabilir durumda mı — sağlık ucu bunu soruyor. */
  healthy(): Promise<boolean>;
}

/* ------------------------------------------------------------------ anahtar */

/**
 * URL parçalarını tek bir depo anahtarına çevirir; şüpheli her şeyde null.
 *
 * Tek savunma noktası: `..`, mutlak yol, ters bölü ve NUL burada eleniyor.
 * Yerel sürücü ayrıca çözümlemeden sonra kökün içinde kaldığını bir daha
 * kontrol ediyor — aynı şeyi iki kez yapmak, birinin gün gelip değişmesine
 * karşı ucuz bir sigorta.
 */
export function normalizeKey(segments: readonly string[]): string | null {
  if (segments.length === 0) return null;
  for (const segment of segments) {
    if (segment === "" || segment === "." || segment === "..") return null;
    if (/[/\\\0]/.test(segment)) return null;
  }
  return segments.join("/");
}

/** Anahtarın gizli (türetilmiş) olup olmadığı — önbellek `.cache/...` altında. */
function isHidden(key: string): boolean {
  return key.split("/").some((s) => s.startsWith("."));
}

/* ------------------------------------------------------------- yerel sürücü */

function localPath(key: string): string | null {
  const root = path.resolve(uploadRoot());
  const target = path.resolve(root, ...key.split("/"));
  if (target !== root && !target.startsWith(root + path.sep)) return null;
  return target;
}

const localDriver: StorageDriver = {
  kind: "local",
  get describe() {
    return `yerel dizin ${uploadRoot()}`;
  },

  async put(key, data) {
    const target = localPath(key);
    if (!target) throw new Error(`Geçersiz depo anahtarı: ${key}`);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, data);
  },

  async get(key) {
    const target = localPath(key);
    if (!target) return null;
    return readFile(target).catch(() => null);
  },

  async remove(key) {
    const target = localPath(key);
    if (!target) return false;
    try {
      await rm(target);
      return true;
    } catch {
      return false;
    }
  },

  async list() {
    const root = path.resolve(uploadRoot());
    const found: StoredObject[] = [];

    async function walk(dir: string, prefix: string[]): Promise<void> {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return; // dizin hiç oluşmamış ya da okunamıyor — yüklenen dosya yok
      }
      for (const entry of entries) {
        if (entry.name.startsWith(".")) continue; // türetilmiş veri
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full, [...prefix, entry.name]);
          continue;
        }
        if (!entry.isFile()) continue;
        const info = await stat(full).catch(() => null);
        if (!info) continue;
        found.push({
          key: [...prefix, entry.name].join("/"),
          bytes: info.size,
          modifiedAt: info.mtimeMs,
        });
      }
    }

    await walk(root, []);
    return found;
  },

  async healthy() {
    try {
      await access(uploadRoot(), constants.W_OK);
      return true;
    } catch {
      return false;
    }
  },
};

/* ---------------------------------------------------------------- S3 sürücü */

const EMPTY_SHA256 =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key: Buffer | string, message: string): Buffer {
  return createHmac("sha256", key).update(message, "utf8").digest();
}

/**
 * RFC 3986 kaçışı. `encodeURIComponent` beş karakteri bırakıyor ve imzanın
 * kanonik biçimi onları da istiyor; bırakılırsa imza tutmaz ve depodan gelen
 * cevap "SignatureDoesNotMatch" olur — nedenini söylemeyen bir hata.
 */
function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export interface SignedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
}

/**
 * AWS Signature Version 4 — Authorization başlığı, tek parça gövde.
 *
 * Ayrı ve dışa açık bir işlev çünkü sınanabilir olması gerekiyor: AWS'in
 * yayımladığı örnek isteklerin imzaları testte birebir karşılaştırılıyor.
 * Kendi ürettiğimiz değere karşı test yazmak, yanlış imzayı "beklenen" diye
 * dondurmaktan başka bir işe yaramazdı.
 */
export function signV4(params: {
  config: S3Config;
  method: string;
  /** Sunucudaki yol, kaçışsız: `["kova", "klasor", "dosya.jpg"]`. */
  pathSegments: readonly string[];
  query?: Record<string, string>;
  headers?: Record<string, string>;
  payload?: Buffer;
  /** Sabit tarih testler için; verilmezse şimdi. */
  now?: Date;
}): SignedRequest {
  const { config, method } = params;
  const url = new URL(config.endpoint);
  const host = url.host;

  const amzDate = (params.now ?? new Date())
    .toISOString()
    .replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = params.payload ? sha256Hex(params.payload) : EMPTY_SHA256;

  const headers: Record<string, string> = {
    ...(params.headers ?? {}),
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };

  const canonicalHeaderNames = Object.keys(headers)
    .map((name) => name.toLowerCase())
    .sort();
  const lowerHeaders = new Map(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v.trim()]),
  );
  const canonicalHeaders = canonicalHeaderNames
    .map((n) => `${n}:${lowerHeaders.get(n)}\n`)
    .join("");
  const signedHeaders = canonicalHeaderNames.join(";");

  const canonicalUri = "/" + params.pathSegments.map(encodeRfc3986).join("/");
  const canonicalQuery = Object.entries(params.query ?? {})
    .map(([k, v]) => [encodeRfc3986(k), encodeRfc3986(v)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${config.secretAccessKey}`, dateStamp), config.region), "s3"),
    "aws4_request",
  );
  const signature = createHmac("sha256", signingKey)
    .update(stringToSign, "utf8")
    .digest("hex");

  return {
    method,
    url: `${url.protocol}//${host}${canonicalUri}${canonicalQuery ? `?${canonicalQuery}` : ""}`,
    headers: {
      ...headers,
      authorization:
        `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, ` +
        `SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}

/** Kova ve ön eki hesaba katarak sunucudaki yol parçalarını üretir. */
function objectPath(config: S3Config, key: string): string[] {
  const segments = [
    ...(config.prefix ? config.prefix.split("/") : []),
    ...key.split("/"),
  ];
  return config.pathStyle ? [config.bucket, ...segments] : segments;
}

/**
 * Alan adı biçiminde kova, host'un başına geçer. Yol biçiminde uç nokta
 * olduğu gibi kalır.
 */
function endpointFor(config: S3Config): S3Config {
  if (config.pathStyle) return config;
  const url = new URL(config.endpoint);
  url.host = `${config.bucket}.${url.host}`;
  return { ...config, endpoint: url.origin };
}

async function s3Fetch(
  config: S3Config,
  params: Omit<Parameters<typeof signV4>[0], "config">,
  body?: Buffer,
): Promise<Response> {
  const signed = signV4({ ...params, config });
  return fetch(signed.url, {
    method: signed.method,
    headers: signed.headers,
    body: body ? new Uint8Array(body) : undefined,
    // Görsel yüklemesi bir isteği sonsuza kadar bekletmemeli; sağlık ucu da
    // bu sürücüyü yokluyor ve orada asılı kalmak kapsayıcıyı öldürtür.
    signal: AbortSignal.timeout(20_000),
  });
}

/**
 * `<Contents>` bloklarından anahtar/boyut/tarih çıkarır.
 *
 * Tam bir XML çözümleyici değil ve olmasına gerek yok: S3'ün ListObjectsV2
 * cevabı sabit şemalı ve yalnızca üç alanı okunuyor. Bir bağımlılık eklemek
 * yerine üç düzenli ifade — ama anahtar XML kaçışlı gelebiliyor (`&amp;`),
 * o yüzden çözme adımı var.
 */
function parseListing(xml: string): StoredObject[] {
  const out: StoredObject[] = [];
  for (const block of xml.match(/<Contents>[\s\S]*?<\/Contents>/g) ?? []) {
    const key = block.match(/<Key>([\s\S]*?)<\/Key>/)?.[1];
    if (!key) continue;
    out.push({
      key: unescapeXml(key),
      bytes: Number(block.match(/<Size>(\d+)<\/Size>/)?.[1] ?? 0),
      modifiedAt: Date.parse(
        block.match(/<LastModified>([\s\S]*?)<\/LastModified>/)?.[1] ?? "",
      ),
    });
  }
  return out;
}

function unescapeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function isTruncated(xml: string): boolean {
  return /<IsTruncated>true<\/IsTruncated>/.test(xml);
}

function nextToken(xml: string): string | null {
  return (
    xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/)?.[1] ??
    null
  );
}

function s3Driver(raw: S3Config): StorageDriver {
  const config = endpointFor(raw);

  return {
    kind: "s3",
    describe: `S3 kovası ${raw.bucket} @ ${raw.endpoint}`,

    async put(key, data, mime) {
      const res = await s3Fetch(
        config,
        {
          method: "PUT",
          pathSegments: objectPath(config, key),
          headers: { "content-type": mime },
          payload: data,
        },
        data,
      );
      if (!res.ok) {
        throw new Error(
          `S3 yazma başarısız (${res.status}): ${(await res.text()).slice(0, 300)}`,
        );
      }
    },

    async get(key) {
      const res = await s3Fetch(config, {
        method: "GET",
        pathSegments: objectPath(config, key),
      });
      if (res.status === 404 || res.status === 403) return null;
      if (!res.ok) throw new Error(`S3 okuma başarısız (${res.status})`);
      return Buffer.from(await res.arrayBuffer());
    },

    async remove(key) {
      // DELETE, nesne olmasa da 204 döner. Yetim temizliği "kaç dosya silindi"
      // sayısını raporluyor ve orada "hiç yoktu" ile "sildim" ayrı şeyler,
      // bu yüzden önce bir HEAD.
      const head = await s3Fetch(config, {
        method: "HEAD",
        pathSegments: objectPath(config, key),
      });
      if (!head.ok) return false;

      const res = await s3Fetch(config, {
        method: "DELETE",
        pathSegments: objectPath(config, key),
      });
      return res.ok || res.status === 204;
    },

    async list() {
      const bucketPath = config.pathStyle ? [config.bucket] : [];
      const out: StoredObject[] = [];
      let token: string | null = null;

      // Sayfalama şart: 2.654 ürünlük katalogda tek sayfa (1000 nesne) yetmez
      // ve eksik liste, yetim taramasına "bu dosya artık yok" dedirtir.
      do {
        const query: Record<string, string> = { "list-type": "2" };
        if (config.prefix) query.prefix = `${config.prefix}/`;
        if (token) query["continuation-token"] = token;

        const res: Response = await s3Fetch(config, {
          method: "GET",
          pathSegments: bucketPath,
          query,
        });
        if (!res.ok) throw new Error(`S3 listeleme başarısız (${res.status})`);
        const xml: string = await res.text();

        for (const object of parseListing(xml)) {
          const key = config.prefix
            ? object.key.slice(config.prefix.length + 1)
            : object.key;
          if (key === "" || isHidden(key)) continue;
          out.push({ ...object, key });
        }

        token = isTruncated(xml) ? nextToken(xml) : null;
      } while (token);

      return out;
    },

    async healthy() {
      try {
        const res = await s3Fetch(config, {
          method: "HEAD",
          pathSegments: config.pathStyle ? [config.bucket] : [],
        });
        return res.ok;
      } catch {
        return false;
      }
    },
  };
}

/* ------------------------------------------------------------------- seçici */

/**
 * Bu kurulumun deposu.
 *
 * Bilerek önbelleklenmiyor: `S3_BUCKET` ya da `UPLOAD_DIR` süreç ömrü boyunca
 * değişmez, ama testler ortamı değiştirip yeniden soruyor ve bir modül
 * değişkenine sıkışmış sürücü, sınanamayan sürücü demek. Maliyeti birkaç
 * `process.env` okuması.
 */
export function storage(): StorageDriver {
  const config = readS3Config();
  return config ? s3Driver(config) : localDriver;
}

// Yapılandırma okuması `storage-config.ts`'de duruyor (edge derlemesi düğüm
// modüllerini çözemiyor, oradaki nota bakın); çağıranlar için buradan da
// görünüyor.
export { type S3Config, readS3Config, storageKind };
