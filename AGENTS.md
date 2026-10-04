# Ajanlar için giriş

Bu depoda birden çok ajan (Claude, Codex, başka hesaplar) aynı anda çalışıyor.
Başlamadan önce sırayla okuyun:

1. [`docs/IS-BOLUMU.md`](docs/IS-BOLUMU.md) — kim neyi yapıyor, hangi dalda,
   hangi klasörde. Test ortamı ve bitti tanımı da orada.
2. Size verilen görev belgesi: `docs/gorevler/<harf>-*.md`.
3. [`docs/HAFIZA.md`](docs/HAFIZA.md) — projenin hafızası: alınmış kararlar,
   nedenleri ve tuzaklar. Göreviniz bir konuya dokunuyorsa o konunun notu
   okunmadan kod yazılmaz.

Değişmeyen kurallar:

- Veritabanı şeması (`packages/database/prisma/`) yalnız D akışında değişir.
- `.env` dosyalarına dokunulmaz. Parola, anahtar ve token hiçbir dosyaya,
  commit'e ya da günlüğe yazılmaz.
- Push ve `main`'e birleştirme Said'in onayıyla yapılır.
- Belgeler, commit mesajları ve test adları Türkçe yazılır.
- Makine ortak. Ağır işleri sırayla ve tek iş parçacığıyla koşturun
  (`npx vitest run --maxWorkers=1`).
