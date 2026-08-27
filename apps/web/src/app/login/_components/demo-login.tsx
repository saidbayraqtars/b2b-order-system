"use client";

import { useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

// Gösterim girişi — **yalnızca geliştirme ortamında** çizilir.
//
// Sunum kaydında sekiz ayrı hesapla sekiz pencere açılıyor ve her birine elle
// e-posta/şifre yazmak, kaydın en kırılgan dakikası: yanlış yazılan bir şifre
// ekranda hata olarak duruyor. Bu blok o adımı kaldırıyor.
//
// İki kullanımı var:
//   /login?demo=patron           → sayfa açılır açılmaz o hesapla girer
//   /login                       → düğme listesi çıkar, tek tıkla girilir
//
// Güvenlik sınırı sunucuda: bileşeni çizen `page.tsx`, `NODE_ENV` üretimse bu
// dosyayı hiç render etmiyor. Şifre de burada duruyor çünkü gösterim
// hesaplarının şifresi zaten depoda açık (`DEMO-KULLANICILAR.md`) ve gerçek bir
// kurulumda `seed-demo` hiç çalıştırılmıyor.

const DEMO_PASSWORD = "143688";

interface DemoAccount {
  key: string;
  email: string;
  label: string;
  role: string;
  /** Giriş sonrası açılacak ekran — pencerenin işi bu. */
  landing: string;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    key: "patron",
    email: "patron@bayraktar.local",
    label: "Patron",
    role: "Yönetim",
    landing: "/admin",
  },
  {
    key: "it",
    email: "it@bayraktar.local",
    label: "IT Ekibi",
    role: "Yönetim",
    landing: "/admin/stok",
  },
  {
    key: "muhasebe",
    email: "muhasebe@bayraktar.local",
    label: "Muhasebe",
    role: "Yönetim",
    landing: "/admin/kasa",
  },
  {
    key: "satismudur",
    email: "satismudur@bayraktar.local",
    label: "Satış Müdürü",
    role: "Yönetim",
    landing: "/reports",
  },
  {
    key: "temsilci1",
    email: "temsilci1@bayraktar.local",
    label: "Ahmet Yılmaz",
    role: "Plasiyer",
    landing: "/rep",
  },
  {
    key: "kurye1",
    email: "kurye1@bayraktar.local",
    label: "Murat Şen",
    role: "Kurye",
    landing: "/kurye",
  },
  {
    key: "akbayi",
    email: "yonetici@akbayi.local",
    label: "Ak Bayi Yöneticisi",
    role: "Bayi",
    landing: "/portal",
  },
  {
    key: "zincir",
    email: "yonetici@zincirmarket.local",
    label: "Zincir Market Yöneticisi",
    role: "Bayi",
    landing: "/portal",
  },
  {
    key: "sahinpersonel",
    email: "personel@sahintoptan.local",
    label: "Şahin Toptan Personeli",
    role: "Bayi (onaya düşer)",
    landing: "/portal",
  },
  {
    key: "sahinyonetici",
    email: "yonetici@sahintoptan.local",
    label: "Şahin Toptan Yöneticisi",
    role: "Bayi (onaylar)",
    landing: "/portal/approvals",
  },
];

export function DemoLogin() {
  const router = useRouter();
  const params = useSearchParams();
  const requested = params.get("demo");
  const callbackUrl = params.get("callbackUrl");

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Otomatik giriş bir kez denenir: başarısız olursa React'in yeniden
  // çizmesiyle sonsuz döngüye girmemeli.
  const attempted = useRef(false);

  async function enter(account: DemoAccount) {
    setBusy(account.key);
    setError(null);
    const res = await signIn("credentials", {
      email: account.email,
      password: DEMO_PASSWORD,
      redirect: false,
    });
    setBusy(null);

    if (res?.error) {
      setError(
        `${account.email} ile girilemedi. Gösterim verisi yüklü mü? (db:seed-demo)`,
      );
      return;
    }
    router.push(callbackUrl || account.landing);
    router.refresh();
  }

  useEffect(() => {
    if (!requested || attempted.current) return;
    const account = DEMO_ACCOUNTS.find((a) => a.key === requested);
    if (!account) {
      setError(`Bilinmeyen gösterim hesabı: ${requested}`);
      attempted.current = true;
      return;
    }
    attempted.current = true;
    void enter(account);
    // enter/router bilerek bağımlılık değil: bu etki sayfa başına bir kez koşar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requested]);

  return (
    // Kartın içinde, formun altında ayrı bir blok. Kesik kenar ve kehribar ton
    // bilerek: bu blok arayüzün parçası değil, geliştirme kolaylığı — üretimde
    // hiç çizilmediği için burada tasarım diline uymak zorunda da değil, ama
    // "buraya ait değil" demesi gerekiyor.
    <div className="mt-5 rounded border border-dashed border-caution/50 bg-caution/[0.06] p-3">
      <p className="tech-label text-caution">
        Gösterim girişi · yalnızca geliştirme
      </p>
      <p className="mt-1 text-xs text-ink-muted">
        Tek tıkla gir. Üretim derlemesinde bu blok hiç çizilmez.
      </p>

      {error && (
        <p className="mt-2 rounded bg-critical/10 px-2 py-1 text-xs text-critical">
          {error}
        </p>
      )}

      <div className="mt-3 grid gap-1.5">
        {DEMO_ACCOUNTS.map((account) => (
          <button
            key={account.key}
            type="button"
            onClick={() => void enter(account)}
            disabled={busy !== null}
            className="flex items-center justify-between gap-2 rounded border border-line bg-panel px-2.5 py-1.5 text-left text-body-sm text-ink transition-colors hover:border-line-strong hover:bg-subtle disabled:opacity-50"
          >
            <span className="min-w-0">
              <span className="block truncate font-medium">
                {account.label}
              </span>
              <span className="block truncate text-xs text-ink-faint">
                {account.role} · {account.landing}
              </span>
            </span>
            <span className="shrink-0 text-xs font-medium text-ink-muted">
              {busy === account.key ? "…" : "Gir"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
