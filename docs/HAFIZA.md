# Proje hafızası (`docs/hafiza/`)

`docs/hafiza/` klasöründeki 57 markdown dosyası, Claude Code'un bu proje için
tuttuğu kalıcı hafızanın birebir kopyasıdır. Asıl kaynak hâlâ
`~/.claude/projects/C--Users-saidb-Desktop-projeler-b2b/memory/`; buradaki
kopyanın tek amacı, **başka bir yapay zekâ aracıyla** (ChatGPT, Gemini, Cursor,
Copilot…) çalışırken aynı bağlamı verebilmek. O araçlar `~/.claude` altını
görmez, depoyu görür.

## Nasıl okunur

- `docs/hafiza/MEMORY.md` — dizin. Her satır bir dosyayı ve neyi anlattığını
  söyler. Bir yapay zekâya önce bunu ver, ilgili dosyaları o seçsin.
- Diğer dosyalar tek konu anlatır: kararın ne olduğu, **neden** öyle olduğu ve
  tekrar tartışılırsa hangi gerekçenin geçerli olduğu. `[[dosya-adı]]` yazımı
  aynı klasördeki başka bir kaydı işaret eder.

Yeni bir araca başlarken işe yarayan açılış: "`docs/hafiza/MEMORY.md`'yi oku,
sonra konuyla ilgili kayıtları aç; bu kayıtlar geçmiş kararların gerekçesi,
koddan türetilemez."

## Güncel tutma

Kopyayı elle güncelleme; Claude Code hafızayı değiştirdikten sonra:

```bash
pnpm hafiza
```

Ters yön (dosyaları depoda elle düzenlediysen, Claude'un hafızasına yaz):

```bash
pnpm hafiza:geri
```

Betik `scripts/hafiza-esitle.mjs`. Kaynakta silinmiş kayıtları hedeften de
siler, yani iki klasör birebir aynı kalır.

## Neden `.gitignore`'da

Depo herkese açık ([[b2b-github]]). Hafıza kayıtları, herkese açık olmasını
istemeyeceğin ayrıntılar taşıyor — örneğin `b2b-apk-ota.md` içindeki imza
anahtarı parolası ve gösterim hesabı şifreleri. Bu yüzden `docs/hafiza/`
gitignore'da: dosyalar diskte duruyor, GitHub'a gitmiyor.

Başka bir makinede de lazımsa iki seçenek var: klasörü elle kopyala, ya da
önce parola geçen satırları temizleyip `.gitignore`dan `docs/hafiza/` satırını
kaldır.
