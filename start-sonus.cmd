@echo off
REM === Lanzador de Sonus ===
REM Inicia un servidor local y abre la app en el navegador.
cd /d "%~dp0"
echo Iniciando Sonus en http://localhost:8123 ...
start "" "http://localhost:8123"
python -m http.server 8123
