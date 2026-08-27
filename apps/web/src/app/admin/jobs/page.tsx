import { requirePage } from "@/lib/guard";
import { Note, PageHeader } from "@/components/ui";
import { JobBoard } from "./_components/job-board";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  await requirePage(["SUPER_ADMIN"], "jobs.manage");

  return (
    <main className="mx-auto max-w-5xl">
      <PageHeader
        title="Bakım işleri"
        subtitle="Arka planda kendiliğinden çalışan temizlik işleri — ne zaman çalıştı, ne oldu"
      />
      <JobBoard />
      <Note>
        Bu işler <strong>kendiliğinden</strong> çalışır ve sessizce çalışmayı
        bırakabilirler — ekranın tek amacı görünürlük. Bir işi kapatmak onu
        siler değil erteler: sıradaki çalışma zamanı hesaplanmaz, kayıtları
        durur. <em>Şimdi çalıştır</em> zamanlayıcıyı atlamaz, işi bir kez daha
        çalıştırır; iş kendi tekrar anahtarını taşıdığı için aynı temizlik iki
        kez uygulanmaz.
      </Note>
    </main>
  );
}
