@echo off
chcp 936 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"
title 受电弓碳滑板监测平台 - 启动器

echo ============================================================
echo   受电弓碳滑板监测平台 - 启动器
echo   工程目录: %CD%
echo ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 Node.js，请安装 Node.js 20.19+ / 22.12+ 并加入 PATH。
  echo        下载地址: https://nodejs.org/
  echo.
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node -v') do set NODEV=%%v
echo [信息] Node.js %NODEV%

if not exist "package.json" (
  echo [错误] 当前目录下没有 package.json，说明本脚本不在工程目录内。
  echo        正确位置应为: D:\realtime-platform\realtime-platform-main\启动平台.bat
  echo.
  pause
  exit /b 1
)
if not exist "node_modules" (
  echo [错误] 未找到 node_modules，请先在本目录执行: npm install
  echo.
  pause
  exit /b 1
)
if not exist ".env" (
  echo [警告] 未找到 .env，平台将使用默认配置（PLC_HOST=192.168.1.88）。
  echo        联调前请执行: copy .env.example .env
  echo.
)

:menu
echo.
echo ------------------------------------------------------------
echo   1. 启动平台（单端口 3000，使用已构建的 dist，推荐）
echo   2. 构建前端后启动（npm run build ^&^& npm start）
echo   3. 同时启动 PLC 模拟器与平台（两个窗口）
echo   4. 只启动 PLC 模拟器（联调用）
echo   5. 环境自检（Node / .env / 端口占用）
echo   0. 退出
echo ------------------------------------------------------------
set /p CHOICE=请输入序号并回车:
echo.

if "%CHOICE%"=="1" goto run
if "%CHOICE%"=="2" goto buildrun
if "%CHOICE%"=="3" goto both
if "%CHOICE%"=="4" goto sim
if "%CHOICE%"=="5" goto check
if "%CHOICE%"=="0" exit /b 0
echo [提示] 输入无效，请重新选择。
goto menu

:run
echo [启动] 平台地址 http://127.0.0.1:3000 ，按 Ctrl+C 可停止。
echo.
call npm start
goto done

:buildrun
echo [构建] 正在执行 npm run build ...
call npm run build
if errorlevel 1 (
  echo.
  echo [错误] 构建失败，请查看上方输出。
  pause
  goto menu
)
echo.
echo [启动] 平台地址 http://127.0.0.1:3000 ，按 Ctrl+C 可停止。
echo.
call npm start
goto done

:both
echo [启动] 新窗口运行 PLC 模拟器，本窗口运行平台。
start "PLC 模拟器" cmd /k "node plc-simulator.js"
echo [等待] 正在等待模拟器监听 1502 端口 ...
set /a WAITN=0
:waitport
netstat -ano | findstr ":1502" | findstr LISTENING >nul 2>nul
if not errorlevel 1 goto portsready
set /a WAITN+=1
if %WAITN% GEQ 25 goto portsready
ping -n 2 127.0.0.1 >nul
goto waitport
:portsready
echo [就绪] 模拟器已监听（等待 %WAITN% 次探测）。
echo [启动] 平台地址 http://127.0.0.1:3000 ，按 Ctrl+C 可停止。
echo.
call npm start
goto done

:sim
echo [启动] PLC 模拟器（协议层模拟 H5U），按 Ctrl+C 可停止。
echo.
call npm run plc-sim:closedloop
goto done

:check
echo ---- Node ----
where node
node -v
echo.
echo ---- .env 关键项 ----
if exist ".env" (
  findstr /b /c:"PLC_MODE" /c:"PLC_HOST" /c:"PLC_PORT" /c:"PLC_UNIT_ID" /c:"DATABASE_URL" .env
) else (
  echo [警告] 缺少 .env，请执行: copy .env.example .env
)
echo.
echo ---- 端口占用（无输出表示空闲）----
echo [3000]
netstat -ano | findstr ":3000" | findstr LISTENING
echo [1502]
netstat -ano | findstr ":1502" | findstr LISTENING
echo.
pause
goto menu

:done
echo.
echo [信息] 进程已退出。按任意键返回菜单。
pause >nul
goto menu
