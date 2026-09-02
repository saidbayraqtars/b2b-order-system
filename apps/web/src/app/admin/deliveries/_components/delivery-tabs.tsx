"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Note, Tabs } from "@/components/ui";
import { DeliveryBoard } from "@/components/delivery-board";
import { BackorderPanel } from "./backorder-panel";

// Dağıtım ekranının iki sekmesi, ikisi de aynı işin iki ucu:
//
//   Sevkiyatlar → yola çıkmış mal, kurye ataması, teslim
//   Bekleyen    → henüz yola çıkmamış mal
//
// Sekme adreste (`?bolum=`): betik düğmeye basmıyor ve bileşen durumundaki bir
// sekmenin doğru göründüğü söylenemez.

const TABS = [
  { key: "sevkiyat" as const, label: "Sevkiyatlar" },
  { key: "bekleyen" as const, label: "Bekleyen bakiye" },
];

type TabKey = (typeof TABS)[number]["key"];

export function DeliveryTabs() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab: TabKey = params.get("bolum") === "bekleyen" ? "bekleyen" : "sevkiyat";

  return (
    <>
      <div className="mb-4">
        <Tabs
          value={tab}
          onChange={(next) =>
            router.replace(`${pathname}?bolum=${next}`, { scroll: false })
          }
          items={TABS}
        />
      </div>

      {tab === "bekleyen" ? (
        <>
          <BackorderPanel />
          <Note collapsible defaultOpen={false}>
            Bekleyen bakiye <strong>türetilmiş</strong> bir sayıdır: sipariş
            edilen adet eksi sevk edilen adet. Ayrı bir kolonda tutulsaydı iki
            sayı birbirinden ayrışabilir ve hangisinin doğru olduğu belirsiz
            kalırdı.
            <br />
            <br />
            Listeye <strong>teslim edilmiş</strong> siparişler girmiyor: kapanmış
            bir siparişin eksiği artık bekleyen mal değil, iade ya da yeni bir
            siparişle çözülecek bir konu. &ldquo;Sevk edilebilir&rdquo; künyesi
            bir iş emridir — mal depoda duruyor ve müşteri bekliyor.
          </Note>
        </>
      ) : (
        <>
          <DeliveryBoard canDispatch />
          <Note collapsible defaultOpen={false}>
            Listeye giren şey <strong>sevkiyat</strong>, sipariş değil: irsaliyesi
            kesilmemiş bir sipariş burada görünmez. Kurye ataması teslimden önce
            serbestçe değişir — seçimi boşaltmak sevkiyatı atanmamışa döndürür —
            ama teslim edilmiş sevkiyatın kuryesi artık değiştirilemez.{" "}
            <strong>Teslim kaydı bir kez yazılır</strong>: kim teslim aldı bilgisi
            imzanın yerini tutuyor, üstüne yazılabilseydi hiçbir şeyin yerini
            tutmazdı. Atamayı kurye kendisi yapamaz; taşıyan ile kaydı tutan aynı
            kişi olmamalı. Siparişin bütün sevkiyatları teslim edilince sipariş
            kendiliğinden &ldquo;Teslim edildi&rdquo;ye geçer — kısmi teslimde
            durumu değişmez.
          </Note>
        </>
      )}
    </>
  );
}
