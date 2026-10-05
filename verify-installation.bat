@echo off
REM CloudSigner Integration Setup Verification Script (Windows)
REM This script verifies that all components are properly installed and configured

setlocal enabledelayedexpansion

cls
echo ========================================
echo CloudSigner Integration Verification
echo ========================================
echo.

REM Counters
set PASSED=0
set FAILED=0

REM Helper function to check file
:check_file
if exist "%~1" (
    echo [OK] File exists: %~1
    set /a PASSED+=1
) else (
    echo [FAIL] File missing: %~1
    set /a FAILED+=1
)
exit /b

REM Helper function to check directory
:check_dir
if exist "%~1\" (
    echo [OK] Directory exists: %~1
    set /a PASSED+=1
) else (
    echo [FAIL] Directory missing: %~1
    set /a FAILED+=1
)
exit /b

echo.
echo 1. Checking Backend Files...
echo ---
call :check_file "backend\utils\cloudSignerIntegration.js"
call :check_file "backend\utils\pdfManager.js"
call :check_file "backend\routes\invoiceRoutes.js"
call :check_file "backend\server.js"
echo.

echo 2. Checking Frontend Files...
echo ---
call :check_file "frontend\src\utils\CloudSignerService.js"
echo.

echo 3. Checking Documentation...
echo ---
call :check_file "CLOUDSIGNER_INTEGRATION_GUIDE.md"
call :check_file "CLOUDSIGNER_QUICK_REFERENCE.md"
call :check_file "DEPLOYMENT_TESTING_GUIDE.md"
call :check_file "IMPLEMENTATION_SUMMARY.md"
call :check_file "IMPLEMENTATION_CHECKLIST.md"
echo.

echo 4. Checking Environment Configuration...
echo ---
findstr /L "CLOUDSIGNER_URL" backend\.env >nul 2>&1
if !errorlevel! equ 0 (
    echo [OK] Environment variable set: CLOUDSIGNER_URL
    set /a PASSED+=1
) else (
    echo [WARN] Environment variable missing: CLOUDSIGNER_URL
    set /a FAILED+=1
)

findstr /L "CLOUDSIGNER_API_KEY" backend\.env >nul 2>&1
if !errorlevel! equ 0 (
    echo [OK] Environment variable set: CLOUDSIGNER_API_KEY
    set /a PASSED+=1
) else (
    echo [WARN] Environment variable missing: CLOUDSIGNER_API_KEY
    set /a FAILED+=1
)

findstr /L "CLOUDSIGNER_CERTIFICATE_ID" backend\.env >nul 2>&1
if !errorlevel! equ 0 (
    echo [OK] Environment variable set: CLOUDSIGNER_CERTIFICATE_ID
    set /a PASSED+=1
) else (
    echo [WARN] Environment variable missing: CLOUDSIGNER_CERTIFICATE_ID
    set /a FAILED+=1
)
echo.

echo 5. Checking Backend Server...
echo ---
netstat -ano ^| findstr :5000 >nul 2>&1
if !errorlevel! equ 0 (
    echo [OK] Backend server running on port 5000
    set /a PASSED+=1
) else (
    echo [WARN] Backend server not running on port 5000
    set /a FAILED+=1
)
echo.

echo 6. Checking Node Modules...
echo ---
call :check_dir "backend\node_modules"
call :check_dir "frontend\node_modules"
echo.

echo 7. Checking Required NPM Packages...
echo ---
findstr /L "\"axios\"" backend\package.json >nul 2>&1
if !errorlevel! equ 0 (
    echo [OK] axios package available
    set /a PASSED+=1
) else (
    echo [FAIL] axios package missing
    set /a FAILED+=1
)

findstr /L "\"puppeteer\"" backend\package.json >nul 2>&1
if !errorlevel! equ 0 (
    echo [OK] puppeteer package available
    set /a PASSED+=1
) else (
    echo [FAIL] puppeteer package missing
    set /a FAILED+=1
)
echo.

echo 8. Testing API Endpoints...
echo ---
echo Testing: GET /api/invoice/cloudsigner/token-status
powershell -Command "try { $response = Invoke-WebRequest -Uri 'http://localhost:5000/api/invoice/cloudsigner/token-status' -UseBasicParsing; if ($response.Content -match 'success') { write-host '[OK] Token status endpoint responding'; exit 0 } else { write-host '[WARN] Unexpected response'; exit 1 } } catch { write-host '[WARN] Cannot connect - server may not be running'; exit 2 }" >nul 2>&1
if !errorlevel! equ 0 (
    set /a PASSED+=1
) else (
    set /a FAILED+=1
)
echo.

echo ========================================
echo Verification Results:
echo ========================================
echo Passed: %PASSED% checks
echo Failed: %FAILED% checks
echo.

if %FAILED% equ 0 (
    echo [OK] All checks passed! System is ready.
    exit /b 0
) else (
    echo [WARN] Some checks failed. Please review above.
    exit /b 1
)

pause
