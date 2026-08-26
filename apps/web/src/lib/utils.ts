import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Yazı ölçeğimizin adları tailwind-merge'e ayrıca tanıtılıyor.
 *
 * `tailwind-merge` bir sınıfın hangi gruba ait olduğunu adından çıkarıyor ve
 * tanımadığı her `text-*` sınıfını **renk** sayıyor. `text-body-sm` bizde bir
 * punto ama merge onu renk sanıp aynı gruptaki `text-on-accent`i eziyordu:
 * `Button`ın `md` boyu (`text-body-sm`) rengini kaybediyor, siyah düğmenin
 * üstüne siyah yazı düşüyordu. `sm` boyu (`text-xs`) tanınan bir punto olduğu
 * için aynı düğme küçükken doğru görünüyordu — hata bu yüzden gözden kaçtı.
 *
 * Liste `tailwind.config.ts`teki `fontSize` anahtarlarıyla birebir aynı olmalı;
 * oraya yeni bir punto eklerseniz buraya da ekleyin.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "label",
            "body-sm",
            "body-md",
            "body-lg",
            "headline-sm",
            "headline-md",
            "headline-lg",
            "display",
          ],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
