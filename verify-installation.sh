#!/bin/bash

# CloudSigner Integration Setup Verification Script
# This script verifies that all components are properly installed and configured

echo "========================================"
echo "CloudSigner Integration Verification"
echo "========================================"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
PASSED=0
FAILED=0

# Check function
check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} File exists: $1"
        ((PASSED++))
    else
        echo -e "${RED}✗${NC} File missing: $1"
        ((FAILED++))
    fi
}

check_dir() {
    if [ -d "$1" ]; then
        echo -e "${GREEN}✓${NC} Directory exists: $1"
        ((PASSED++))
    else
        echo -e "${RED}✗${NC} Directory missing: $1"
        ((FAILED++))
    fi
}

check_env() {
    if grep -q "$1" backend/.env 2>/dev/null; then
        echo -e "${GREEN}✓${NC} Environment variable set: $1"
        ((PASSED++))
    else
        echo -e "${YELLOW}⚠${NC} Environment variable missing: $1"
        ((FAILED++))
    fi
}

# Test connectivity
test_connection() {
    local url="$1"
    if curl -s -o /dev/null -w "%{http_code}" "$url" > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} Can reach: $url"
        ((PASSED++))
    else
        echo -e "${RED}✗${NC} Cannot reach: $url"
        ((FAILED++))
    fi
}

echo "1. Checking Backend Files..."
echo "---"
check_file "backend/utils/cloudSignerIntegration.js"
check_file "backend/utils/pdfManager.js"
check_file "backend/routes/invoiceRoutes.js"
check_file "backend/server.js"
echo ""

echo "2. Checking Frontend Files..."
echo "---"
check_file "frontend/src/utils/CloudSignerService.js"
echo ""

echo "3. Checking Documentation..."
echo "---"
check_file "CLOUDSIGNER_INTEGRATION_GUIDE.md"
check_file "CLOUDSIGNER_QUICK_REFERENCE.md"
check_file "DEPLOYMENT_TESTING_GUIDE.md"
check_file "IMPLEMENTATION_SUMMARY.md"
check_file "IMPLEMENTATION_CHECKLIST.md"
echo ""

echo "4. Checking Environment Configuration..."
echo "---"
check_env "CLOUDSIGNER_URL"
check_env "CLOUDSIGNER_API_KEY"
check_env "CLOUDSIGNER_CERTIFICATE_ID"
echo ""

echo "5. Checking Backend Server..."
echo "---"
if lsof -i :5000 > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Backend server running on port 5000"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠${NC} Backend server not running on port 5000"
    ((FAILED++))
fi
echo ""

echo "6. Checking Node Modules..."
echo "---"
if [ -d "backend/node_modules" ]; then
    echo -e "${GREEN}✓${NC} Backend node_modules directory exists"
    ((PASSED++))
else
    echo -e "${RED}✗${NC} Backend node_modules missing - run 'npm install'"
    ((FAILED++))
fi

if [ -d "frontend/node_modules" ]; then
    echo -e "${GREEN}✓${NC} Frontend node_modules directory exists"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠${NC} Frontend node_modules missing"
    ((FAILED++))
fi
echo ""

echo "7. Checking Required NPM Packages..."
echo "---"
if grep -q '"axios"' backend/package.json; then
    echo -e "${GREEN}✓${NC} axios package available"
    ((PASSED++))
else
    echo -e "${RED}✗${NC} axios package missing"
    ((FAILED++))
fi

if grep -q '"puppeteer"' backend/package.json; then
    echo -e "${GREEN}✓${NC} puppeteer package available"
    ((PASSED++))
else
    echo -e "${RED}✗${NC} puppeteer package missing"
    ((FAILED++))
fi
echo ""

echo "8. Testing API Endpoints..."
echo "---"
if command -v curl &> /dev/null; then
    echo "Testing: GET /api/invoice/cloudsigner/token-status"
    RESPONSE=$(curl -s http://localhost:5000/api/invoice/cloudsigner/token-status 2>/dev/null)
    if echo "$RESPONSE" | grep -q "success"; then
        echo -e "${GREEN}✓${NC} Token status endpoint responding"
        ((PASSED++))
    else
        echo -e "${YELLOW}⚠${NC} Token status endpoint not responding - server may not be running"
        ((FAILED++))
    fi
else
    echo -e "${YELLOW}⚠${NC} curl not available - skipping endpoint tests"
fi
echo ""

echo "========================================"
echo "Verification Results:"
echo "========================================"
echo -e "${GREEN}Passed:${NC} $PASSED checks"
echo -e "${RED}Failed:${NC} $FAILED checks"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All checks passed! System is ready.${NC}"
    exit 0
else
    echo -e "${YELLOW}⚠ Some checks failed. Please review above.${NC}"
    exit 1
fi
