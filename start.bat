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

REM ---- 2. dev 서버 확인 + 시작 ----
echo [2/3] dev 서버 확인 중...
netstat -ano | findstr ":3008" | findstr "LISTENING" > nul 2>&1
if not errorlevel 1 (
    echo   v 이미 실행 중 ^(포트 3008^)
    set NEED_WAIT=0
) else (
    echo   ^! dev 서버 시작 중... ^(별도 창 - 절대 닫지 마세요^)
    start "Jjangsaem Dev Server" cmd /k "cd /d %~dp0 && npm run dev"
    set NEED_WAIT=1
)
echo.

REM 새로 띄운 경우만 부팅 대기
if "%NEED_WAIT%"=="1" (
    echo   서버 부팅 대기 ^(10초^)...
    timeout /t 10 /nobreak > nul
)

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
