import { fillTokens, type LabelData } from "@repo/services";
import type { LabelBlock } from "@repo/types";

/**
 * Şablonu kâğıda çizer.
 *
 * Tasarım satır listesi olduğu için çizim de satır satır: mutlak konum yok,
 * yükseklik içeriğe göre uzar. 80 mm'lik termal yazıcı zaten böyle çalışıyor,
 * ve etikette de aynı düzeni kullanmak "önizlemede güzel, kâğıtta bozuk"
 * sorununu ortadan kaldırıyor.
 *
 * Barkod, ayrı bir kütüphane yerine CSS ile çizilmiş çizgi deseni: Code128
 * üretmek için paket eklemek, sadece görsel bir referans için ağır kalıyordu.
 * Okunabilir bir barkod gerektiğinde `barcode` bloğu tek yerden değişecek.
 */
export function LabelSheet({
  template,
  data,
}: {
  template: { widthMm: number; heightMm: number | null; blocks: LabelBlock[] };
  data: LabelData;
}) {
  return (
    <section
      className="label-page bg-white text-black"
      style={{
        width: `${template.widthMm}mm`,
        ...(template.heightMm ? { height: `${template.heightMm}mm` } : {}),
      }}
    >
      {template.blocks.map((b, i) => (
        <Block key={i} block={b} data={data} />
      ))}
    </section>
  );
}

function Block({ block, data }: { block: LabelBlock; data: LabelData }) {
  const style = {
    textAlign: block.align,
    fontWeight: block.bold ? 700 : 400,
    fontSize: `${block.scale * 3.2}mm`,
    lineHeight: 1.25,
  } as const;

  switch (block.kind) {
    case "text": {
      const text = fillTokens(block.value ?? "", data.fields);
      // Tamamen boşalan satır çizilmiyor: doldurulmamış alan yüzünden fişte
      // açıklanamayan boşluk kalmasın.
      if (!text.trim()) return null;
      return <p style={style}>{text}</p>;
    }

    case "divider":
      return <hr className="my-1 border-t border-dashed border-black" />;

    case "spacer":
      return <div style={{ height: `${block.scale * 4}mm` }} />;

    case "barcode": {
      const value = fillTokens(block.value ?? "", data.fields);
      if (!value.trim()) return null;
      return (
        <div style={{ textAlign: block.align }}>
          <Bars value={value} />
          <p style={{ fontSize: "2.6mm", letterSpacing: "0.4mm" }}>{value}</p>
        </div>
      );
    }

    case "qr": {
      // Karekod için de aynı gerekçe: içerik metin olarak basılıyor, gerçek QR
      // gerektiğinde tek blok değişecek.
      const value = fillTokens(block.value ?? "", data.fields);
      if (!value.trim()) return null;
      return (
        <p style={{ ...style, fontFamily: "monospace", fontSize: "2.6mm" }}>
          {value}
        </p>
      );
    }

    case "items":
      return (
        <table className="w-full" style={{ fontSize: "2.9mm" }}>
          <tbody>
            {data.items.map((it, i) => (
              <tr key={i}>
                <td className="align-top">
                  {it.name}
                  <span className="block text-[2.4mm] opacity-70">{it.sku}</span>
                </td>
                <td className="whitespace-nowrap pl-1 text-right align-top">
                  {it.quantity} ad
                </td>
                <td className="whitespace-nowrap pl-1 text-right align-top">
                  {it.total}
                </td>
              </tr>
            ))}
            {data.items.length === 0 && (
              <tr>
                <td className="py-1 text-center opacity-70">Kalem yok</td>
              </tr>
            )}
          </tbody>
        </table>
      );

    case "totals":
      return (
        <table className="w-full" style={{ fontSize: "3mm" }}>
          <tbody>
            {data.totals.map((t, i) => (
              <tr key={i}>
                <td>{t.label}</td>
                <td className="text-right font-semibold">{t.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );

    case "signature":
      return (
        <div className="mt-2">
          <p style={{ fontSize: "3mm" }}>
            {fillTokens(block.value || "İmza", data.fields)}:
          </p>
          <div className="mt-6 border-t border-black" />
        </div>
      );
  }
}

/** Görsel barkod bandı — sabit desen, okunabilir bir kod değil. */
function Bars({ value }: { value: string }) {
  // Aynı metin her zaman aynı deseni versin diye basit bir toplam kullanılıyor;
  // rastgele olsaydı iki basımda iki farklı görüntü çıkardı.
  const widths = Array.from(value).map(
    (ch) => (ch.charCodeAt(0) % 3) + 1,
  );
  return (
    <div className="flex h-8 items-end justify-center gap-[0.3mm]">
      {widths.map((w, i) => (
        <span
          key={i}
          className="block h-full bg-black"
          style={{ width: `${w * 0.3}mm` }}
        />
      ))}
    </div>
  );
}
