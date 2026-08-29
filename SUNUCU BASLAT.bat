@echo off
rem Tek tik: gosterim sunucusunu ayaga kaldirir (veritabani + uygulama + dis erisim).
rem Ayrinti ve secenekler: docs/SUNUCU.md
title B2B - sunucu baslatiliyor
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\sunucu.ps1" %*
echo.
echo Bu pencereyi kapatabilirsiniz - sunucu arka planda calisiyor.
pause
