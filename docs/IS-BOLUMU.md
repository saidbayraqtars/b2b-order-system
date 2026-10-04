# İş bölümü

**Başlangıç: 2026-10-04.** Kararlar Said'in; bu belge yalnız onları ve
çalışma kurallarını tutar.

## Neden şimdi

- Sistem **Vega'ya bağlı olmadan, tek başına** satılacak. ERP köprüsü isteğe
  bağlı bir eklenti olarak kalıyor; fatura/e-fatura müşterinin kullandığı
  ERP'ye göre ayrıca bağlanır.
- B2B her müşteri için bir **VPS** üzerinde çalışır. Farkımız: müşteri
  dünyanın neresinde olursa olsun modemden port açmadan bağlanır (ERP ajanı
  dışarı doğru HTTPS ve Cloudflare Tunnel kullanır).
- Hedef: öteki B2B sistemleri gibi kusursuz çalışmak, daha sade görünmek.

## Başlangıç ölçümü (2026-10-04, `main` = `d5b1d36` + commit edilmemiş erp-agent değişikliği)

| Kontrol | Sonuç |
|---|---|
| `pnpm typecheck` | 9/9 |
| `pnpm lint` | 8/8 |
| `pnpm test` | **1.115 test geçti** — erp-agent 22, servisler 697 (54 dosya), web 396 (20 dosya) |
| `pnpm build` | 4/4, 159 sayfa |
| Mobil | **0 test** |
| API rotası | 167 rotanın **119'unun** rota testi yok — liste: [`gorevler/rota-test-listesi.txt`](gorevler/rota-test-listesi.txt) |

## Akışlar

| Akış | Kim | Görev belgesi | Dal | Çalışma klasörü | `TEST_SCHEMA` |
|---|---|---|---|---|---|
| **A** Eksik testler | Codex | [A-testler.md](gorevler/A-testler.md) | `codex/testler` | `D:\projeler\b2b-codex` | `test_codex` |
| **B** Excel ile her şeyi içe/dışa aktarma | Codex (A bittikten sonra) | [B-excel.md](gorevler/B-excel.md) | `codex/excel` | `D:\projeler\b2b-codex` | `test_codex` |
| **C** Mobil (önce Android APK) | İkinci hesap | [C-mobil.md](gorevler/C-mobil.md) | `mobil/yenileme` | `D:\projeler\b2b-mobil` | `test_mobil` |
| **D** Özel kodlar, modül aç/kapa, sadeleştirme | Claude | [D-claude.md](gorevler/D-claude.md) | `claude/ozel-kod` ve devamı | `D:\projeler\b2b-claude` | `test_claude` |

Çalışma klasörleri `git worktree` ile açılır. Her biri kendi `node_modules`'unu
kurar (pnpm deposu ortak, kurulum hızlı):

```bash
git -C D:/projeler/b2b worktree add D:/projeler/b2b-codex -b codex/testler main
```

## Kurallar

1. **Veritabanı şemasının tek sahibi D akışı.**
   `packages/database/prisma/schema.prisma` ve `migrations/` yalnız orada
   değişir. Başka akışın şema ihtiyacı olursa aşağıdaki "Şema istekleri"
   bölümüne yazılır. İki akış aynı anda göç yazarsa göç sırası bozulur ve
   birleştirme elle çözülmek zorunda kalır.
2. **Menü ve izin kayıt defteri D'nin.** `admin-shell.tsx` (menü) ve
   `permission-registry` D'de değişir. Yeni izin ya da menü satırı gereken
   akış isteği yazar.
3. **Her akış kendi dalında.** `main`'e birleştirmeden önce `main` üzerine
   rebase edilir ve "Bitti tanımı"nın tamamı yeniden koşar.
4. **Birleştirme sırası:** A → D1 (özel kod şeması) → B → C → D'nin geri kalanı.
   B'nin özel kod sütunları D1'e bağlı. B, D1 gelmeden başlayabilir ama o
   sütunları en son ekler.
5. **Push ve `main`'e birleştirme Said'in onayıyla.** Depo herkese açık. Yerel
   commit serbest.
6. **Gizli bilgi yok.** `.env` dosyalarına dokunulmaz, içindeki değerler hiçbir
   belgeye, commit'e, günlüğe yazılmaz.
7. **Bilgisayar ortak.** Said aynı makinede çalışıyor (oyun dahil). Ağır işler
   düşük öncelikle ve sırayla koşar: tam `pnpm test` ile `pnpm build` aynı
   anda iki akıştan koşturulmaz. Vitest'i tek iş parçacığıyla çalıştırın:
   `npx vitest run --maxWorkers=1`.

## Test ortamı (bu makine)

Docker yok. Taşınabilir PostgreSQL 16 kurulu:

- İkili dosyalar: `C:\Users\Saidb\tools\pg16\pgsql\bin`
- Veri klasörü: `C:\Users\Saidb\tools\pg16-data`
- Port **5434**, yalnız `localhost` dinlenir. Kullanıcı/parola `b2b`/`b2b`
  (CI'daki değerin aynısı, gizli değil). Veritabanı adı `b2b_test`.

Sunucu kapalıysa:

```powershell
& "C:\Users\Saidb\tools\pg16\pgsql\bin\pg_ctl.exe" -D "C:\Users\Saidb\tools\pg16-data" -o "-p 5434 -c listen_addresses=localhost" -l "C:\Users\Saidb\tools\pg16-data\server.log" start
```

Her akış testten önce kendi ortam değişkenlerini verir. Değerler akışa göre
değişir, `TEST_SCHEMA` **paylaşılmaz**:

```bash
export PATH="/c/Users/Saidb/AppData/Roaming/npm:$PATH"   # pnpm 9.12.2
export DATABASE_URL="postgresql://b2b:b2b@localhost:5434/b2b_test?schema=public"
export AUTH_SECRET="ci-only-not-a-real-secret-000000000000"
export TEST_SCHEMA="test_codex"   # akışın kendi şeması
pnpm db:generate
pnpm db:test-prepare              # o klasörün göçlerini o şemaya uygular
```

Neden ayrı şema: iki koşu aynı şemayı paylaşırsa ikisi de belge numarasını aynı
`DocumentSeries` sayacından alır ve testler rastgele kırılır
(bkz. `docs/hafiza/b2b-route-tests.md`, "İki paket bir veritabanı").

## Bitti tanımı

1. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` geçer.
2. Ekran değiştiyse `pnpm shots` alınır ve görüntüye bakılır
   (`docs/hafiza/b2b-screenshots.md`).
3. `FEATURES.md`, değişen akışın görev belgesi ve gerekiyorsa
   `docs/KALAN-ISLER.md` güncellenir.
4. Commit mesajı Türkçe, önekli: `feat:` `fix:` `test:` `docs:` `refactor:`.
   Konu satırı ne olduğunu söyler, gövde nedenini anlatır.
5. Test yazarken üretim kodunda hata bulunursa: hatayı kanıtlayan test +
   en küçük düzeltme, aynı commit'te. Commit gövdesinde "test ne buldu" yazılır.

## Şema istekleri

Başka akışların D'den istedikleri. Format: tarih · akış · ne · neden.

- *(henüz yok)*

## Durum

| Akış | Durum | Son not |
|---|---|---|
| A | Başlamadı | — |
| B | Başlamadı | — |
| C | Başlamadı | — |
| D | Başlamadı | — |
