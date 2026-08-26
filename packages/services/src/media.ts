import { randomBytes } from "node:crypto";
import { prisma } from "@repo/database";
import { BusinessError } from "./errors";
import { deleteVariants } from "./image";
import { normalizeKey, storage } from "./storage";
import { uploadRoot } from "./upload-root";

export { uploadRoot };

// Uploaded files (product photos, for now).
//
// Files are never written into `public/`: that is a build-time directory, and
// writing into it at runtime works on a laptop and stops working the moment the
// app is packaged or containerised. They go to a storage driver instead — a
// directory on disk by default, an S3/MinIO bucket when one is configured (see
// `storage.ts`) — and are served back through a route handler.
//
// This module does not know which driver is underneath. It decides *what may be
// stored* and *what a URL means*; the driver decides where the bytes live.
//
// Three rules make this safe to expose:
//  1. The *content* decides the type, not the name. A file called photo.png that
//     starts with `<?php` is rejected, because only known image signatures are
//     accepted at all.
//  2. The client's filename is never used as a key. Names are random; there is
//     no path to traverse, nothing to overwrite, and no way to guess a URL.
//  3. URL segments become a key through `normalizeKey`, which refuses `..` and
//     anything else that could point outside the store.

const MAX_BYTES = 5 * 1024 * 1024;

/** Magic-byte signatures for the formats a browser will actually render. */
const SIGNATURES: ReadonlyArray<{
  ext: string;
  mime: string;
  test: (b: Buffer) => boolean;
}> = [
  {
    ext: "jpg",
    mime: "image/jpeg",
    test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    ext: "png",
    mime: "image/png",
    test: (b) =>
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  {
    ext: "webp",
    mime: "image/webp",
    test: (b) => b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP",
  },
  {
    ext: "avif",
    mime: "image/avif",
    test: (b) => b.subarray(4, 8).toString() === "ftyp" && b.subarray(8, 12).toString().startsWith("avif"),
  },
  {
    ext: "gif",
    mime: "image/gif",
    test: (b) => b.subarray(0, 3).toString() === "GIF",
  },
];

const MIME_BY_EXT: Record<string, string> = Object.fromEntries(
  SIGNATURES.map((s) => [s.ext, s.mime]),
);

/** Public URL prefix; the route handler at this path serves the bytes. */
export const MEDIA_URL_PREFIX = "/api/media";

/** Folders are part of the URL, so keep them boring. */
function assertFolder(folder: string): string {
  if (!/^[a-z0-9][a-z0-9-]{0,30}$/.test(folder)) {
    throw new BusinessError("INVALID_UPLOAD", "Geçersiz klasör adı", { folder });
  }
  return folder;
}

export interface SavedMedia {
  /** What goes into Product.images — a URL, not a disk path. */
  url: string;
  mime: string;
  bytes: number;
}

export async function saveImage(params: {
  data: Buffer;
  folder?: string;
}): Promise<SavedMedia> {
  const folder = assertFolder(params.folder ?? "products");

  if (params.data.length === 0) {
    throw new BusinessError("INVALID_UPLOAD", "Dosya boş");
  }
  if (params.data.length > MAX_BYTES) {
    throw new BusinessError("INVALID_UPLOAD", "Dosya 5 MB sınırını aşıyor", {
      bytes: params.data.length,
    });
  }

  const signature = SIGNATURES.find((s) => s.test(params.data));
  if (!signature) {
    throw new BusinessError(
      "INVALID_UPLOAD",
      "Yalnızca JPEG, PNG, WebP, AVIF ve GIF görseller yüklenebilir",
    );
  }

  const name = `${Date.now().toString(36)}-${randomBytes(6).toString("hex")}.${signature.ext}`;
  const key = `${folder}/${name}`;
  await storage().put(key, params.data, signature.mime);

  return {
    url: `${MEDIA_URL_PREFIX}/${key}`,
    mime: signature.mime,
    bytes: params.data.length,
  };
}

export interface MediaFile {
  data: Buffer;
  mime: string;
}

/**
 * Read a stored file by its URL segments. Returns null when it is not there —
 * the caller answers 404 rather than leaking whether a directory exists.
 */
export async function readMedia(segments: string[]): Promise<MediaFile | null> {
  const key = normalizeKey(segments);
  if (!key) return null;

  const dot = key.lastIndexOf(".");
  const mime = dot === -1 ? undefined : MIME_BY_EXT[key.slice(dot + 1).toLowerCase()];
  if (!mime) return null;

  // Errors are not swallowed into a 404 here. A missing file and an unreachable
  // bucket look the same to the visitor but not to the operator: turning an S3
  // outage into "resim yok" would hide it, and the route caches 404s badly.
  const data = await storage().get(key);
  return data ? { data, mime } : null;
}

/**
 * Delete a file we previously stored. Silent when it is already gone: removing
 * an image from a product must not fail because the file vanished first.
 *
 * Returns whether a file was actually removed — the cleanup job counts these,
 * and "0 silindi" must mean nothing was there rather than nothing was tried.
 */
export async function deleteMedia(url: string): Promise<boolean> {
  if (!url.startsWith(`${MEDIA_URL_PREFIX}/`)) return false;

  const segments = url.slice(MEDIA_URL_PREFIX.length + 1).split("/");
  const key = normalizeKey(segments);
  if (!key) return false;

  // Variants first: an original that is gone with its thumbnails still cached
  // would keep serving a picture of something that was deleted.
  await deleteVariants(segments);

  return storage().remove(key);
}

/**
 * Dosyaları hiçbir ürüne bağlı olmayanlarla eşleştir.
 *
 * İki koşul birden aranıyor: dosya hiçbir ürünün `images` dizisinde geçmemeli
 * **ve** belirli bir yaştan eski olmalı. Yaş koşulu olmadan, yüklenmiş ama
 * henüz ürüne kaydedilmemiş bir görsel — kullanıcı formu doldururken —
 * ayağının altından silinirdi.
 *
 * Karşılaştırma URL üzerinden yapılıyor, dosya adı üzerinden değil: `images`
 * dizisi URL tutuyor ve iki gösterimi birbirine çevirmeye çalışmak, tek bir
 * ayrımda gerçek görselleri silmek demek.
 */
export async function listOrphanMedia(minAgeHours = 24): Promise<string[]> {
  const cutoff = Date.now() - minAgeHours * 3_600_000;

  // The driver leaves the variant cache out of its listing — derived data is
  // not an upload, and a sweep that saw it would delete the cache every night.
  const stored = await storage().list();
  const onDisk = stored
    .filter((object) => object.modifiedAt <= cutoff)
    .map((object) => `${MEDIA_URL_PREFIX}/${object.key}`);
  if (onDisk.length === 0) return [];

  const products = await prisma.product.findMany({ select: { images: true } });
  const referenced = new Set(products.flatMap((p) => p.images));

  return onDisk.filter((url) => !referenced.has(url));
}
