@echo off
rem Chis Flasher 一键诊断：双击运行，完成后桌面生成 chis-diag-*.txt
rem 闪退排查：若窗口一闪而过，删掉下行开头的 rem 查看错误
rem pause
where powershell >nul 2>nul || (echo 需要 PowerShell & pause & exit /b 1)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0diagnose.ps1"
