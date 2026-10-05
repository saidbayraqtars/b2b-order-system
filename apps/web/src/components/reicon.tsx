import { cn } from "@/lib/utils";
import { REICON_SVG } from "./reicon-data";

// Reicon ikonları (github.com/dqev/reicon, MIT). SVG içeriği üretilmiş
// `reicon-data.ts` dosyasından geliyor; bu dosya yalnızca onu bir React
// bileşenine sarıyor. Lucide bileşenleriyle aynı imza (`className`), menü ve
// düğmeler ikisini ayırt etmeden kullanabilsin diye.

export type IconComponent = (props: { className?: string }) => JSX.Element;

function reicon(name: string): IconComponent {
  const svg = REICON_SVG[name];
  if (!svg) throw new Error(`Reicon ikonu yok: ${name} — scripts/reicon-ekle.mjs ile ekleyin`);
  function Icon({ className }: { className?: string }) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
        className={cn("h-4 w-4", className)}
        dangerouslySetInnerHTML={{ __html: svg! }}
      />
    );
  }
  Icon.displayName = `Reicon(${name})`;
  return Icon;
}

/** Özel kodlar: köşeli kare içinde diyez. */
export const HashtagSquareIcon = reicon("it/hashtag-square");

/** Modüller: dört parçalı ızgara. */
export const WidgetIcon = reicon("settings/widget");

/** Siparişler: satırlı fatura. */
export const BillListIcon = reicon("money/bill-list");
