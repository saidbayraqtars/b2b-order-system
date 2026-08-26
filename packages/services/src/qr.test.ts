import { describe, expect, it } from "vitest";
import { byteCapacity, encodeQr, QrError, qrSvg } from "./qr";
import { otpauthUri } from "./totp";

// Bu dosya QR'ı **çözerek** doğrular. Üreticinin kendi tablolarını tekrar
// çağırıp "aynı sonucu verdi" demek hiçbir şey kanıtlamaz; buradaki çözücü
// standarttan ayrıca yazıldı ve matristen ham baytları geri okuyor. Reed-Solomon
// sendromlarının sıfır çıkması, hata düzeltme sözcüklerinin de doğru olduğunu
// söyler — telefon kamerası da tam olarak buna bakıyor.

// ─── çözücü tarafı GF(256) ───────────────────

const EXP: number[] = [];
const LOG: number[] = [];
{
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255]!;
}
const mul = (a: number, b: number): number =>
  a === 0 || b === 0 ? 0 : EXP[LOG[a]! + LOG[b]!]!;

// [blok başına EC, grup1 blok, grup1 veri, grup2 blok, grup2 veri] — seviye M.
const BLOCKS_M: number[][] = [
  [],
  [10, 1, 16, 0, 0],
  [16, 1, 28, 0, 0],
  [26, 1, 44, 0, 0],
  [18, 2, 32, 0, 0],
  [24, 2, 43, 0, 0],
  [16, 4, 27, 0, 0],
  [18, 4, 31, 0, 0],
  [22, 2, 38, 2, 39],
  [22, 3, 36, 2, 37],
  [26, 4, 43, 1, 44],
];
const TOTAL = [0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346];
const REMAINDER = [0, 0, 7, 7, 7, 7, 7, 0, 0, 0, 0];

const MASKS: ((r: number, c: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

interface Decoded {
  text: string;
  version: number;
  mask: number;
}

/** Matristen metni geri oku; her adımda tutarsızlık varsa fırlat. */
function decode(text: string): Decoded {
  const { size, modules, version, mask, reserved } = encodeQr(text);

  // ── biçim bilgisi: sol üstteki kopyayı oku ve BCH ile doğrula
  const bit = (r: number, c: number): number => (modules[r]![c] ? 1 : 0);
  let format = 0;
  for (let i = 0; i <= 5; i += 1) format |= bit(8, i) << i;
  format |= bit(8, 7) << 6;
  format |= bit(8, 8) << 7;
  format |= bit(7, 8) << 8;
  for (let i = 9; i < 15; i += 1) format |= bit(14 - i, 8) << i;

  const unmasked = format ^ 0x5412;
  // BCH(15,5) kalanı sıfır olmalı — kod sözcüğü geçerliyse.
  let rem = unmasked;
  for (let i = 14; i >= 10; i -= 1) {
    if ((rem >>> i) & 1) rem ^= 0x537 << (i - 10);
  }
  if (rem !== 0) throw new Error("biçim bilgisi BCH doğrulamasından geçmedi");
  const level = (unmasked >>> 13) & 0b11;
  const readMask = (unmasked >>> 10) & 0b111;
  if (level !== 0b00) throw new Error(`hata düzeltme seviyesi M değil: ${level}`);
  if (readMask !== mask) throw new Error("duyurulan maske seçilenle uyuşmuyor");

  // ── veri modüllerini zikzakla oku, maskeyi kaldır
  const maskFn = MASKS[mask]!;
  const bits: number[] = [];
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let step = 0; step < size; step += 1) {
      const row = upward ? size - 1 - step : step;
      for (const col of [right, right - 1]) {
        if (reserved[row]![col]) continue;
        bits.push(bit(row, col) ^ (maskFn(row, col) ? 1 : 0));
      }
    }
    upward = !upward;
  }
  if (bits.length !== TOTAL[version]! * 8 + REMAINDER[version]!) {
    throw new Error(`veri modülü sayısı beklenenden farklı: ${bits.length}`);
  }

  const codewords: number[] = [];
  for (let i = 0; i + 8 <= TOTAL[version]! * 8; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j += 1) byte = (byte << 1) | bits[i + j]!;
    codewords.push(byte);
  }

  // ── ara değerlemeyi çöz
  const [ec, g1n, g1d, g2n, g2d] = BLOCKS_M[version] as number[];
  const sizes: number[] = [];
  for (let i = 0; i < g1n! + g2n!; i += 1) sizes.push(i < g1n! ? g1d! : g2d!);

  const data: number[][] = sizes.map(() => []);
  let idx = 0;
  for (let i = 0; i < Math.max(g1d!, g2d!); i += 1) {
    for (let b = 0; b < sizes.length; b += 1) {
      if (i < sizes[b]!) data[b]!.push(codewords[idx++]!);
    }
  }
  const ecc: number[][] = sizes.map(() => []);
  for (let i = 0; i < ec!; i += 1) {
    for (let b = 0; b < sizes.length; b += 1) ecc[b]!.push(codewords[idx++]!);
  }
  if (idx !== codewords.length) throw new Error("ara değerleme çözülemedi");

  // ── Reed-Solomon sendromları: hepsi sıfır olmalı
  for (let b = 0; b < sizes.length; b += 1) {
    const full = [...data[b]!, ...ecc[b]!];
    for (let s = 0; s < ec!; s += 1) {
      let acc = 0;
      for (const byte of full) acc = mul(acc, EXP[s]!) ^ byte;
      if (acc !== 0) throw new Error(`blok ${b} sendrom ${s} sıfır değil`);
    }
  }

  // ── başlığı çöz
  const flat = data.flat();
  const mode = flat[0]! >>> 4;
  if (mode !== 0b0100) throw new Error(`bayt kipi değil: ${mode}`);

  const countBits = version < 10 ? 8 : 16;
  let cursor = 4;
  const readBits = (n: number): number => {
    let out = 0;
    for (let i = 0; i < n; i += 1) {
      const byte = flat[(cursor + i) >>> 3]!;
      out = (out << 1) | ((byte >>> (7 - ((cursor + i) & 7))) & 1);
    }
    cursor += n;
    return out;
  };
  const length = readBits(countBits);
  const bytes: number[] = [];
  for (let i = 0; i < length; i += 1) bytes.push(readBits(8));

  return {
    text: new TextDecoder().decode(Uint8Array.from(bytes)),
    version,
    mask,
  };
}

describe("encodeQr — çözülerek doğrulama", () => {
  const samples = [
    "A",
    "HELLO WORLD",
    "otpauth://totp/b2b%3Apatron%40ornek.com?secret=GEZDGNBVGY3TQOJQ&issuer=b2b",
    otpauthUri({
      secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
      account: "muhasebe@cok-uzun-firma-adi-ornegi.com.tr",
      issuer: "b2b",
    }),
    "şÇğüöİ — çok baytlı",
    "x".repeat(213),
  ];

  for (const sample of samples) {
    it(`tur döner: ${sample.slice(0, 32)}${sample.length > 32 ? "…" : ""}`, () => {
      expect(decode(sample).text).toBe(sample);
    });
  }

  it("gerçek bir otpauth adresi tavanın epey altında kalır", () => {
    // Sürüm 10 sınırı aşılırsa kodlayıcı hata verir. Tipik bir adres sürüm 8
    // civarında oturuyor; e-posta adresi uzayınca bile 10'a yer var.
    const uri = otpauthUri({
      secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
      account: "patron@ornek.com",
      issuer: "b2b",
    });
    expect(new TextEncoder().encode(uri).length).toBeLessThanOrEqual(byteCapacity(8));
    expect(encodeQr(uri).version).toBeLessThanOrEqual(8);
  });

  it("uzunluğa göre en küçük sürümü seçer", () => {
    expect(encodeQr("x".repeat(14)).version).toBe(1);
    expect(encodeQr("x".repeat(15)).version).toBe(2);
    expect(encodeQr("x".repeat(213)).version).toBe(10);
  });

  it("matris boyu 17 + 4×sürüm", () => {
    for (const text of ["x", "x".repeat(60), "x".repeat(213)]) {
      const qr = encodeQr(text);
      expect(qr.size).toBe(17 + qr.version * 4);
      expect(qr.modules).toHaveLength(qr.size);
      expect(qr.modules[0]).toHaveLength(qr.size);
    }
  });

  it("kapasiteyi aşan veriyi sessizce kırpmaz", () => {
    expect(() => encodeQr("x".repeat(214))).toThrow(QrError);
  });
});

describe("işlev desenleri", () => {
  const { size, modules } = encodeQr("otpauth://totp/b2b?secret=ABCDEF");

  const dark = (r: number, c: number) => modules[r]![c];

  it("üç köşede bulucu deseni var", () => {
    for (const [row, col] of [
      [0, 0],
      [0, size - 7],
      [size - 7, 0],
    ] as const) {
      for (let r = 0; r < 7; r += 1) {
        for (let c = 0; c < 7; c += 1) {
          const expected =
            r === 0 ||
            r === 6 ||
            c === 0 ||
            c === 6 ||
            (r >= 2 && r <= 4 && c >= 2 && c <= 4);
          expect(dark(row + r, col + c)).toBe(expected);
        }
      }
    }
  });

  it("bulucu desenlerin çevresi açık (ayırıcı)", () => {
    for (let i = 0; i < 8; i += 1) {
      expect(dark(7, i)).toBe(false);
      expect(dark(i, 7)).toBe(false);
    }
  });

  it("zamanlama desenleri dönüşümlü", () => {
    for (let i = 8; i < size - 8; i += 1) {
      expect(dark(6, i)).toBe(i % 2 === 0);
      expect(dark(i, 6)).toBe(i % 2 === 0);
    }
  });

  it("daima koyu modül yerinde", () => {
    expect(dark(size - 8, 8)).toBe(true);
  });
});

describe("qrSvg", () => {
  const svg = qrSvg("otpauth://totp/b2b?secret=ABCDEF", { scale: 4, margin: 4 });

  it("tek parça, kendi kendine yeten SVG üretir", () => {
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    // Dışarıya istek yok. (xmlns bir ad alanı tanımı, adres değil — istek
    // doğuran şey `<image>`, `href` ve CSS `url()`.)
    expect(svg).not.toContain("<image");
    expect(svg).not.toContain("href");
    expect(svg).not.toContain("url(");
  });

  it("sessiz alanı boyuta katar", () => {
    const { size } = encodeQr("otpauth://totp/b2b?secret=ABCDEF");
    const total = (size + 8) * 4;
    expect(svg).toContain(`width="${total}"`);
    expect(svg).toContain(`viewBox="0 0 ${total} ${total}"`);
  });

  it("modülleri tek path'te toplar", () => {
    expect(svg.match(/<path/g)).toHaveLength(1);
    expect(svg).not.toContain("<rect x=");
  });

  it("renkler geçilebilir", () => {
    const themed = qrSvg("x", { dark: "#111827", light: "#f9fafb" });
    expect(themed).toContain('fill="#111827"');
    expect(themed).toContain('fill="#f9fafb"');
  });
});
