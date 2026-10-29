@echo off
rem FundyNode deploy: build here, send only changed layers to the server over SSH, start, health-check, auto-rollback.
rem Usage: deploy.bat [deploy ^| setup ^| versions ^| rollback [version] ^| status ^| check ^| env [undo]]   (docs/deployment.md)
setlocal
cd /d "%~dp0"

set "GITBASH="
for /f "delims=" %%G in ('where git 2^>nul') do if not defined GITBASH set "GITBASH=%%~dpG..\bin\bash.exe"
if not exist "%GITBASH%" set "GITBASH=%ProgramFiles%\Git\bin\bash.exe"
if not exist "%GITBASH%" (
  echo !!! Git for Windows bash.exe not found. Install Git for Windows.
  set RC=1
  goto :end
)

"%GITBASH%" tools/deploy/deploy.sh %*
set RC=%ERRORLEVEL%

:end
rem pause only when started by double-click, so the window does not close on the result
rem (find.exe with full path: Git's Unix find may come first in PATH)
echo %cmdcmdline% | "%SystemRoot%\System32\find.exe" /i "%~nx0" >nul && pause
exit /b %RC%
