@echo off
cd /d "%~dp0"
echo Sirviendo Valdecerro en http://localhost:8000/index.html
echo Cierra esta ventana para detener el servidor.
start "Servidor Valdecerro" /min python -m http.server 8000
timeout /t 2 >nul
start "" http://localhost:8000/index.html
