/**
 * Görsel deposunun **yapılandırması** — sürücünün kendisi değil.
 *
 * Kendi dosyası olmasının sebebi `upload-root.ts` ile aynı ve bir kez CI'da
 * öğrenildi: `runtime-env.ts` açılış denetimini yapıyor ve Next onu
 * `instrumentation.ts` üzerinden **edge çalışma zamanı için de** derliyor.
 * Edge paketleyicisi `node:crypto` / `node:fs` şemasını çözemiyor ve derleme
 * "UnhandledSchemeError" ile düşüyor. Denetimin bilmesi gereken tek şey hangi
 * sürücünün seçildiği; o karar burada, `process.env` okumaktan ibaret ve
 * hiçbir düğüm modülüne dokunmuyor.
 *
 * `storage.ts` bunu içe aktarıp asıl sürücüyü kuruyor.
 */

export interface S3Config {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** `https://minio.ornek.com` — AWS'te boş bırakılabilir, bölgeden türetilir. */
  endpoint: string;
  /** MinIO yol biçimini ister (`/kova/anahtar`), AWS alan adı biçimini. */
  pathStyle: boolean;
  /** Kovayı başkasıyla paylaşan kurulumlar için isteğe bağlı ön ek. */
  prefix: string;
}

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

/**
 * S3 yapılandırmasını okur. `S3_BUCKET` boşsa null — yerel diske düşülür.
 *
 * Kova verilip anahtar verilmemesi **hata**: eksik yapılandırmayla diske
 * yazmak, kapsayıcı yenilenene kadar çalışan sonra bütün görselleri kaybeden
 * bir kurulum demek. Sessiz veri kaybı, gürültülü hatadan beterdir.
 */
export function readS3Config(): S3Config | null {
  const bucket = env("S3_BUCKET");
  if (bucket === "") return null;

  const missing = ["S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"].filter(
    (name) => env(name) === "",
  );
  if (missing.length > 0) {
    throw new Error(
      `S3_BUCKET tanımlı ama ${missing.join(" ve ")} boş. ` +
        `Eksik anahtarla diske yazmak, kapsayıcı yenilendiğinde bütün ` +
        `görselleri kaybetmek demek — yapılandırmayı tamamlayın ya da ` +
        `S3_BUCKET değerini kaldırın.`,
    );
  }

  const region = env("S3_REGION") || "us-east-1";
  const endpoint = env("S3_ENDPOINT") || `https://s3.${region}.amazonaws.com`;
  // MinIO ve çoğu S3 uyumlusu alan adı biçimini desteklemiyor; kendi uç
  // noktasını veren zaten AWS'te değildir, bu yüzden varsayılan ona göre.
  const pathStyleDefault = env("S3_ENDPOINT") !== "";
  const forced = env("S3_FORCE_PATH_STYLE").toLowerCase();

  return {
    bucket,
    region,
    accessKeyId: env("S3_ACCESS_KEY_ID"),
    secretAccessKey: env("S3_SECRET_ACCESS_KEY"),
    endpoint: endpoint.replace(/\/+$/, ""),
    pathStyle: forced === "" ? pathStyleDefault : forced !== "false" && forced !== "0",
    prefix: env("S3_PREFIX").replace(/^\/+|\/+$/g, ""),
  };
}

/** Sağlık ucu, açılış denetimi ve kurulum ekranı için: hangi sürücü açık. */
export function storageKind(): "local" | "s3" {
  return readS3Config() ? "s3" : "local";
}
