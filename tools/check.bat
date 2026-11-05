@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ===== Проверка модуля удаления фона =====
echo.
echo 1) Python:
python --version
if errorlevel 1 echo    НЕТ - установите Python с python.org с галочкой "Add Python to PATH"
echo.
echo 2) Нейросеть rembg:
python -c "import rembg; print('   OK - установлена')"
if errorlevel 1 echo    НЕТ - выполните установку: pip install -r requirements.txt
echo.
echo 3) Папка bg_remover:
if exist "%~dp0bg_remover\server.py" (echo    OK - на месте) else (echo    НЕТ - скопируйте папку bg_remover сюда: %~dp0)
echo.
echo Сделайте скриншот этого окна и пришлите его.
pause
