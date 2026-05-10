@echo off
chcp 65001 > nul
cd /d "%~dp0"
title 짱샘 유튜브 스튜디오 - 시작

echo ====================================
echo   짱샘 유튜브 스튜디오 시작
echo ====================================
echo.

REM ---- 1. NotebookLM 인증 확인 ----
echo [1/3] NotebookLM 인증 확인 중...
nlm list notebooks --json > nul 2>&1
if errorlevel 1 (
    echo   ^! 인증 만료/미로그인. Chrome 으로 로그인합니다...
    nlm login
    if errorlevel 1 (
        echo.
        echo   X NotebookLM 로그인 실패. 다시 시도하세요.
        echo.
        pause
        exit /b 1
    )
    echo   v 로그인 완료
) else (
    echo   v 인증 OK
)
echo.

REM ---- 2. dev 서버 health check (HTTP 200 응답하면 살아있는 것으로 간주) ----
echo [2/3] dev 서버 확인 중...
curl -s -o nul -w "%%{http_code}" --max-time 3 http://localhost:3008/ > "%TEMP%\jjangsaem_health.txt" 2>nul
set /p HEALTH=<"%TEMP%\jjangsaem_health.txt"
del "%TEMP%\jjangsaem_health.txt" 2>nul

if "%HEALTH%"=="200" (
    echo   v 이미 실행 중 ^(http://localhost:3008/ HTTP 200^)
    set NEED_WAIT=0
) else (
    echo   ^! dev 서버 응답 없음 ^(현재: %HEALTH%^). 새 창에서 시작합니다 - 닫지 마세요.
    start "Jjangsaem Dev Server" cmd /k "cd /d %~dp0 && npm run dev"
    set NEED_WAIT=1
)
echo.

REM 새로 띄운 경우만 부팅 대기 + 응답 확인
if "%NEED_WAIT%"=="1" (
    echo   서버 부팅 대기 중...
    set RETRIES=0
    :WAIT_LOOP
    timeout /t 2 /nobreak > nul
    curl -s -o nul -w "%%{http_code}" --max-time 2 http://localhost:3008/ > "%TEMP%\jjangsaem_health.txt" 2>nul
    set /p HEALTH=<"%TEMP%\jjangsaem_health.txt"
    del "%TEMP%\jjangsaem_health.txt" 2>nul
    if "%HEALTH%"=="200" (
        echo   v 서버 응답 OK
        goto :WAIT_DONE
    )
    set /a RETRIES+=1
    if %RETRIES% lss 15 goto :WAIT_LOOP
    echo   ^! 서버가 30초 안에 응답하지 않았습니다. dev 서버 창의 에러 로그를 확인하세요.
    :WAIT_DONE
)
echo.

REM ---- 3. 브라우저 열기 ----
echo [3/3] 브라우저 열기...
start http://localhost:3008/

echo.
echo ====================================
echo   준비 완료. 브라우저에서 작업하세요.
echo ====================================
echo.
echo   * 종료 시: 'Jjangsaem Dev Server' 창에서 Ctrl+C
echo.
timeout /t 5 > nul
exit /b 0
