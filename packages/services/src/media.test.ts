import { mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteMedia, readMedia, saveImage } from "./media";

// Upload validation, which is the part that decides whether this endpoint is a
// file store or a remote-code-execution hole. No database needed.

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 1),
]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 2)]);

let root: string;
const previous = process.env.UPLOAD_DIR;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "b2b-media-"));
  process.env.UPLOAD_DIR = root;
});

afterAll(() => {
  if (previous === undefined) delete process.env.UPLOAD_DIR;
  else process.env.UPLOAD_DIR = previous;
});

describe("media uploads", () => {
  it("accepts real images and hands back a URL, not a path", async () => {
    const saved = await saveImage({ data: PNG });
    expect(saved.mime).toBe("image/png");
    expect(saved.url).toMatch(/^\/api\/media\/products\/[a-z0-9-]+\.png$/);

    const jpeg = await saveImage({ data: JPEG, folder: "products" });
    expect(jpeg.mime).toBe("image/jpeg");
    expect(jpeg.url).not.toBe(saved.url); // names are random, never collide
  });

  it("decides by content, not by what the client called the file", async () => {
    await expect(
      saveImage({ data: Buffer.from("<?php system($_GET['c']); ?>") }),
    ).rejects.toMatchObject({ code: "INVALID_UPLOAD" });
    await expect(saveImage({ data: Buffer.alloc(0) })).rejects.toMatchObject({
      code: "INVALID_UPLOAD",
    });
  });

  it("refuses a file over the size limit", async () => {
    const huge = Buffer.concat([PNG, Buffer.alloc(6 * 1024 * 1024)]);
    await expect(saveImage({ data: huge })).rejects.toMatchObject({
      code: "INVALID_UPLOAD",
    });
  });

  it("refuses a folder name that could become a path", async () => {
    for (const folder of ["../etc", "a/b", "", "A".repeat(40)]) {
      await expect(saveImage({ data: PNG, folder })).rejects.toMatchObject({
        code: "INVALID_UPLOAD",
      });
    }
  });

  it("reads back what it stored", async () => {
    const saved = await saveImage({ data: PNG });
    const segments = saved.url.split("/").slice(3); // strip /api/media
    const file = await readMedia(segments);
    expect(file?.mime).toBe("image/png");
    expect(file?.data.equals(PNG)).toBe(true);
  });

  it("cannot be walked out of the upload root", async () => {
    // A secret next to the root, and the classic traversal aimed at it.
    const secret = path.join(root, "..", "secret.png");
    await writeFile(secret, PNG);

    expect(await readMedia(["..", "secret.png"])).toBeNull();
    expect(await readMedia(["products", "..", "..", "secret.png"])).toBeNull();
    // Not an image extension → never served, whatever the path.
    expect(await readMedia(["..", "..", "etc", "passwd"])).toBeNull();
  });

  it("deletes a file it owns and ignores anything else", async () => {
    const saved = await saveImage({ data: PNG });
    await deleteMedia(saved.url);
    expect(await readMedia(saved.url.split("/").slice(3))).toBeNull();

    // Not ours: silently ignored rather than reaching outside.
    await deleteMedia("https://cdn.example.com/photo.png");
    await deleteMedia("/api/media/../../secret.png");
    const stillThere = await readdir(path.join(root, ".."));
    expect(stillThere).toContain("secret.png");
  });
});
