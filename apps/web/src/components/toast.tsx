"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

// Kaydetme onayı.
//
// Ekranların yarısında bir mutasyonun `onSuccess`i yalnızca
// `invalidateQueries` çağırıyordu: kategori adını değiştiriyorsunuz, liste
// sessizce tazeleniyor ve hiçbir şey "oldu" demiyor. Hata satırının
// (`ErrorLine`) karşılığı yoktu.
//
// Tasarım dilindeki karşılığı: **yeşil, küçük, kendiliğinden sönen — kutu
// değil.** Sağ altta bir şerit; ekranın akışını bozmuyor, kimseden onay
// istemiyor ve dört saniyede kayboluyor. Bir onay penceresi olsaydı her
// kaydetmeden sonra bir tık daha isterdi.

interface Toast {
  id: number;
  message: string;
}

interface ToastApi {
  /** "Kaydedildi", "Kampanya kapatıldı" — kısa, geçmiş zaman. */
  notify: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Şeridin ekranda kalma süresi. */
const LIFETIME_MS = 4000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const notify = useCallback((message: string) => {
    const id = ++seq.current;
    setToasts((list) => [...list, { id, message }]);
  }, []);

  const api = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* `aria-live="polite"`: ekran okuyucu bulunduğu yeri kaybetmeden
          duyuruyu okuyor. Şerit görsel olarak akışın dışında ama sesli
          okumada akışın içinde olmak zorunda. */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2"
      >
        {toasts.map((t) => (
          <ToastLine
            key={t.id}
            toast={t}
            onDone={() =>
              setToasts((list) => list.filter((x) => x.id !== t.id))
            }
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastLine({ toast, onDone }: { toast: Toast; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, LIFETIME_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast.id]);

  return (
    <div
      className={cn(
        "pointer-events-auto flex items-center gap-2 rounded border border-positive/30 bg-panel px-3 py-2 shadow-pop",
        "text-body-sm text-positive animate-fade-in",
      )}
    >
      <Check className="h-4 w-4 shrink-0" />
      {toast.message}
    </div>
  );
}

/**
 * Sağlayıcı yoksa çağrı sessizce düşüyor.
 *
 * Bilerek: bileşenler testlerde ve Storybook benzeri yalıtılmış ortamlarda
 * sağlayıcısız da çiziliyor ve "kaydedildi" diyememek bir hata değil. Hata
 * fırlatmak, kaydetmenin kendisini bir bildirim ayrıntısına bağlardı.
 */
export function useToast(): ToastApi {
  return useContext(ToastContext) ?? NOOP;
}

const NOOP: ToastApi = { notify: () => undefined };
