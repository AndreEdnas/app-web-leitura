@echo off
REM ----------------------------------------
REM Inicia o ngrok na porta 3051 em novo processo (minimizado)
REM ----------------------------------------
start /min "" "C:\EDNAS\APP\ngrok-v3-stable-windows-amd64\ngrok.exe" http 3051 --log "C:\EDNAS\APP\ngrok.log"

REM Espera alguns segundos para o ngrok levantar e gerar o link
timeout /t 8 /nobreak >nul

REM ----------------------------------------
REM Chama o script updateNgrok.js para buscar o link e atualizar
REM ----------------------------------------
node "C:\EDNAS\APP\app-web-leitura\updateNgrok.js"
