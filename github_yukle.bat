@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ========================================================
echo   ZELTRA - GitHub Yukleme ^& 7/24 Bulut Deploy
echo ========================================================
echo.
git branch -M main
git remote set-url origin https://github.com/baransari-code/zeltra-.git
echo Kodlar GitHub'a gonderiliyor...
git push -u origin main
echo.
echo ========================================================
if %ERRORLEVEL% equ 0 (
    echo [BASARILI] Kodlar GitHub'a yuklendi! Render otomatik derlemeye baslayacak.
) else (
    echo [BILGI] Eger tarayici acildiysa GitHub yetkisini onaylayin ve tekrar calistirin.
)
echo ========================================================
pause
