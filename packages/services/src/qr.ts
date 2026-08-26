// QR kodu üretimi (ISO/IEC 18004) — bayt kipi, hata düzeltme seviyesi M.
//
// Neden burada: ekranda gösterilecek tek bir QR için (`otpauth://` adresi)
// projeye bir çizim bağımlılığı girmesi istenmedi. Aynı gerekçe `totp.ts` ve
// bağımlılıksız XLSX yazıcısındaki gerekçenin aynısı — kimlik doğrulama
// yolundaki her satır okunabilir kalsın.
//
// Kapsam bilerek dar: **yalnızca bayt kipi, yalnızca seviye M, sürüm 1–10.**
// Bu 213 bayta kadar veri alır; bir otpauth adresi 200 baytı geçmez. Sayısal
// ya da alfanümerik kip daha sıkı paketlerdi ama base32 anahtar ve URL
// kodlaması küçük harf ve işaret içeriyor — bayt kipi tek geçerli seçenek.
//
// Seviye M (%15 kurtarma) seçimi: L ekrandan okutmada kırılgan, Q ve H aynı
// veriyi daha büyük bir matrise yayar. M, telefon kamerasının standart tercihi.

// ─────────────────────────────────────────────
// tablolar (ISO/IEC 18004 Tablo 9, 13, E.1)
// ─────────────────────────────────────────────

/** Sürüm başına toplam kod sözcüğü (veri + hata düzeltme). */
const TOTAL_CODEWORDS = [0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346];

/**
 * Seviye M blok yapısı: [blok başına EC, grup1 blok, grup1 veri, grup2 blok,
 * grup2 veri]. İki grup olmasının sebebi, veri sözcüğü sayısının blok sayısına
 * tam bölünmediği sürümlerde son blokların bir sözcük uzun olması.
 */
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

/** Hizalama deseni merkezleri. Sürüm 1'de desen yok. */
const ALIGN_CENTERS: number[][] = [
  [],
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

/** Veri yerleşiminden sonra artan, hiçbir zaman okunmayan bitler. */
const REMAINDER_BITS = [0, 0, 7, 7, 7, 7, 7, 0, 0, 0, 0];

const MAX_VERSION = 10;

export class QrError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QrError";
  }
}

// ─────────────────────────────────────────────
// GF(256) — Reed-Solomon aritmetiği
// ─────────────────────────────────────────────
//
// QR, x^8+x^4+x^3+x^2+1 (0x11d) ilkel polinomuyla tanımlı Galois alanını
// kullanır. Çarpma, logaritma tablosuyla toplamaya indirgenir.

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
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

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a]! + LOG[b]!]!;
}

/**
 * Verilen derecede üretici polinom: (x-a^0)(x-a^1)…(x-a^(n-1)).
 *
 * Katsayılar baştan sona **azalan derece** sırasında: `poly[0]` daima 1.
 * `x` ile çarpmak diziyi bir uzatır (aynı indeks), sabit terimle çarpmak bir
 * sağa kaydırır — sıra ters yazılırsa polinom görünüşte doğru uzunlukta ama
 * katsayıları yanlış olur ve hata düzeltme sözcükleri sessizce bozulur.
 */
function rsGenerator(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i += 1) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j += 1) {
      next[j] = next[j]! ^ poly[j]!;
      next[j + 1] = next[j + 1]! ^ gfMul(poly[j]!, EXP[i]!);
    }
    poly = next;
  }
  return poly;
}

/** Bir veri bloğunun hata düzeltme sözcükleri: veri / üretici, kalan. */
function rsEncode(data: number[], ecLength: number): number[] {
  const gen = rsGenerator(ecLength);
  const result = new Array<number>(ecLength).fill(0);
  for (const byte of data) {
    const factor = byte ^ result[0]!;
    result.shift();
    result.push(0);
    for (let i = 0; i < ecLength; i += 1) {
      result[i] = result[i]! ^ gfMul(gen[i + 1]!, factor);
    }
  }
  return result;
}

// ─────────────────────────────────────────────
// veri akışı
// ─────────────────────────────────────────────

function dataCodewordCount(version: number): number {
  const [, g1n, g1d, g2n, g2d] = BLOCKS_M[version] as number[];
  return g1n! * g1d! + g2n! * g2d!;
}

/** Bayt kipinde bu sürüme kaç bayt sığar. */
export function byteCapacity(version: number): number {
  const countBits = version < 10 ? 8 : 16;
  return Math.floor((dataCodewordCount(version) * 8 - 4 - countBits) / 8);
}

function pickVersion(byteLength: number): number {
  for (let v = 1; v <= MAX_VERSION; v += 1) {
    if (byteCapacity(v) >= byteLength) return v;
  }
  throw new QrError(
    `Veri bu kodlayıcı için fazla uzun (${byteLength} bayt; sürüm ` +
      `${MAX_VERSION} en fazla ${byteCapacity(MAX_VERSION)} bayt alır).`,
  );
}

class BitBuffer {
  private bits: number[] = [];

  push(value: number, length: number): void {
    for (let i = length - 1; i >= 0; i -= 1) {
      this.bits.push((value >>> i) & 1);
    }
  }

  get length(): number {
    return this.bits.length;
  }

  /** Bayta tamamla; eksik bitler sıfır. */
  toBytes(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j += 1) byte = (byte << 1) | (this.bits[i + j] ?? 0);
      out.push(byte);
    }
    return out;
  }
}

/**
 * Veri kod sözcükleri: başlık + veri + sonlandırıcı + dolgu.
 *
 * Dolgu baytları (0xEC, 0x11) standardın belirlediği değerler; rastgele dolgu
 * maskeleme cezasını yükseltir ve okunabilirliği düşürür.
 */
function buildDataCodewords(bytes: Uint8Array, version: number): number[] {
  const dataCodewords = dataCodewordCount(version);
  const capacityBits = dataCodewords * 8;

  const buf = new BitBuffer();
  buf.push(0b0100, 4); // bayt kipi
  buf.push(bytes.length, version < 10 ? 8 : 16);
  for (const b of bytes) buf.push(b, 8);

  // Sonlandırıcı en fazla 4 bit; kalan yer daha azsa o kadarı yazılır.
  buf.push(0, Math.min(4, capacityBits - buf.length));
  if (buf.length % 8 !== 0) buf.push(0, 8 - (buf.length % 8));

  const out = buf.toBytes();
  for (let i = 0; out.length < dataCodewords; i += 1) {
    out.push(i % 2 === 0 ? 0xec : 0x11);
  }
  return out;
}

/**
 * Blokları böl, EC üret, standardın istediği sırayla ara-değerle.
 *
 * Ara değerleme (interleaving) keyfi değil: matriste bitişik duran
 * sözcüklerin farklı bloklara ait olmasını sağlar, böylece kodun bir köşesine
 * düşen leke tek bir bloğu tüketmez, hasarı bloklara dağıtır.
 */
function interleave(dataCodewords: number[], version: number): number[] {
  const [ec, g1n, g1d, g2n, g2d] = BLOCKS_M[version] as number[];

  const blocks: number[][] = [];
  const ecBlocks: number[][] = [];
  let offset = 0;
  for (let i = 0; i < g1n! + g2n!; i += 1) {
    const size = i < g1n! ? g1d! : g2d!;
    const block = dataCodewords.slice(offset, offset + size);
    offset += size;
    blocks.push(block);
    ecBlocks.push(rsEncode(block, ec!));
  }

  const out: number[] = [];
  const maxData = Math.max(g1d!, g2d!);
  for (let i = 0; i < maxData; i += 1) {
    for (const block of blocks) if (i < block.length) out.push(block[i]!);
  }
  for (let i = 0; i < ec!; i += 1) {
    for (const block of ecBlocks) out.push(block[i]!);
  }
  return out;
}

// ─────────────────────────────────────────────
// matris
// ─────────────────────────────────────────────

type Grid = Uint8Array[];

function emptyGrid(size: number): Grid {
  return Array.from({ length: size }, () => new Uint8Array(size));
}

function placeFinder(grid: Grid, reserved: Grid, row: number, col: number): void {
  // 7×7 desen + 1 modüllük ayırıcı. Ayırıcı da rezerve edilir; yoksa veri
  // modülleriyle birleşip okuyucunun köşe bulmasını engeller.
  for (let r = -1; r <= 7; r += 1) {
    for (let c = -1; c <= 7; c += 1) {
      const rr = row + r;
      const cc = col + c;
      if (rr < 0 || cc < 0 || rr >= grid.length || cc >= grid.length) continue;
      const dark =
        r >= 0 &&
        r <= 6 &&
        c >= 0 &&
        c <= 6 &&
        (r === 0 ||
          r === 6 ||
          c === 0 ||
          c === 6 ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4));
      grid[rr]![cc] = dark ? 1 : 0;
      reserved[rr]![cc] = 1;
    }
  }
}

/** BCH(18,6) — sürüm numarasının hataya dayanıklı hâli. */
function versionBits(version: number): number {
  let rem = version;
  for (let i = 0; i < 12; i += 1) {
    rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  }
  return ((version << 12) | rem) >>> 0;
}

/** BCH(15,5) + 0x5412 maskesi — seviye ve maske numarasının kodlanmışı. */
function formatBits(maskIndex: number): number {
  const data = (0b00 << 3) | maskIndex; // 0b00 = seviye M
  let rem = data;
  for (let i = 0; i < 10; i += 1) {
    rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  }
  return (((data << 10) | rem) ^ 0x5412) >>> 0;
}

function placeFunctionPatterns(grid: Grid, reserved: Grid, version: number): void {
  const size = grid.length;

  placeFinder(grid, reserved, 0, 0);
  placeFinder(grid, reserved, 0, size - 7);
  placeFinder(grid, reserved, size - 7, 0);

  // Zamanlama desenleri — okuyucunun modül ızgarasını hizaladığı çizgiler.
  for (let i = 8; i < size - 8; i += 1) {
    const dark = i % 2 === 0 ? 1 : 0;
    grid[6]![i] = dark;
    reserved[6]![i] = 1;
    grid[i]![6] = dark;
    reserved[i]![6] = 1;
  }

  // Hizalama desenleri; bulucu desenlerle çakışanlar atlanır.
  const centers = ALIGN_CENTERS[version] as number[];
  for (const r of centers) {
    for (const c of centers) {
      const nearFinder =
        (r <= 8 && c <= 8) ||
        (r <= 8 && c >= size - 9) ||
        (r >= size - 9 && c <= 8);
      if (nearFinder) continue;
      for (let dr = -2; dr <= 2; dr += 1) {
        for (let dc = -2; dc <= 2; dc += 1) {
          grid[r + dr]![c + dc] =
            Math.max(Math.abs(dr), Math.abs(dc)) !== 1 ? 1 : 0;
          reserved[r + dr]![c + dc] = 1;
        }
      }
    }
  }

  // Biçim bilgisi alanları (değeri sonra yazılır) + daima koyu modül.
  for (let i = 0; i < 9; i += 1) {
    reserved[8]![i] = 1;
    reserved[i]![8] = 1;
  }
  for (let i = 0; i < 8; i += 1) {
    reserved[8]![size - 1 - i] = 1;
    reserved[size - 1 - i]![8] = 1;
  }
  grid[size - 8]![8] = 1;
  reserved[size - 8]![8] = 1;

  // Sürüm bilgisi yalnızca 7 ve üstünde vardır.
  if (version >= 7) {
    const bits = versionBits(version);
    for (let i = 0; i < 18; i += 1) {
      const bit = (bits >>> i) & 1;
      const a = Math.floor(i / 3);
      const b = (i % 3) + size - 11;
      grid[a]![b] = bit;
      reserved[a]![b] = 1;
      grid[b]![a] = bit;
      reserved[b]![a] = 1;
    }
  }
}

function placeFormatBits(grid: Grid, maskIndex: number): void {
  const size = grid.length;
  const bits = formatBits(maskIndex);

  // İki kopya yazılır: biri sol üst köşede, biri diğer iki köşeye bölünmüş.
  // Kod kısmen hasar görse bile biçim bilgisi okunabilsin diye.
  for (let i = 0; i <= 5; i += 1) grid[8]![i] = (bits >>> i) & 1;
  grid[8]![7] = (bits >>> 6) & 1;
  grid[8]![8] = (bits >>> 7) & 1;
  grid[7]![8] = (bits >>> 8) & 1;
  for (let i = 9; i < 15; i += 1) grid[14 - i]![8] = (bits >>> i) & 1;

  // İkinci kopya 7 + 8 bölünür. Sol alttaki parça **yedi** modül: sekizinci
  // sıra (size-8, 8) daima koyu modüldür ve biçim bilgisine ait değildir —
  // üzerine yazmak okuyucunun sürüm hizalamasını bozar.
  for (let i = 0; i < 7; i += 1) grid[size - 1 - i]![8] = (bits >>> i) & 1;
  for (let i = 7; i < 15; i += 1) grid[8]![size - 15 + i] = (bits >>> i) & 1;
}

/**
 * Veriyi sağ alt köşeden başlayarak ikişer sütunluk zikzakla yerleştir.
 * 6. sütun atlanır — orada dikey zamanlama deseni vardır.
 */
function placeData(
  grid: Grid,
  reserved: Grid,
  codewords: number[],
  version: number,
): void {
  const size = grid.length;
  const dataBits = codewords.length * 8;
  const totalBits = dataBits + REMAINDER_BITS[version]!;
  let bitIndex = 0;
  let upward = true;

  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let step = 0; step < size; step += 1) {
      const row = upward ? size - 1 - step : step;
      for (const col of [right, right - 1]) {
        if (reserved[row]![col]) continue;
        // Artık bitler sıfır kalır; okuyucu onları hiç okumaz.
        const bit =
          bitIndex < dataBits
            ? (codewords[bitIndex >>> 3]! >>> (7 - (bitIndex & 7))) & 1
            : 0;
        grid[row]![col] = bit;
        bitIndex += 1;
      }
    }
    upward = !upward;
  }

  /* c8 ignore next 4 */
  if (bitIndex !== totalBits) {
    throw new QrError(
      `Yerleşim tutarsız: ${bitIndex} bit yazıldı, ${totalBits} bekleniyordu.`,
    );
  }
}

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

function applyMask(grid: Grid, reserved: Grid, maskIndex: number): Grid {
  const out = grid.map((row) => Uint8Array.from(row));
  const mask = MASKS[maskIndex]!;
  for (let r = 0; r < grid.length; r += 1) {
    for (let c = 0; c < grid.length; c += 1) {
      if (reserved[r]![c]) continue;
      if (mask(r, c)) out[r]![c] = out[r]![c]! ^ 1;
    }
  }
  return out;
}

/**
 * Maske cezası (ISO/IEC 18004 §8.8.2). Dört kural, düşük puan iyi.
 *
 * Amaç okuyucuyu yanıltacak desenlerden kaçınmak: uzun tek renk koşuları,
 * geniş tek renk alanları, bulucu desene benzeyen diziler ve renk dengesizliği.
 */
export function maskPenalty(grid: readonly (readonly number[])[]): number {
  const size = grid.length;
  let score = 0;

  // Kural 1: 5 ve üzeri aynı renk koşusu.
  for (let i = 0; i < size; i += 1) {
    for (const horizontal of [true, false]) {
      let run = 1;
      for (let j = 1; j < size; j += 1) {
        const prev = horizontal ? grid[i]![j - 1] : grid[j - 1]![i];
        const cur = horizontal ? grid[i]![j] : grid[j]![i];
        if (cur === prev) {
          run += 1;
          if (run === 5) score += 3;
          else if (run > 5) score += 1;
        } else run = 1;
      }
    }
  }

  // Kural 2: 2×2 tek renk blokları.
  for (let r = 0; r < size - 1; r += 1) {
    for (let c = 0; c < size - 1; c += 1) {
      const v = grid[r]![c];
      if (
        v === grid[r]![c + 1] &&
        v === grid[r + 1]![c] &&
        v === grid[r + 1]![c + 1]
      ) {
        score += 3;
      }
    }
  }

  // Kural 3: bulucu desene benzeyen 1:1:3:1:1 dizisi.
  const p1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const p2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  for (let i = 0; i < size; i += 1) {
    for (let j = 0; j + 11 <= size; j += 1) {
      let h1 = true;
      let h2 = true;
      let v1 = true;
      let v2 = true;
      for (let k = 0; k < 11; k += 1) {
        const h = grid[i]![j + k];
        const v = grid[j + k]![i];
        if (h !== p1[k]) h1 = false;
        if (h !== p2[k]) h2 = false;
        if (v !== p1[k]) v1 = false;
        if (v !== p2[k]) v2 = false;
      }
      if (h1) score += 40;
      if (h2) score += 40;
      if (v1) score += 40;
      if (v2) score += 40;
    }
  }

  // Kural 4: koyu modül oranının %50'den sapması.
  let dark = 0;
  for (const row of grid) for (const v of row) dark += v;
  const percent = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;

  return score;
}

export interface QrMatrix {
  /** Kenar uzunluğu (modül sayısı, sessiz alan hariç). */
  size: number;
  /** `modules[row][col]` — true = koyu. */
  modules: boolean[][];
  version: number;
  /** Seçilen maske (0–7). Biçim bilgisinde de duyurulur. */
  mask: number;
  /**
   * Hangi modüller işlev deseni (bulucu, zamanlama, hizalama, biçim/sürüm
   * bilgisi). Veri modülleri `false`.
   *
   * Dışarı veriliyor çünkü kodu **çözerek** doğrulamanın tek yolu bu: veri
   * bitlerinin nerede olduğunu bilmeden matristen kod sözcüğü okunamaz.
   */
  reserved: boolean[][];
}

/** Metni QR matrisine çevir. */
export function encodeQr(text: string): QrMatrix {
  const bytes = new TextEncoder().encode(text);
  const version = pickVersion(bytes.length);
  const size = 17 + version * 4;

  const codewords = interleave(buildDataCodewords(bytes, version), version);
  /* c8 ignore next 5 */
  if (codewords.length !== TOTAL_CODEWORDS[version]) {
    throw new QrError(
      `Kod sözcüğü sayısı tutmadı: ${codewords.length} / ${TOTAL_CODEWORDS[version]}.`,
    );
  }

  const base = emptyGrid(size);
  const reserved = emptyGrid(size);
  placeFunctionPatterns(base, reserved, version);
  placeData(base, reserved, codewords, version);

  // Sekiz maskeyi de dene, en düşük cezayı seç. Standart bunu şart koşuyor;
  // seçilen maske kodun kendisinde saklı değil, biçim bilgisinde duyurulur.
  let best: Grid | null = null;
  let bestMask = 0;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let m = 0; m < 8; m += 1) {
    const candidate = applyMask(base, reserved, m);
    placeFormatBits(candidate, m);
    const score = maskPenalty(candidate.map((row) => Array.from(row)));
    if (score < bestScore) {
      bestScore = score;
      bestMask = m;
      best = candidate;
    }
  }

  return {
    size,
    version,
    mask: bestMask,
    modules: best!.map((row) => Array.from(row, (v) => v === 1)),
    reserved: reserved.map((row) => Array.from(row, (v) => v === 1)),
  };
}

/**
 * QR'ı SVG olarak üret.
 *
 * SVG seçimi: her ölçekte keskin ve sunucudan istemciye düz metin olarak
 * gider. Hazır bir QR *servisi* kullanmak, hesabın TOTP anahtarını üçüncü bir
 * tarafın sunucusuna göndermek olurdu — bu yüzden çizim yerelde yapılıyor.
 */
export function qrSvg(
  text: string,
  options: { scale?: number; margin?: number; dark?: string; light?: string } = {},
): string {
  const { size, modules } = encodeQr(text);
  const scale = options.scale ?? 6;
  // Sessiz alan standarda göre 4 modül; daha darı okumayı zorlaştırır.
  const margin = options.margin ?? 4;
  const total = (size + margin * 2) * scale;

  // Tek bir `path`: modül başına `rect` üretmek aynı görüntü için on kat
  // büyük bir belge demek.
  let path = "";
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (!modules[r]![c]) continue;
      const x = (c + margin) * scale;
      const y = (r + margin) * scale;
      path += `M${x} ${y}h${scale}v${scale}h-${scale}z`;
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="${total}" ` +
    `viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" role="img" ` +
    `aria-label="QR kodu">` +
    `<rect width="${total}" height="${total}" fill="${options.light ?? "#ffffff"}"/>` +
    `<path d="${path}" fill="${options.dark ?? "#000000"}"/>` +
    `</svg>`
  );
}
