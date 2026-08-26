import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { normalizeKey, readS3Config, signV4, storage } from "./storage";

// Deponun sınanması iki ayrı soruya bakıyor:
//  1. İmza doğru mu — AWS'in yayımladığı örnek isteklerin imzasıyla birebir.
//     Kendi ürettiğimiz değeri "beklenen" diye dondurmak, yanlış imzayı test
//     altına almaktan başka bir işe yaramazdı.
//  2. Sürücü seçimi ve anahtar güvenliği — yarım yapılandırmada sessizce diske
//     düşmemek, `..` içeren bir anahtarın kökten çıkamaması.

const S3_ENV = [
  "S3_BUCKET",
  "S3_REGION",
  "S3_ENDPOINT",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_FORCE_PATH_STYLE",
  "S3_PREFIX",
] as const;

const saved = new Map<string, string | undefined>();

function setEnv(values: Record<string, string | undefined>): void {
  for (const name of S3_ENV) {
    if (!saved.has(name)) saved.set(name, process.env[name]);
  }
  for (const [name, value] of Object.entries(values)) {
    if (!saved.has(name)) saved.set(name, process.env[name]);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

afterEach(() => {
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  saved.clear();
  vi.unstubAllGlobals();
});

/** AWS belgelerindeki örnek kimlik bilgileri. */
const EXAMPLE = {
  region: "us-east-1",
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  bucket: "examplebucket",
  pathStyle: false,
  prefix: "",
} as const;

const AT = new Date("2013-05-24T00:00:00Z");

function signatureOf(header: string): string {
  return header.match(/Signature=([0-9a-f]+)/)?.[1] ?? "";
}

describe("SigV4 imzası", () => {
  it("AWS'in GET Object örneğiyle aynı imzayı üretiyor", () => {
    const signed = signV4({
      config: { ...EXAMPLE, endpoint: "https://examplebucket.s3.amazonaws.com" },
      method: "GET",
      pathSegments: ["test.txt"],
      headers: { range: "bytes=0-9" },
      now: AT,
    });

    expect(signed.headers.authorization).toContain(
      "SignedHeaders=host;range;x-amz-content-sha256;x-amz-date",
    );
    expect(signatureOf(signed.headers.authorization!)).toBe(
      "f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41",
    );
  });

  it("AWS'in PUT Object örneğiyle aynı imzayı üretiyor", () => {
    const signed = signV4({
      config: { ...EXAMPLE, endpoint: "https://examplebucket.s3.amazonaws.com" },
      method: "PUT",
      pathSegments: ["test$file.text"],
      headers: {
        date: "Fri, 24 May 2013 00:00:00 GMT",
        "x-amz-storage-class": "REDUCED_REDUNDANCY",
      },
      payload: Buffer.from("Welcome to Amazon S3."),
      now: AT,
    });

    expect(signatureOf(signed.headers.authorization!)).toBe(
      "98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd",
    );
    // Gövde karması başlıkta: S3 imzayı buna göre doğruluyor, uyuşmazsa
    // "SignatureDoesNotMatch" der ve neyin tutmadığını söylemez.
    expect(signed.headers["x-amz-content-sha256"]).toBe(
      "44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072",
    );
  });

  it("AWS'in sorgu parametreli listeleme örneğiyle aynı imzayı üretiyor", () => {
    const signed = signV4({
      config: { ...EXAMPLE, endpoint: "https://examplebucket.s3.amazonaws.com" },
      method: "GET",
      pathSegments: [],
      query: { "max-keys": "2", prefix: "J" },
      now: AT,
    });

    expect(signatureOf(signed.headers.authorization!)).toBe(
      "34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7",
    );
  });

  it("boşluklu ve özel karakterli anahtarı kaçırıyor", () => {
    const signed = signV4({
      config: { ...EXAMPLE, endpoint: "https://examplebucket.s3.amazonaws.com" },
      method: "GET",
      pathSegments: ["ürün fotoğrafı (1).jpg"],
      now: AT,
    });
    expect(signed.url).toContain("%C3%BCr%C3%BCn%20foto");
    expect(signed.url).toContain("%281%29"); // parantez de kaçmalı
  });
});

describe("anahtar güvenliği", () => {
  it("kökten çıkmaya çalışan her şeyi reddediyor", () => {
    for (const segments of [
      [".."],
      ["products", ".."],
      ["products", "a/b"],
      ["products", "a\\b"],
      ["products", ""],
      ["products", "."],
      [],
    ]) {
      expect(normalizeKey(segments)).toBeNull();
    }
  });

  it("düz bir yolu olduğu gibi geçiriyor", () => {
    expect(normalizeKey(["products", "abc.jpg"])).toBe("products/abc.jpg");
  });
});

describe("sürücü seçimi", () => {
  it("S3_BUCKET yoksa yerel disk", () => {
    setEnv({ S3_BUCKET: undefined });
    expect(storage().kind).toBe("local");
    expect(readS3Config()).toBeNull();
  });

  it("kova var anahtar yoksa sessizce diske düşmüyor", () => {
    setEnv({
      S3_BUCKET: "b2b",
      S3_ACCESS_KEY_ID: undefined,
      S3_SECRET_ACCESS_KEY: undefined,
    });
    expect(() => storage()).toThrow(/S3_ACCESS_KEY_ID/);
  });

  it("MinIO uç noktası verilince yol biçimine geçiyor", () => {
    setEnv({
      S3_BUCKET: "b2b",
      S3_ENDPOINT: "http://localhost:9000/",
      S3_ACCESS_KEY_ID: "k",
      S3_SECRET_ACCESS_KEY: "s",
    });
    const config = readS3Config()!;
    expect(config.pathStyle).toBe(true);
    expect(config.endpoint).toBe("http://localhost:9000"); // sondaki / atıldı
    expect(storage().kind).toBe("s3");
  });

  it("AWS'te uç nokta bölgeden türetiliyor, alan adı biçimi kalıyor", () => {
    setEnv({
      S3_BUCKET: "b2b",
      S3_REGION: "eu-central-1",
      S3_ENDPOINT: undefined,
      S3_ACCESS_KEY_ID: "k",
      S3_SECRET_ACCESS_KEY: "s",
    });
    const config = readS3Config()!;
    expect(config.endpoint).toBe("https://s3.eu-central-1.amazonaws.com");
    expect(config.pathStyle).toBe(false);
  });
});

describe("S3 sürücüsü tel üzerinde", () => {
  interface Call {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: Uint8Array;
  }

  function fakeFetch(responder: (call: Call) => Response): Call[] {
    const calls: Call[] = [];
    vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
      const call: Call = {
        url,
        method: init.method ?? "GET",
        headers: (init.headers ?? {}) as Record<string, string>,
        body: init.body as Uint8Array | undefined,
      };
      calls.push(call);
      return Promise.resolve(responder(call));
    });
    return calls;
  }

  function minio(extra: Record<string, string> = {}): void {
    setEnv({
      S3_BUCKET: "b2b",
      S3_ENDPOINT: "http://minio:9000",
      S3_ACCESS_KEY_ID: "k",
      S3_SECRET_ACCESS_KEY: "s",
      S3_PREFIX: undefined,
      ...extra,
    });
  }

  it("yazarken kovayı yola koyuyor ve içerik türünü gönderiyor", async () => {
    minio();
    const calls = fakeFetch(() => new Response("", { status: 200 }));

    await storage().put("products/x.png", Buffer.from([1, 2, 3]), "image/png");

    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe("PUT");
    expect(calls[0]!.url).toBe("http://minio:9000/b2b/products/x.png");
    expect(calls[0]!.headers["content-type"]).toBe("image/png");
    expect(calls[0]!.headers.authorization).toMatch(/^AWS4-HMAC-SHA256 /);
  });

  it("ön ek verilince anahtarın önüne geçiyor, URL'e sızmıyor", async () => {
    minio({ S3_PREFIX: "musteri-a" });
    const calls = fakeFetch(() => new Response("", { status: 200 }));

    await storage().put("products/x.png", Buffer.from([1]), "image/png");
    expect(calls[0]!.url).toBe("http://minio:9000/b2b/musteri-a/products/x.png");
  });

  it("olmayan nesne için null, hata değil", async () => {
    minio();
    fakeFetch(() => new Response("", { status: 404 }));
    expect(await storage().get("products/yok.png")).toBeNull();
  });

  it("yazma hatasını yutmuyor", async () => {
    minio();
    fakeFetch(() => new Response("kova dolu", { status: 507 }));
    await expect(
      storage().put("products/x.png", Buffer.from([1]), "image/png"),
    ).rejects.toThrow(/507/);
  });

  it("silmeden önce varlığını soruyor — sayım doğru olsun diye", async () => {
    minio();
    const calls = fakeFetch((call) =>
      call.method === "HEAD"
        ? new Response("", { status: 404 })
        : new Response("", { status: 204 }),
    );

    expect(await storage().remove("products/yok.png")).toBe(false);
    expect(calls.map((c) => c.method)).toEqual(["HEAD"]); // DELETE hiç gitmedi
  });

  it("listeyi sayfalıyor ve gizli anahtarları dışarıda bırakıyor", async () => {
    minio();
    const page = (contents: string, token?: string) =>
      new Response(
        `<?xml version="1.0"?><ListBucketResult>${contents}` +
          `<IsTruncated>${token ? "true" : "false"}</IsTruncated>` +
          (token ? `<NextContinuationToken>${token}</NextContinuationToken>` : "") +
          `</ListBucketResult>`,
        { status: 200 },
      );
    const object = (key: string) =>
      `<Contents><Key>${key}</Key><Size>10</Size>` +
      `<LastModified>2026-08-01T10:00:00.000Z</LastModified></Contents>`;

    let served = 0;
    const calls = fakeFetch(() => {
      served += 1;
      return served === 1
        ? page(object("products/a.png") + object(".cache/w160/products/a.png.webp"), "T2")
        : page(object("products/b.png"));
    });

    const listed = await storage().list();

    expect(calls).toHaveLength(2);
    expect(calls[1]!.url).toContain("continuation-token=T2");
    expect(listed.map((o) => o.key)).toEqual(["products/a.png", "products/b.png"]);
    expect(listed[0]!.modifiedAt).toBe(Date.parse("2026-08-01T10:00:00.000Z"));
  });
});

describe("yerel sürücü", () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "b2b-storage-"));
  });

  it("yazdığını okuyor, sildiğini bir daha silmiyor", async () => {
    setEnv({ S3_BUCKET: undefined, UPLOAD_DIR: root });
    const driver = storage();

    await driver.put("products/a.png", Buffer.from("abc"), "image/png");
    expect((await driver.get("products/a.png"))?.toString()).toBe("abc");
    expect(await readFile(path.join(root, "products", "a.png"), "utf8")).toBe("abc");

    expect(await driver.remove("products/a.png")).toBe(true);
    expect(await driver.remove("products/a.png")).toBe(false);
    expect(await driver.get("products/a.png")).toBeNull();
  });

  it("listede gizli klasörleri atlıyor", async () => {
    setEnv({ S3_BUCKET: undefined, UPLOAD_DIR: root });
    const driver = storage();

    await driver.put("products/b.png", Buffer.from("x"), "image/png");
    await driver.put(".cache/w160/products/b.png.webp", Buffer.from("y"), "image/webp");

    const keys = (await driver.list()).map((o) => o.key);
    expect(keys).toContain("products/b.png");
    expect(keys.some((k) => k.startsWith(".cache"))).toBe(false);
  });

  it("kökün dışına yazmayı reddediyor", async () => {
    setEnv({ S3_BUCKET: undefined, UPLOAD_DIR: root });
    await expect(
      storage().put("../escape.png", Buffer.from("x"), "image/png"),
    ).rejects.toThrow();
  });
});
