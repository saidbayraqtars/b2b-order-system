import { randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { BusinessError } from "./errors";

// Uploaded files (product photos, for now).
//
// Files go to a directory on disk — `UPLOAD_DIR`, defaulting to ./uploads —
// and are served back through a route handler rather than out of `public/`.
// That is deliberate: `public/` is a build-time directory, and writing into it
// at runtime works on a laptop and stops working the moment the app is packaged
// or containerised. A plain directory plus one reader is boring and portable,
// and it is the shape a future S3/MinIO swap slots into.
//
// Three rules make this safe to expose:
//  1. The *content* decides the type, not the name. A file called photo.png that
//     starts with `<?php` is rejected, because only known image signatures are
//     accepted at all.
//  2. The client's filename is never used on disk. Names are random; there is no
//     path to traverse, nothing to overwrite, and no way to guess a URL.
//  3. Reads resolve the final path and check it is still inside the root, so a
//     crafted `../` in a URL cannot escape.

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

export function uploadRoot(): string {
  return process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");
}

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
  const dir = path.join(uploadRoot(), folder);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), params.data);

  return {
    url: `${MEDIA_URL_PREFIX}/${folder}/${name}`,
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
  const root = path.resolve(uploadRoot());
  const target = path.resolve(root, ...segments);

  // The one check that matters: after resolution, are we still inside?
  if (target !== root && !target.startsWith(root + path.sep)) return null;

  const ext = path.extname(target).slice(1).toLowerCase();
  const mime = MIME_BY_EXT[ext];
  if (!mime) return null;

  try {
    return { data: await readFile(target), mime };
  } catch {
    return null;
  }
}

/**
 * Delete a file we previously stored. Silent when it is already gone: removing
 * an image from a product must not fail because the file vanished first.
 */
export async function deleteMedia(url: string): Promise<void> {
  if (!url.startsWith(`${MEDIA_URL_PREFIX}/`)) return;

  const segments = url.slice(MEDIA_URL_PREFIX.length + 1).split("/");
  const root = path.resolve(uploadRoot());
  const target = path.resolve(root, ...segments);
  if (!target.startsWith(root + path.sep)) return;

  await unlink(target).catch(() => undefined);
}
