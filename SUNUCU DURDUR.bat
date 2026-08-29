@echo off
rem Tek tik: uygulamayi, tuneli ve parola kapisini kapatir.
rem Veritabani kapsayicisi calismaya devam eder (veriyi tutar, hizli acilir).
title B2B - sunucu durduruluyor
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\sunucu.ps1" -Durdur
pause
