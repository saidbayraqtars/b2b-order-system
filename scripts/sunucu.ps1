<#
  Tek tıkla gösterim sunucusu.

  Bu makineyi geçici olarak sunucuya çeviriyor: veritabanı, uygulama, dış
  erişim tüneli ve parola kapısı — hepsi tek komutta, sırayla ve her adımın
  bittiği doğrulanarak. Sunumdan önce "şunu başlattım, şunu kapattım"
  dakikalarını ortadan kaldırmak için var.

  Kullanım:
      .\scripts\sunucu.ps1                 # başlat (dış erişim + parola kapısı)
      .\scripts\sunucu.ps1 -YerelSadece    # tünel açma, yalnız bu makine + wifi
      .\scripts\sunucu.ps1 -Parolasiz      # dış adresi parolasız aç (dikkat)
      .\scripts\sunucu.ps1 -Pencereler     # bitince 10 gösterim penceresini aç
      .\scripts\sunucu.ps1 -Durum          # ne çalışıyor
      .\scripts\sunucu.ps1 -Durdur         # hepsini kapat

  Çift tıklamalı hâli: depo kökündeki `SUNUCU BASLAT.bat` / `SUNUCU DURDUR.bat`.

  Neden geliştirme sunucusu (üretim derlemesi değil): gösterim girişi
  (`/login?demo=patron`) yalnızca geliştirme derlemesinde var ve sunumun on
  penceresi ona dayanıyor. Üretim derlemesi daha hızlı açılırdı ama on hesaba
  elle şifre yazdırırdı. Bunun bedeli ilk açılıştaki derleme gecikmesi; betik
  onu "ısıtma" adımıyla kendisi ödüyor.

  Windows PowerShell 5.1 uyumlu yazıldı (`&&`, `??`, üçlü işleç yok).
#>

param(
  [switch] $Durdur,
  [switch] $Durum,
  [switch] $YerelSadece,
  [switch] $Parolasiz,
  [string] $Parola = "",
  [switch] $Pencereler,
  [int]    $Port = 3000,
  [int]    $KapiPort = 3010
)

$ErrorActionPreference = "Stop"
$ROOT = Split-Path -Parent $PSScriptRoot
$VAR = Join-Path $ROOT "var"
$DURUM_DOSYASI = Join-Path $VAR "sunucu.json"

if (-not (Test-Path $VAR)) { New-Item -ItemType Directory -Force -Path $VAR | Out-Null }

# ── çıktı ───────────────────────────────────────────────────────────────────

$script:adim = 0
function Adim([string] $mesaj) {
  $script:adim = $script:adim + 1
  Write-Host ""
  Write-Host ("  {0}. {1}" -f $script:adim, $mesaj) -ForegroundColor Cyan
}
function Tamam([string] $mesaj) { Write-Host "     $mesaj" -ForegroundColor Green }
function Bilgi([string] $mesaj) { Write-Host "     $mesaj" -ForegroundColor DarkGray }
function Uyari([string] $mesaj) { Write-Host "     $mesaj" -ForegroundColor Yellow }

function Baslik {
  Write-Host ""
  Write-Host "  B2B — gosterim sunucusu" -ForegroundColor White
  Write-Host "  ------------------------" -ForegroundColor DarkGray
}

# ── durum dosyası ───────────────────────────────────────────────────────────
#
# Ne başlattığımızı diske yazıyoruz. Durdurma betiği "3000 portunu kim tutuyor"
# diye tahmin etmek yerine kendi başlattığı süreci kapatıyor: kullanıcının
# başka bir işi aynı portta duruyorsa ona dokunulmuyor.

function DurumuYaz($veri) {
  $veri | ConvertTo-Json -Depth 5 | Set-Content -Path $DURUM_DOSYASI -Encoding utf8
}
function DurumuOku {
  if (-not (Test-Path $DURUM_DOSYASI)) { return $null }
  try { return Get-Content $DURUM_DOSYASI -Raw | ConvertFrom-Json } catch { return $null }
}

function SureciKapat([int] $pid_, [string] $ad) {
  if (-not $pid_) { return }
  $p = Get-Process -Id $pid_ -ErrorAction SilentlyContinue
  if ($null -eq $p) { return }
  # Alt süreçleriyle birlikte: `pnpm` bir sarmalayıcı, asıl `node` onun altında.
  Start-Process -FilePath "taskkill.exe" -ArgumentList @("/PID", $pid_, "/T", "/F") -NoNewWindow -Wait -ErrorAction SilentlyContinue
  Bilgi "$ad kapatildi (pid $pid_)"
}

# ── yardımcılar ─────────────────────────────────────────────────────────────

function KomutVarMi([string] $ad) {
  $c = Get-Command $ad -ErrorAction SilentlyContinue
  return ($null -ne $c)
}

<#
  Dış komutu çalıştır ve stderr'ini hata sayma.

  Windows PowerShell 5.1'de `$ErrorActionPreference = "Stop"` iken bir dış
  komutun stderr'e yazdığı **her satır** sonlandırıcı hataya dönüyor. `npm`
  yapılandırma uyarısı yazdığı için QR adımı ilk denemede tam olarak bunun
  yüzünden sessizce düştü. Çıkış kodunu zaten elle kontrol ediyoruz; tercih
  yalnızca bu blok boyunca gevşetiliyor.
#>
function Yerli([scriptblock] $blok) {
  $eski = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try { & $blok } finally { $ErrorActionPreference = $eski }
}

function SaglikliMi([int] $port) {
  try {
    $r = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/health" -TimeoutSec 5
    return ($r.status -eq "ok")
  } catch {
    return $false
  }
}

function YerelAdres {
  # Wifi/ethernet adresi — telefon ve ikinci makine bunu kullanacak.
  $adres = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" -and $_.PrefixOrigin -ne "WellKnown" } |
    Sort-Object -Property InterfaceMetric |
    Select-Object -First 1
  if ($null -eq $adres) { return $null }
  return $adres.IPAddress
}

function ParolaUret {
  # Okunabilir olsun: sunumda telefona elle yazılabilecek kadar kısa, ama
  # tahmin edilemeyecek kadar rastgele.
  $harf = "abcdefghjkmnpqrstuvwxyz23456789".ToCharArray()
  $r = -join (1..8 | ForEach-Object { $harf | Get-Random })
  return $r
}

# ── DURDUR ──────────────────────────────────────────────────────────────────

if ($Durdur) {
  Baslik
  $d = DurumuOku
  if ($null -eq $d) {
    Uyari "Kayitli oturum yok. Bir sey baslatilmamis olabilir."
  } else {
    SureciKapat $d.webPid "Uygulama"
    SureciKapat $d.tunelPid "Tunel"
    SureciKapat $d.kapiPid "Parola kapisi"
    Remove-Item $DURUM_DOSYASI -Force -ErrorAction SilentlyContinue
  }

  # Gösterim pencereleri ayrı bir betiğin işi; kendi profillerinden tanınıyor.
  $demo = Join-Path $PSScriptRoot "demo-windows.ps1"
  if (Test-Path $demo) {
    powershell -ExecutionPolicy Bypass -File $demo -Close | Out-Null
    Bilgi "Gosterim pencereleri kapatildi"
  }

  Write-Host ""
  Write-Host "  Durduruldu. Veritabani kapsayicisi calismaya devam ediyor" -ForegroundColor Green
  Write-Host "  (birkac saniyede yeniden aciliyor, veriyi tutuyor)." -ForegroundColor DarkGray
  Write-Host "  Tamamen kapatmak icin:  docker compose stop" -ForegroundColor DarkGray
  Write-Host ""
  return
}

# ── DURUM ───────────────────────────────────────────────────────────────────

if ($Durum) {
  Baslik
  $d = DurumuOku
  $saglik = SaglikliMi $Port
  Write-Host ""
  Write-Host ("  Uygulama    : {0}" -f $(if ($saglik) { "ayakta (http://localhost:$Port)" } else { "kapali" }))
  if ($null -ne $d) {
    Write-Host ("  Dis adres   : {0}" -f $(if ($d.publicUrl) { $d.publicUrl } else { "yok" }))
    Write-Host ("  Parola      : {0}" -f $(if ($d.parola) { "$($d.kullanici) / $($d.parola)" } else { "yok" }))
    Write-Host ("  Baslatildi  : {0}" -f $d.baslangic)
  }
  Write-Host ""
  return
}

# ── BAŞLAT ──────────────────────────────────────────────────────────────────

Baslik
$basladi = Get-Date

# 1 · Docker
Adim "Veritabani kapsayicisi"
if (-not (KomutVarMi "docker")) {
  Write-Error "Docker bulunamadi. Docker Desktop kurulu olmali."
}
$dockerAyakta = $false
Yerli { docker info 2>&1 | Out-Null }
$dockerAyakta = ($LASTEXITCODE -eq 0)

if (-not $dockerAyakta) {
  Bilgi "Docker Desktop kapali, aciliyor (ilk acilis 1-2 dakika surebilir)..."
  $dd = "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
  if (Test-Path $dd) { Start-Process -FilePath $dd | Out-Null }
  $bekleme = 0
  while ($bekleme -lt 180) {
    Start-Sleep -Seconds 5
    $bekleme = $bekleme + 5
    Yerli { docker info 2>&1 | Out-Null }
    if ($LASTEXITCODE -eq 0) { break }
  }
  if ($LASTEXITCODE -ne 0) { Write-Error "Docker acilmadi. Elle acip tekrar deneyin." }
}

Push-Location $ROOT
Yerli { docker compose up -d db 2>&1 | Out-Null }
Pop-Location

$hazir = $false
for ($i = 0; $i -lt 30; $i++) {
  Yerli { docker exec b2b-postgres pg_isready -U postgres -d b2b 2>&1 | Out-Null }
  if ($LASTEXITCODE -eq 0) { $hazir = $true; break }
  Start-Sleep -Seconds 2
}
if (-not $hazir) { Write-Error "Postgres hazir olmadi." }
Tamam "Postgres ayakta (localhost:5433)"

# 2 · Şema ve veri
Adim "Sema ve gosterim verisi"
Push-Location $ROOT
Yerli { pnpm --filter @repo/database db:deploy 2>&1 | Out-String | Out-Null }
if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Error "Sema gocu basarisiz. Ayrinti: pnpm --filter @repo/database db:deploy" }

# Boş veritabanına gösterim verisi yükleniyor; doluysa dokunulmuyor. Bu adım
# sunumun içeriğini üretiyor, yeniden koşturmak siparişleri ikiye katlardı.
# Tirnak kacisi bilerek boyle: PowerShell dis komuta giden cift tirnaklari
# yutuyor ve sorgu `from User` olarak gidiyor — o da Postgres'te ayri bir
# tablo (ve anahtar kelime). Ilk denemede sayac bu yuzden yanlis okundu.
$kullaniciSayisi = "0"
Yerli {
  $ham = docker exec b2b-postgres psql -U postgres -d b2b -tAc 'select count(*) from \"User\"'
  if ($LASTEXITCODE -eq 0 -and $ham) { $script:kullaniciSayisi = ("$ham").Trim() }
}

if ([string]::IsNullOrWhiteSpace($kullaniciSayisi) -or $kullaniciSayisi -eq "0") {
  Uyari "Veritabani bos — gosterim verisi yukleniyor (2-4 dakika)."
  Yerli {
    pnpm --filter @repo/database db:seed 2>&1 | Out-String | Out-Null
    pnpm --filter @repo/database db:seed-demo 2>&1 | Out-String | Out-Null
    pnpm --filter @repo/database db:seed-gida 2>&1 | Out-String | Out-Null
  }
  Tamam "Gosterim verisi yuklendi"
} else {
  Tamam "Veri yerinde ($kullaniciSayisi kullanici) — tohumlama atlandi"
}
Pop-Location

# 3 · Dış erişim
$publicUrl = ""
$kullanici = "demo"
$kapiPid = 0
$tunelPid = 0

if (-not $YerelSadece) {
  Adim "Dis erisim tuneli"
  if (-not (KomutVarMi "cloudflared")) {
    Uyari "cloudflared bulunamadi — dis erisim atlaniyor. Kurulum: winget install Cloudflare.cloudflared"
  } else {
    # Parola kapısı tünelin arkasında: tünel kapıya, kapı uygulamaya bakıyor.
    $hedefPort = $Port
    if (-not $Parolasiz) {
      if ([string]::IsNullOrWhiteSpace($Parola)) { $Parola = ParolaUret }
      $env:KAPI_PORT = "$KapiPort"
      $env:HEDEF_PORT = "$Port"
      $env:KAPI_KULLANICI = $kullanici
      $env:KAPI_PAROLA = $Parola
      $kapiLog = Join-Path $VAR "kapi.log"
      $kapi = Start-Process -FilePath "node" -ArgumentList @((Join-Path $PSScriptRoot "kapi.mjs")) `
        -WorkingDirectory $ROOT -WindowStyle Minimized -PassThru `
        -RedirectStandardOutput $kapiLog -RedirectStandardError "$kapiLog.err"
      $kapiPid = $kapi.Id
      $hedefPort = $KapiPort
      Tamam "Parola kapisi acildi (kullanici: $kullanici, parola: $Parola)"
    } else {
      Uyari "Parolasiz mod: adresi bilen herkes girebilir."
    }

    $tunelLog = Join-Path $VAR "tunel.log"
    if (Test-Path $tunelLog) { Remove-Item $tunelLog -Force }
    $tunel = Start-Process -FilePath "cloudflared" `
      -ArgumentList @("tunnel", "--url", "http://127.0.0.1:$hedefPort", "--no-autoupdate") `
      -WindowStyle Minimized -PassThru `
      -RedirectStandardOutput $tunelLog -RedirectStandardError "$tunelLog.err"
    $tunelPid = $tunel.Id

    # Adres cloudflared'in gunlugune dusuyor; bekleyip okuyoruz.
    for ($i = 0; $i -lt 40; $i++) {
      Start-Sleep -Seconds 2
      $icerik = ""
      if (Test-Path "$tunelLog.err") { $icerik = $icerik + (Get-Content "$tunelLog.err" -Raw -ErrorAction SilentlyContinue) }
      if (Test-Path $tunelLog) { $icerik = $icerik + (Get-Content $tunelLog -Raw -ErrorAction SilentlyContinue) }
      $m = [regex]::Match($icerik, "https://[a-z0-9-]+\.trycloudflare\.com")
      if ($m.Success) { $publicUrl = $m.Value; break }
    }

    if ($publicUrl) { Tamam "Dis adres: $publicUrl" }
    else { Uyari "Tunel adresi okunamadi — $tunelLog dosyasina bakin." }
  }
}

# 4 · Uygulama
Adim "Uygulama"
if (SaglikliMi $Port) {
  Tamam "Zaten ayakta (port $Port) — yeniden baslatilmadi"
  $webPid = 0
} else {
  # Ortam degiskenleri surece veriliyor, .env dosyasina yazilmiyor: Next
  # surecin ortamini .env'in ustunde tutuyor, ve sunum bittiginde geride
  # degistirilmis bir dosya kalmiyor.
  $env:DEMO_LOGIN = "1"
  $env:AUTH_TRUST_HOST = "true"
  # Masaüstü kabuğunun güncelleme klasörü. Varsayılanı çalışan sürecin
  # dizinine göre çözülüyor ve o dizin `apps/web`; depo kökündeki klasörü
  # göstermek için açıkça veriliyor.
  $env:DESKTOP_RELEASE_DIR = (Join-Path $ROOT "var\masaustu")
  if ($publicUrl) { $env:APP_URL = $publicUrl } else { $env:APP_URL = "http://localhost:$Port" }

  $webLog = Join-Path $VAR "web.log"
  $web = Start-Process -FilePath "pnpm.cmd" `
    -ArgumentList @("--filter", "web", "exec", "next", "dev", "-p", "$Port", "-H", "0.0.0.0") `
    -WorkingDirectory $ROOT -WindowStyle Minimized -PassThru `
    -RedirectStandardOutput $webLog -RedirectStandardError "$webLog.err"
  $webPid = $web.Id

  $acildi = $false
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 2
    if (SaglikliMi $Port) { $acildi = $true; break }
  }
  if (-not $acildi) { Write-Error "Uygulama acilmadi. Gunluk: $webLog" }
  Tamam "http://localhost:$Port — saglik ucu 'ok'"
}

# 5 · Isıtma
#
# Geliştirme sunucusu her rotayı ilk ziyarette derliyor. Sunumda bunun bedeli
# ekranın 10-20 saniye boş kalması; burada peşinen ödeniyor.
Adim "Ekranlarin isitilmasi"
$rotalar = @(
  "/login", "/portal", "/admin", "/admin/analitik?bolum=durum",
  "/admin/analitik?bolum=karlilik", "/admin/stok", "/admin/kasa", "/admin/cekler",
  "/admin/promotions", "/admin/products", "/admin/companies",
  "/rep", "/kurye", "/reports", "/reports/sablonlar"
)
$sayac = 0
foreach ($r in $rotalar) {
  try {
    Invoke-WebRequest -Uri "http://127.0.0.1:$Port$r" -UseBasicParsing -TimeoutSec 120 -MaximumRedirection 0 -ErrorAction SilentlyContinue | Out-Null
  } catch { }
  $sayac = $sayac + 1
  Write-Host "." -NoNewline -ForegroundColor DarkGray
}
Write-Host ""
Tamam "$sayac ekran derlendi"

# 5.5 · Güvenlik duvarı
#
# Aynı wifi'deki telefon 3000 portuna ancak Windows Güvenlik Duvarı izin
# verirse ulaşıyor. Kural yoksa açılıyor; yönetici hakkı yoksa komut yazılıyor
# (sessizce geçmek, sunum sırasında "telefonda açılmıyor" demektir).
$kuralAdi = "B2B gosterim $Port"
$kimlik = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
$yonetici = $kimlik.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$kural = Get-NetFirewallRule -DisplayName $kuralAdi -ErrorAction SilentlyContinue
if ($null -eq $kural) {
  if ($yonetici) {
    New-NetFirewallRule -DisplayName $kuralAdi -Direction Inbound -Action Allow `
      -Protocol TCP -LocalPort $Port -Profile Private | Out-Null
    Bilgi "Guvenlik duvari kurali eklendi (ozel ag, port $Port)"
  } else {
    Bilgi "Ayni agdaki cihazlar icin (yonetici olarak bir kez):"
    Bilgi "  New-NetFirewallRule -DisplayName '$kuralAdi' -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -Profile Private"
  }
}

# 6 · Bağlantı sayfası
Adim "Baglanti sayfasi"
$lan = YerelAdres
$lanUrl = ""
if ($lan) { $lanUrl = "http://$($lan):$Port" }
$qrSayfa = ""
$p3 = ""
$p4 = ""
if ($publicUrl -and -not $Parolasiz) { $p3 = $kullanici; $p4 = $Parola }
$tsx = Join-Path $ROOT "node_modules\.bin\tsx.CMD"
if (Test-Path $tsx) {
  Push-Location $ROOT
  Yerli {
    # `npx` degil depodaki tsx: npx her calismada npm yapilandirma uyarisi
    # yaziyor ve o uyari bu adimi hataya dusuruyordu.
    $cikti = & $tsx "scripts/qr-sayfa.ts" "$lanUrl" "$publicUrl" "$p3" "$p4"
    $script:qrSayfa = ($cikti | Select-Object -Last 1)
  }
  Pop-Location
}

if ($qrSayfa -and (Test-Path $qrSayfa)) {
  Start-Process $qrSayfa | Out-Null
  Tamam "QR sayfasi acildi ($qrSayfa)"
} else {
  Bilgi "QR sayfasi uretilemedi — adresler asagida yazili."
}

# Durum kaydı
DurumuYaz @{
  webPid    = $webPid
  tunelPid  = $tunelPid
  kapiPid   = $kapiPid
  publicUrl = $publicUrl
  lanUrl    = $lanUrl
  kullanici = $kullanici
  parola    = $(if ($Parolasiz) { "" } else { $Parola })
  port      = $Port
  baslangic = (Get-Date).ToString("s")
}

# 7 · Gösterim pencereleri
if ($Pencereler) {
  Adim "Gosterim pencereleri"
  $demo = Join-Path $PSScriptRoot "demo-windows.ps1"
  powershell -ExecutionPolicy Bypass -File $demo -BaseUrl "http://localhost:$Port"
}

# ── özet ────────────────────────────────────────────────────────────────────

$sure = [int]((Get-Date) - $basladi).TotalSeconds
Write-Host ""
Write-Host "  ================================================" -ForegroundColor Green
Write-Host "   HAZIR — $sure saniye" -ForegroundColor Green
Write-Host "  ================================================" -ForegroundColor Green
Write-Host ""
Write-Host "   Bu makine     : http://localhost:$Port"
if ($lanUrl) {
Write-Host "   Ayni wifi     : $lanUrl"
}
if ($publicUrl) {
Write-Host "   Disaridan     : $publicUrl" -ForegroundColor Yellow
  if (-not $Parolasiz) {
Write-Host "   Parola        : $kullanici / $Parola" -ForegroundColor Yellow
  }
}
Write-Host ""
Write-Host "   Gosterim girisi acik: /login sayfasinda tek tikla giris." -ForegroundColor DarkGray
Write-Host "   Hesaplar: DEMO-KULLANICILAR.md (sifre 143688)" -ForegroundColor DarkGray
Write-Host ""
if ($publicUrl) {
Write-Host "   DIKKAT: gosterim hesaplarinin sifresi herkese acik depoda yazili." -ForegroundColor Red
Write-Host "   Dis adresi sunum disinda acik birakmayin; is bitince DURDUR." -ForegroundColor Red
Write-Host ""
}
Write-Host "   Durdurmak icin: SUNUCU DURDUR.bat" -ForegroundColor DarkGray
Write-Host ""

if ($publicUrl) {
  try { Set-Clipboard -Value $publicUrl; Bilgi "Dis adres panoya kopyalandi." } catch { }
} elseif ($lanUrl) {
  try { Set-Clipboard -Value $lanUrl } catch { }
}
