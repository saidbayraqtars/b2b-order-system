<#
  Sunum penceresi açıcı — her ekran, kendi hesabıyla, ayrı bir pencerede.

  Sorun: tarayıcı oturumu çerezle taşınıyor, yani tek bir Chrome profilinde aynı
  anda yalnızca **bir** hesap açık olabiliyor. Sunumda ise sekiz hesap birden
  gerekiyor: patron, IT, muhasebe, plasiyer, kurye ve üç bayi.

  Çözüm: her pencereye kendi profil klasörü (`--user-data-dir`). Profiller
  birbirinden bağımsız olduğu için sekiz oturum yan yana yaşıyor. Klasörler
  geçici dizinde tutuluyor; ikinci çalıştırmada aynı klasör kullanıldığı için
  oturumlar korunuyor — kayıt yarıda kalırsa baştan giriş yapmak gerekmiyor.

  Giriş de elle yapılmıyor: `/login?demo=<hesap>` adresi sayfayı açar açmaz o
  hesapla giriyor. Bu blok yalnızca geliştirme derlemesinde var.

  Kullanım:
      pwsh -File scripts/demo-windows.ps1
      pwsh -File scripts/demo-windows.ps1 -BaseUrl http://localhost:3000
      pwsh -File scripts/demo-windows.ps1 -Fresh      # profilleri sıfırla
      pwsh -File scripts/demo-windows.ps1 -Close      # açılan pencereleri kapat
#>

param(
  [string] $BaseUrl = "http://localhost:3000",
  [switch] $Fresh,
  [switch] $Close
)

$ErrorActionPreference = "Stop"

# Pencere sırası sunum sırasıdır: soldan sağa açılıyor ve kayıt sırasında
# Alt+Tab ile gezilecek düzen bu.
$windows = @(
  @{ key = "akbayi";        title = "1 · Bayi vitrini";     landing = "/portal" }
  @{ key = "zincir";        title = "2 · Zincir (fiyat farki)"; landing = "/portal" }
  @{ key = "sahinpersonel"; title = "3 · Siparis (onaya duser)"; landing = "/portal" }
  @{ key = "sahinyonetici"; title = "4 · Onaylayan";        landing = "/portal/approvals" }
  @{ key = "it";            title = "5 · Stok & parti";     landing = "/admin/stok" }
  @{ key = "temsilci1";     title = "6 · Plasiyer";         landing = "/rep" }
  @{ key = "kurye1";        title = "7 · Kurye";            landing = "/kurye" }
  @{ key = "satismudur";    title = "8 · Raporlar";         landing = "/reports" }
  @{ key = "muhasebe";      title = "9 · Kasa";             landing = "/admin/kasa" }
  @{ key = "patron";        title = "10 · Yonetim panosu";  landing = "/admin" }
)

$root = Join-Path $env:TEMP "b2b-demo-profiles"

if ($Close) {
  # Yalnızca bu betiğin açtıklarını kapat: profil klasörü komut satırında
  # geçtiği için, kullanıcının kendi Chrome pencereleri ayırt edilebiliyor.
  $killed = 0
  Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe'" | ForEach-Object {
    if ($_.CommandLine -and $_.CommandLine.Contains("b2b-demo-profiles")) {
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
      $killed++
    }
  }
  Write-Host "$killed pencere kapatildi."
  return
}

# Chrome'u bul — kurulum yeri makineye göre değişiyor.
$candidates = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
)
$browser = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) {
  Write-Error "Chrome ya da Edge bulunamadi. Yol: $($candidates -join ', ')"
}

# Sunucu ayakta mı? Ayakta değilken on pencere açmak, on tane hata sayfası demek.
try {
  $health = Invoke-RestMethod -Uri "$BaseUrl/api/health" -TimeoutSec 10
  if ($health.status -ne "ok") {
    Write-Error "Saglik ucu 'ok' donmedi: $($health | ConvertTo-Json -Compress)"
  }
} catch {
  Write-Error "Sunucuya ulasilamadi ($BaseUrl). Once: pnpm --filter web dev"
}

if ($Fresh -and (Test-Path $root)) {
  Remove-Item -Recurse -Force $root
}
if (-not (Test-Path $root)) {
  New-Item -ItemType Directory -Force -Path $root | Out-Null
}

Write-Host "Tarayici: $browser"
Write-Host "Profiller: $root"
Write-Host ""

# Pencereleri kademeli aç: hepsi aynı anda açılırsa Next.js'in ilk derlemesi
# on isteği birden karşılamaya çalışıyor ve ilk pencereler boş açılıyor.
$offset = 0
foreach ($w in $windows) {
  $profile = Join-Path $root $w.key
  $url = "$BaseUrl/login?demo=$($w.key)&callbackUrl=$([uri]::EscapeDataString($w.landing))"

  $args = @(
    "--user-data-dir=$profile"
    "--no-first-run"
    "--no-default-browser-check"
    "--new-window"
    "--window-size=1400,900"
    "--window-position=$($offset),$($offset)"
    $url
  )

  Start-Process -FilePath $browser -ArgumentList $args | Out-Null
  Write-Host ("  {0,-28} {1}" -f $w.title, $w.landing)

  $offset += 28
  Start-Sleep -Milliseconds 1200
}

Write-Host ""
Write-Host "Hepsi acildi. Kapatmak icin: pwsh -File scripts/demo-windows.ps1 -Close"
