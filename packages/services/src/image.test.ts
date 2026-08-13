import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildVariant, isVariantWidth, readVariant } from "./image";
import { deleteMedia, saveImage } from "./media";

// Resized copies of uploaded images. The behaviour worth pinning down is what
// happens the second time (the cache), what happens with a width nobody
// declared, and that deleting a photo takes its thumbnails with it.

let root: string;
const previous = process.env.UPLOAD_DIR;

/** A real 800×600 JPEG — sharp has to be able to decode it. */
async function photo(): Promise<Buffer> {
  return sharp({
    create: {
      width: 800,
      height: 600,
      channels: 3,
      background: { r: 200, g: 40, b: 40 },
    },
  })
    .jpeg()
    .toBuffer();
}

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "b2b-image-"));
  process.env.UPLOAD_DIR = root;
});

afterAll(() => {
  if (previous === undefined) delete process.env.UPLOAD_DIR;
  else process.env.UPLOAD_DIR = previous;
});

describe("image variants", () => {
  it("only accepts the widths it declares", () => {
    expect(isVariantWidth(320)).toBe(true);
    expect(isVariantWidth("320")).toBe(true); // straight off a query string
    expect(isVariantWidth(321)).toBe(false);
    expect(isVariantWidth("large")).toBe(false);
    expect(isVariantWidth(4000)).toBe(false);
  });

  it("resizes to WebP and comes out smaller than the original", async () => {
    const source = await photo();
    const small = await buildVariant(source, 320);

    const meta = await sharp(small).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(320);
    expect(small.length).toBeLessThan(source.length);
  });

  it("never enlarges a photo that is already smaller", async () => {
    const source = await photo(); // 800 wide
    const meta = await sharp(await buildVariant(source, 960)).metadata();
    // A blurred 960 costs more to send than the 800 it was made from.
    expect(meta.width).toBe(800);
  });

  it("builds once and serves the cached copy afterwards", async () => {
    const saved = await saveImage({ data: await photo() });
    const segments = saved.url.split("/").slice(3); // /api/media/<folder>/<file>

    let reads = 0;
    const original = async () => {
      reads += 1;
      return readFile(path.join(root, ...segments));
    };

    const first = await readVariant(segments, 320, original);
    const second = await readVariant(segments, 320, original);

    expect(first!.mime).toBe("image/webp");
    expect(second!.data.equals(first!.data)).toBe(true);
    // The second request must not touch the original at all.
    expect(reads).toBe(1);

    const cached = path.join(root, ".cache", "w320", ...segments) + ".webp";
    expect((await stat(cached)).isFile()).toBe(true);
  });

  it("gives nothing when the original is gone", async () => {
    const result = await readVariant(["products", "yok.jpg"], 160, async () => null);
    expect(result).toBeNull();
  });

  it("gives nothing for a file sharp cannot decode", async () => {
    // The route falls back to serving the original, which is right: the file is
    // plainly there, it just cannot be resized.
    const result = await readVariant(["products", "bozuk.jpg"], 160, async () =>
      Buffer.from("bu bir resim değil"),
    );
    expect(result).toBeNull();
  });

  it("takes the cached copies with it when the photo is deleted", async () => {
    const saved = await saveImage({ data: await photo() });
    const segments = saved.url.split("/").slice(3);
    await readVariant(segments, 160, async () =>
      readFile(path.join(root, ...segments)),
    );

    const cached = path.join(root, ".cache", "w160", ...segments) + ".webp";
    expect((await stat(cached)).isFile()).toBe(true);

    await deleteMedia(saved.url);
    // A thumbnail of a deleted product photo is still that photo.
    await expect(stat(cached)).rejects.toBeTruthy();
  });
});
