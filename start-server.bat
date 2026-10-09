@echo off
REM Starts a local web server for Sugar Pop and opens it in your browser.
cd /d "%~dp0"
start "" http://localhost:8000
python -m http.server 8000
