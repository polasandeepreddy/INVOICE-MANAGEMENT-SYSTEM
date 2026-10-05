# Deployment & Testing Guide

## 🚀 Deployment Steps

### Step 1: Update Dependencies (if needed)
All required packages are already in `package.json`:
- `axios` - HTTP requests
- `puppeteer` - PDF generation
- Other existing dependencies

No additional `npm install` needed, but you can verify:
```bash
cd backend
npm install
```

### Step 2: Verify Environment Variables
Edit `backend/.env` and ensure CloudSigner config:
```env
CLOUDSIGNER_URL=http://172.20.202.92:1621
CLOUDSIGNER_API_KEY=Your_API_Key_Here
CLOUDSIGNER_CERTIFICATE_ID=Your_Certificate_ID_Here
```

### Step 3: Restart Backend Server
```bash
cd backend
npm start
# or with nodemon for development
npm run dev
```

### Step 4: Verify Installation
```bash
# Check if new routes are loaded
curl http://localhost:5000/api/invoice/cloudsigner/token-status
```

## 🧪 Testing Guide

### Test 1: Check CloudSigner Connection
```bash
curl http://localhost:5000/api/invoice/cloudsigner/token-status
```

**Expected Response:**
```json
{
  "success": true,
  "tokenStatus": {
    "hasToken": false,
    "isValid": false,
    "expiresIn": null,
    "expiryTime": null
  }
}
```

### Test 2: Generate Regular PDF
```bash
curl -X POST http://localhost:5000/api/invoice/generate-pdf \
  -H "Content-Type: application/json" \
  -d '{
    "html": "<html><body><h1>Test Invoice</h1><p>Test content</p></body></html>",
    "invoiceId": "TEST-PDF-001"
  }'
```

**Expected Result:** Regular PDF saved to `backend/signed_invoices/regular_pdfs/`

### Test 3: Generate & Sign PDF
```bash
curl -X POST http://localhost:5000/api/invoice/generate-signed-pdf \
  -H "Content-Type: application/json" \
  -d '{
    "html": "<html><body><h1>Test Invoice</h1><p>Test content</p></body></html>",
    "invoiceId": "TEST-SIGNED-001",
    "signerName": "Test Signer",
    "signatureReason": "Test Signature"
  }'
```

**Expected Result:** 
- Regular PDF saved to `backend/signed_invoices/regular_pdfs/`
- Signed PDF saved to `backend/signed_invoices/signed_pdfs/`
- Metadata saved to `backend/signed_invoices/metadata/`

### Test 4: Check Storage Statistics
```bash
curl http://localhost:5000/api/invoice/pdf-storage/stats
```

**Expected Response:**
```json
{
  "success": true,
  "statistics": {
    "regularSize": 245678,
    "signedSize": 246001,
    "archivedSize": 0,
    "regularCount": 1,
    "signedCount": 1,
    "archivedCount": 0
  }
}
```

### Test 5: Get Invoice PDFs
```bash
curl http://localhost:5000/api/invoice/pdf-storage/invoice/TEST-SIGNED-001
```

**Expected Response:** Lists all PDFs and metadata for the invoice

## 🔍 Verification Checklist

- [ ] Backend server starts without errors
- [ ] `/api/invoice/cloudsigner/token-status` endpoint responds
- [ ] Regular PDF generated successfully
- [ ] Signed PDF generated successfully
- [ ] Metadata files created in `backend/signed_invoices/metadata/`
- [ ] Storage stats endpoint returns data
- [ ] PDFs are readable and properly formatted
- [ ] Token status shows valid token after signing
- [ ] No errors in console logs

## 📂 File Structure After Deployment

```
backend/
├── signed_invoices/          (Auto-created)
│   ├── regular_pdfs/         (Auto-created)
│   │   └── TEST-PDF-001-*.pdf
│   ├── signed_pdfs/          (Auto-created)
│   │   └── TEST-SIGNED-001-SIGNED-*.pdf
│   ├── archived_pdfs/        (Auto-created)
│   └── metadata/             (Auto-created)
│       └── TEST-SIGNED-001-metadata.json
├── routes/
│   └── invoiceRoutes.js      (Updated ✅)
├── utils/
│   ├── cloudSignerIntegration.js    (NEW ✅)
│   ├── pdfManager.js               (NEW ✅)
│   └── generateInvoicePDF.js       (Existing)
└── server.js                  (Existing)
```

## 🔧 Troubleshooting

### Issue: "CLOUDSIGNER service is not available"
**Solution:**
1. Check CloudSigner URL in `.env` is correct
2. Verify network connectivity: `ping 172.20.202.92`
3. Check if CloudSigner service is running on port 1621
4. Test with: `curl http://172.20.202.92:1621`

### Issue: "Token generation failed"
**Solution:**
1. Verify `CLOUDSIGNER_API_KEY` is correct
2. Verify `CLOUDSIGNER_CERTIFICATE_ID` is correct
3. Check CloudSigner service logs
4. Try refreshing token: `POST /api/invoice/cloudsigner/refresh-token`

### Issue: "Cannot find module 'cloudSignerIntegration'"
**Solution:**
1. Restart backend server
2. Verify file exists at `backend/utils/cloudSignerIntegration.js`
3. Check file permissions

### Issue: "Folder does not exist" for signed_invoices
**Solution:**
- Folder is auto-created on first request
- If not created, manually create: `backend/signed_invoices/`
- Ensure write permissions on backend folder

## 🧹 Post-Deployment Tasks

### 1. Monitor Storage
```bash
# Weekly check
curl http://localhost:5000/api/invoice/pdf-storage/stats
```

### 2. Schedule Cleanup (Monthly)
```bash
# Remove PDFs older than 30 days
curl -X POST http://localhost:5000/api/invoice/pdf-storage/cleanup \
  -H "Content-Type: application/json" \
  -d '{"daysOld": 30}'
```

### 3. Monitor Token Status (Daily)
```bash
curl http://localhost:5000/api/invoice/cloudsigner/token-status
```

## 📊 Performance Metrics

| Metric | Expected | Threshold |
|--------|----------|-----------|
| PDF Generation | < 3s | < 5s |
| PDF Signing | < 2s | < 5s |
| Token Generation | < 1s | < 2s |
| Token Refresh | < 1s | < 2s |
| Storage Query | < 100ms | < 500ms |

## 🔐 Security Checklist

- [ ] CloudSigner credentials not exposed in frontend code
- [ ] API keys stored only in `.env` file
- [ ] `.env` file not committed to git
- [ ] CORS properly configured in `server.js`
- [ ] Routes validate input data
- [ ] Error messages don't expose sensitive info
- [ ] PDFs stored outside web-accessible directory
- [ ] Metadata files protected from public access
- [ ] Regular backups of `signed_invoices/` folder

## 📝 Logging & Monitoring

### Console Logs
The system logs important events with `[Module]` prefix:
```
[CloudSigner] Access token acquired successfully
[PDFManager] Regular PDF saved: /path/to/file.pdf
[PDFManager] Signed PDF saved: /path/to/file.pdf
[Invoice Routes] PDF generation/signing error: ...
```

### Log Files (Optional)
For production, redirect logs to file:
```bash
npm start > logs/invoice-server.log 2>&1
```

## 🎯 Next Steps

1. **Test all endpoints** using the Testing Guide above
2. **Configure frontend** using `CloudSignerService.js`
3. **Set up monitoring** for storage and token status
4. **Plan cleanup schedule** for old PDFs
5. **Document CloudSigner credentials** (secure location)
6. **Train users** on new signing feature
7. **Set up error alerts** for production

## 📞 Support

If issues occur:

1. Check console logs for error messages
2. Verify `.env` configuration
3. Ensure CloudSigner service is running
4. Check network connectivity
5. Review troubleshooting section above
6. Check metadata files for audit trail

---

**Version:** 1.0  
**Last Updated:** 2024-01-15  
**Status:** Ready for Deployment ✅
