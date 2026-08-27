"use client";

import { useEffect, useState } from "react";

/**
 * Giriş ekranlarının sol sütunu: teknik çizim gibi duran, kendi kendine
 * kurulan bir sahne.
 *
 * Neden var: `/login` bu kurulumun ilk ekranı ve günde bir kez de olsa herkes
 * oradan geçiyor. Boş bir sayfanın ortasındaki tek kutu, arkasındaki sistemin
 * ciddiyeti hakkında hiçbir şey söylemiyordu.
 *
 * Tasarım dilinin dışına çıkmadan: tek renk ailesi gri, yüzeyler 1 piksel
 * çizgiyle ayrılıyor, hiçbir yerde degrade bir marka rengi yok. Hareket eden
 * her şey ya bir çizgi ya da bir nokta — sahne bir illüstrasyon değil, çalışan
 * bir şema. Anlattığı şey de gerçek: depodan çıkan mal, yoldaki sipariş,
 * ucundaki bayi.
 *
 * Hareket kapatıldığında (`prefers-reduced-motion`) sahne kaybolmuyor, duruyor:
 * çizgiler tam, noktalar yerinde. Ayrıntı `globals.css`teki `[data-scene]`
 * bloğunda.
 */

/** Sahnenin üç aşaması — soldaki adım listesiyle aynı ritimde döner. */
const STEPS = [
  { no: "01", title: "Katalog", line: "Fiyatı ve stoğu size göre çözülmüş liste" },
  { no: "02", title: "Sipariş", line: "Limit, vade ve onay tek akışta" },
  { no: "03", title: "Sevkiyat", line: "İrsaliye, fatura ve teslim kaydı" },
] as const;

const PHASE_MS = 3600;

function useReducedMotion(): boolean {
  // Sunucuda `false`: ilk boyamada hareketli sürüm çiziliyor, tercih okununca
  // düzeliyor. Tersi olsaydı (varsayılan "kapalı") herkes sahneyi donuk görür,
  // yalnızca hidrasyondan sonra canlanırdı.
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

/**
 * İzometrik koli.
 *
 * Üç yüzü ayrı yol olarak çiziliyor çünkü her biri kendi gecikmesiyle
 * beliriyor — kutu tek parça belirseydi "çizilme" hissi olmazdı. `pathLength`
 * her yolda 1: uzunlukları farklı yolların hepsi aynı sürede tamamlanır.
 */
function Crate({
  cx,
  cy,
  delay,
  dim = false,
}: {
  cx: number;
  cy: number;
  /** Çizilme sırası — yığın alttan yukarı kuruluyor. */
  delay: number;
  /** Alttaki koliler biraz soluk: derinlik, gölgeyle değil tonla veriliyor. */
  dim?: boolean;
}) {
  const w = 56; // yatay yarıçap
  const d = 27; // eşkenar dörtgenin dikey yarıçapı
  const h = 38; // gövde yüksekliği

  const faces = [
    // üst yüz
    `M ${cx - w} ${cy} L ${cx} ${cy - d} L ${cx + w} ${cy} L ${cx} ${cy + d} Z`,
    // sol yüz
    `M ${cx - w} ${cy} L ${cx - w} ${cy + h} L ${cx} ${cy + d + h} L ${cx} ${cy + d} Z`,
    // sağ yüz
    `M ${cx + w} ${cy} L ${cx + w} ${cy + h} L ${cx} ${cy + d + h} L ${cx} ${cy + d} Z`,
  ];

  return (
    <g className={dim ? "opacity-40" : "opacity-80"}>
      {faces.map((facePath, i) => (
        <path
          key={i}
          d={facePath}
          pathLength={1}
          fill="none"
          strokeWidth={1.25}
          className="auth-draw animate-draw stroke-ink-muted"
          style={{ animationDelay: `${delay + i * 0.12}s` }}
        />
      ))}
      {/* Üst yüzün ortasındaki bant: kolinin bir kapağı olduğunu söyleyen tek çizgi. */}
      <path
        d={`M ${cx - w / 2} ${cy - d / 2} L ${cx + w / 2} ${cy + d / 2}`}
        pathLength={1}
        fill="none"
        strokeWidth={1}
        className="auth-draw animate-draw stroke-line-strong"
        style={{ animationDelay: `${delay + 0.5}s` }}
      />
    </g>
  );
}

/** Yolun ucundaki bayi: küçük bir kare ve arkasında sönen bir halka. */
function Node({
  x,
  y,
  delay,
  animate,
}: {
  x: number;
  y: number;
  delay: number;
  animate: boolean;
}) {
  return (
    <g>
      {animate && (
        <circle
          cx={x}
          cy={y}
          r={9}
          fill="none"
          strokeWidth={1}
          className="auth-origin animate-ring-pulse stroke-ink-faint"
          style={{ animationDelay: `${delay}s` }}
        />
      )}
      <rect
        x={x - 6}
        y={y - 6}
        width={12}
        height={12}
        fill="rgb(var(--panel))"
        strokeWidth={1.25}
        className="stroke-ink-muted"
      />
      <rect x={x - 2} y={y - 2} width={4} height={4} className="fill-ink-muted" />
    </g>
  );
}

export function AuthStage({ brand }: { brand: string }) {
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const timer = setInterval(
      () => setPhase((p) => (p + 1) % STEPS.length),
      PHASE_MS,
    );
    return () => clearInterval(timer);
  }, [reduced]);

  // Depodan çıkan üç yol. Ayrı ayrı yazılı, üretilmiş değil: her biri farklı
  // bir eğri ve "hepsi aynı formülden" hâli şemayı süse çeviriyordu.
  const routes = [
    { d: "M 250 246 C 316 214, 336 168, 392 146", node: { x: 396, y: 142 } },
    { d: "M 254 266 C 320 266, 352 264, 408 262", node: { x: 414, y: 262 } },
    { d: "M 250 288 C 316 322, 332 358, 387 378", node: { x: 391, y: 382 } },
  ];

  return (
    <div
      data-scene
      className="relative hidden overflow-hidden border-r border-line bg-surface lg:flex lg:w-[54%] lg:flex-col lg:justify-between xl:w-[58%]"
    >
      {/* Zemin: kayan teknik çizim ızgarası. Kaydırma miktarı deseninkiyle
          aynı (32px), böylece döngü başa sardığında dikiş görünmez. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="auth-grid absolute -inset-16 animate-grid-drift" />
      </div>

      {/* Sahnenin üstünden geçen tarama. Neredeyse görünmez — fark edilen şey
          çizgi değil, ekranın canlı olduğu. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-scan h-1/3 w-full bg-gradient-to-b from-transparent via-ink/[0.045] to-transparent" />
      </div>

      {/* Künye */}
      <div className="relative z-10 flex items-center gap-3 px-12 pt-10">
        <span className="flex h-9 w-9 items-center justify-center rounded border border-line bg-panel text-body-sm font-bold text-ink">
          {brand.slice(0, 1).toUpperCase()}
        </span>
        <span className="text-body-sm font-semibold text-ink">{brand}</span>
        <span className="ml-auto tech-label">Sipariş &amp; Yönetim Sistemi</span>
      </div>

      {/* Şema */}
      <div className="relative z-10 flex flex-1 items-center justify-center px-8">
        <svg
          viewBox="0 0 480 480"
          className="h-auto w-full max-w-[560px]"
          role="presentation"
          aria-hidden="true"
        >
          {/* Dönen ölçek halkaları. İkisi ters yönde: tek yön "yükleniyor"
              çarkına benziyordu, ters yön bir mekanizmaya. */}
          <g className="auth-origin animate-spin-slow opacity-50">
            <circle
              cx={190}
              cy={262}
              r={186}
              fill="none"
              strokeWidth={1}
              strokeDasharray="2 10"
              className="stroke-line-strong"
            />
          </g>
          <g
            className="auth-origin animate-spin-slow opacity-40"
            style={{ animationDirection: "reverse", animationDuration: "64s" }}
          >
            <circle
              cx={190}
              cy={262}
              r={148}
              fill="none"
              strokeWidth={1}
              strokeDasharray="1 6"
              className="stroke-line-strong"
            />
          </g>

          {/* Zemin çizgisi: yığının bir yere oturduğu belli olsun. */}
          <path
            d="M 60 340 L 320 340"
            pathLength={1}
            fill="none"
            strokeWidth={1}
            strokeDasharray="1"
            className="auth-draw animate-draw stroke-line-strong"
            style={{ animationDelay: "0.1s" }}
          />

          {/* Koli yığını. Alttan yukarı kuruluyor ve bir bütün olarak nefes
              alıyor — her koli ayrı ayrı süzülseydi yığın dağılırdı. */}
          <g className="auth-origin animate-float">
            <Crate cx={190} cy={302} delay={0.25} dim />
            <Crate cx={190} cy={264} delay={0.55} dim />
            <Crate cx={190} cy={226} delay={0.85} />
          </g>

          <text
            x={190}
            y={372}
            textAnchor="middle"
            className="fill-ink-faint text-[9px] font-semibold uppercase tracking-[0.25em]"
          >
            Depo
          </text>

          {/* Yollar ve uçlarındaki bayiler. Yol çizilir, sonra üzerinde
              paketler akmaya başlar. */}
          {routes.map((route, i) => (
            <g key={i}>
              <path
                id={`auth-route-${i}`}
                d={route.d}
                pathLength={1}
                fill="none"
                strokeWidth={1}
                className="auth-draw animate-draw stroke-line-strong"
                style={{ animationDelay: `${1.1 + i * 0.18}s` }}
              />
              <Node
                x={route.node.x}
                y={route.node.y}
                delay={i * 0.9}
                animate={!reduced && phase === 2}
              />
              {!reduced && (
                <circle r={3.5} className="fill-ink">
                  {/*
                    Akan paket. SMIL (`animateMotion`), CSS `offset-path`
                    yerine: `offset-path` Safari'de uzun süre yoktu ve bu ekran
                    kimsenin tarayıcısını seçemediğimiz tek ekran.

                    `begin` negatif: yol çizilirken paket zaten yolda olsun
                    diye değil — üç paket aynı anda çıkmasın diye. Hareket
                    kapalıyken bu düğüm hiç basılmıyor; SMIL'i CSS ile
                    durduramazsınız.
                  */}
                  <animateMotion
                    dur={`${3.4 + i * 0.5}s`}
                    begin={`${1.6 + i * 0.7}s`}
                    repeatCount="indefinite"
                    keyPoints="0;1"
                    keyTimes="0;1"
                    calcMode="spline"
                    keySplines="0.5 0 0.5 1"
                  >
                    <mpath href={`#auth-route-${i}`} />
                  </animateMotion>
                </circle>
              )}
            </g>
          ))}

          <text
            x={432}
            y={266}
            className="fill-ink-faint text-[9px] font-semibold uppercase tracking-[0.25em]"
          >
            Bayi
          </text>

          {/* Köşe nişanları — teknik çizim kâğıdının kenar işaretleri. */}
          {[
            [24, 24, 1, 1],
            [456, 24, -1, 1],
            [24, 456, 1, -1],
            [456, 456, -1, -1],
          ].map(([x, y, sx, sy], i) => (
            <path
              key={i}
              d={`M ${x! + sx! * 18} ${y} L ${x} ${y} L ${x} ${y! + sy! * 18}`}
              fill="none"
              strokeWidth={1}
              pathLength={1}
              className="auth-draw animate-draw stroke-line-strong"
              style={{ animationDelay: `${0.05 * i}s` }}
            />
          ))}
        </svg>
      </div>

      {/* Adım listesi. Sahnedeki aşama ile aynı sayaçtan besleniyor: yanan
          satır ile ekranda olan şey birbirini tutuyor. */}
      <div className="relative z-10 px-12 pb-10">
        <div className="grid gap-px overflow-hidden rounded-lg border border-line bg-line">
          {STEPS.map((step, i) => (
            <div
              key={step.no}
              className={[
                "flex items-baseline gap-4 px-4 py-3 transition-colors duration-500",
                i === phase ? "bg-panel" : "bg-surface",
              ].join(" ")}
            >
              <span
                className={[
                  "shrink-0 text-xs font-semibold tabular-nums transition-colors duration-500",
                  i === phase ? "text-ink" : "text-ink-faint",
                ].join(" ")}
              >
                {step.no}
              </span>
              <span className="min-w-0">
                <span
                  className={[
                    "block text-body-sm font-semibold transition-colors duration-500",
                    i === phase ? "text-ink" : "text-ink-muted",
                  ].join(" ")}
                >
                  {step.title}
                </span>
                <span className="block text-xs text-ink-faint">{step.line}</span>
              </span>
              {i === phase && (
                <span className="ml-auto h-1.5 w-1.5 shrink-0 self-center rounded-full bg-ink" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
