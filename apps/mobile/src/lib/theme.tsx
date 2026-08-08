import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { vars } from "nativewind";
import * as SecureStore from "expo-secure-store";
import { useQuery } from "@tanstack/react-query";
import {
  FALLBACK_PACK,
  THEME_PACKS,
  colorVars,
  colorsOf,
  radiusPixelVars,
  resolveTheme,
  schemesOf,
} from "@repo/theme";
import type { SchemeName, ThemeColors, ThemePack } from "@repo/theme";
import { API_BASE } from "@/lib/api";

/**
 * Tasarım paketi, telefonda.
 *
 * Web vitrini paketleri doğrudan içe aktarıyor; telefon aynısını yapıyor ama
 * bir ek yolu var: kurulumun `/api/theme` ucu, uygulamanın hiç bilmediği bir
 * paketi de gönderebiliyor. Renkler veri olduğu için bunu uygulamak için yeni
 * sürüm gerekmiyor — mağazadan güncelleme beklemeden vitrinle aynı kimliğe
 * geçiyor.
 *
 * Sıra: kişinin cihazdaki seçimi > kurulumun sunucudaki tercihi > paketin
 * kendi varsayılanı. Sunucuya ulaşılamıyorsa gömülü paketlerle çalışmaya devam
 * eder; renk yüzünden açılmayan bir uygulama, renksiz açılan uygulamadan
 * kötüdür.
 */

const PACK_KEY = "theme-pack";
const SCHEME_KEY = "theme-scheme";

/** `/api/theme`'in gönderdiği paket. Gömülü `ThemePack`'in alt kümesi. */
interface RemotePack {
  id: string;
  name: string;
  tagline: string;
  defaultScheme: SchemeName;
  schemes: Partial<Record<SchemeName, ThemeColors>>;
  radii: ThemePack["radii"];
}

interface ThemeResponse {
  active: { pack: string; scheme: SchemeName | null };
  switcher: boolean;
  packs: RemotePack[];
}

/** Gömülü paketler, uzaktakiyle aynı biçimde. Ağ yokken kullanılan liste. */
const BUNDLED: RemotePack[] = THEME_PACKS.map((pack) => ({
  id: pack.id,
  name: pack.name,
  tagline: pack.tagline,
  defaultScheme: pack.defaultScheme,
  schemes: Object.fromEntries(
    schemesOf(pack).map((scheme) => [scheme, colorsOf(pack, scheme)]),
  ),
  radii: pack.radii,
}));

interface ThemeValue {
  packs: RemotePack[];
  pack: RemotePack;
  scheme: SchemeName;
  /**
   * Çözülmüş renkler, ham hâlde. NativeWind sınıfı yetmeyen tek yer için:
   * gezinme başlığı ve durum çubuğu yerli görünümler, düz renk dizesi ister.
   */
  colors: ThemeColors;
  switcher: boolean;
  setPack: (id: string) => void;
  setScheme: (scheme: SchemeName) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme, ThemeProvider içinde çağrılmalı");
  return value;
}

function schemesOfRemote(pack: RemotePack): SchemeName[] {
  return (["light", "dark"] as const).filter((s) => pack.schemes[s] !== undefined);
}

function pickPack(packs: RemotePack[], id: string | null): RemotePack {
  return (
    packs.find((p) => p.id === id) ??
    packs.find((p) => p.id === FALLBACK_PACK.id) ??
    packs[0]!
  );
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Sunucudaki liste yalnızca kurulumun tercihini ve tanımadığımız paketleri
  // getiriyor; başarısız olursa gömülü liste zaten doğru cevap.
  const remote = useQuery<ThemeResponse>({
    queryKey: ["theme"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/theme`);
      if (!res.ok) throw new Error("tema alınamadı");
      return (await res.json()) as ThemeResponse;
    },
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const [chosenPack, setChosenPack] = useState<string | null>(null);
  const [chosenScheme, setChosenScheme] = useState<SchemeName | null>(null);

  // Cihazdaki seçim. Okunana kadar kurulumun tercihi geçerli — ilk kareyi
  // beklemeden çizmek, doğru renge bir kare sonra geçmekten iyi.
  useEffect(() => {
    void (async () => {
      const [pack, scheme] = await Promise.all([
        SecureStore.getItemAsync(PACK_KEY),
        SecureStore.getItemAsync(SCHEME_KEY),
      ]);
      if (pack) setChosenPack(pack);
      if (scheme === "light" || scheme === "dark") setChosenScheme(scheme);
    })();
  }, []);

  const packs = remote.data?.packs.length ? remote.data.packs : BUNDLED;
  const pack = pickPack(packs, chosenPack ?? remote.data?.active.pack ?? null);

  const available = schemesOfRemote(pack);
  const wanted = chosenScheme ?? remote.data?.active.scheme ?? pack.defaultScheme;
  const scheme = available.includes(wanted) ? wanted : pack.defaultScheme;

  const setPack = useCallback((id: string) => {
    setChosenPack(id);
    void SecureStore.setItemAsync(PACK_KEY, id);
  }, []);

  const setScheme = useCallback((next: SchemeName) => {
    setChosenScheme(next);
    void SecureStore.setItemAsync(SCHEME_KEY, next);
  }, []);

  // Paket bozuk geldiyse (sunucu yeni bir alan ekledi, biz eskisiyiz) gömülü
  // varsayılana düşülür — renk yüzünden boş ekran çizmenin âlemi yok.
  const colors =
    pack.schemes[scheme] ??
    pack.schemes[pack.defaultScheme] ??
    colorsOf(FALLBACK_PACK, FALLBACK_PACK.defaultScheme);

  const style = useMemo(
    () => vars({ ...colorVars(colors), ...radiusPixelVars(pack.radii) }),
    [colors, pack.radii],
  );

  const value = useMemo<ThemeValue>(
    () => ({
      packs,
      pack,
      scheme,
      colors,
      switcher: remote.data?.switcher ?? true,
      setPack,
      setScheme,
    }),
    [packs, pack, scheme, colors, remote.data?.switcher, setPack, setScheme],
  );

  return (
    <ThemeContext.Provider value={value}>
      {/* Değişkenleri yazan görünümün `className`'i **yok**, olamaz da:
          NativeWind aynı görünümde `className`'den ürettiği stille `style`
          propunu birleştirirken `vars()`'ın ürettiği özel stil düşüyor ve tüm
          `--c-*` tanımsız kalıyor. Sonucu ekranda görmek zor — renk
          çözülemediği için yazılar saydam çiziliyor, sayfa "boş" görünüyor ama
          hata vermiyor. Bu yüzden değişken katmanı ile boyanan katman iki ayrı
          görünüm. */}
      <View style={[style, { flex: 1 }]}>
        <View className="flex-1 bg-bg">{children}</View>
      </View>
    </ThemeContext.Provider>
  );
}

/**
 * Sunum anahtarı — webdeki paletin telefondaki karşılığı.
 *
 * Ekranın kendisine değil, bir düğmeye bağlı: sürekli görünen yüzen bir kontrol
 * dar ekranda listenin üstüne oturur ve asıl işi engeller. `tenant.json`
 * `theme.switcher` kapalıysa hiç çizilmez.
 */
export function ThemePicker({ onClose }: { onClose: () => void }) {
  const { packs, pack, scheme, setPack, setScheme } = useTheme();
  const schemes = schemesOfRemote(pack);

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        className="flex-1 justify-end"
        style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      >
        <Pressable onPress={(e) => e.stopPropagation()}>
          <View className="rounded-t-xl border-t border-border bg-surface p-4">
            <Text className="mb-3 text-xs font-semibold uppercase tracking-widest text-fg-muted">
              Tasarım paketi
            </Text>

            <ScrollView className="max-h-80">
              {packs.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => setPack(p.id)}
                  className={`mb-2 rounded-lg border p-3 ${
                    p.id === pack.id
                      ? "border-primary bg-primary-soft"
                      : "border-border bg-surface2"
                  }`}
                >
                  <Text
                    className={`text-sm font-semibold ${
                      p.id === pack.id ? "text-on-primary-soft" : "text-fg"
                    }`}
                  >
                    {p.name}
                  </Text>
                  <Text className="mt-0.5 text-xs text-fg-muted">{p.tagline}</Text>
                </Pressable>
              ))}
            </ScrollView>

            {schemes.length > 1 && (
              <View className="mt-1 flex-row gap-2 border-t border-border pt-3">
                {schemes.map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => setScheme(s)}
                    className={`flex-1 rounded-lg py-2 ${
                      s === scheme ? "bg-primary" : "bg-surface2"
                    }`}
                  >
                    <Text
                      className={`text-center text-xs font-semibold ${
                        s === scheme ? "text-on-primary" : "text-fg-muted"
                      }`}
                    >
                      {s === "light" ? "Aydınlık" : "Karanlık"}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            <Pressable onPress={onClose} className="mt-3 py-2">
              <Text className="text-center text-sm text-fg-muted">Kapat</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Paket seçiciyi açan küçük düğme. Kurulum kapattıysa hiçbir şey çizmez. */
export function ThemeButton({ className = "" }: { className?: string }) {
  const { switcher } = useTheme();
  const [open, setOpen] = useState(false);

  if (!switcher) return null;

  return (
    <>
      <Pressable onPress={() => setOpen(true)} className={className}>
        <Text className="text-xs font-medium text-fg-muted">Tema</Text>
      </Pressable>
      {open && <ThemePicker onClose={() => setOpen(false)} />}
    </>
  );
}

export { resolveTheme };
