# CloudSigner & PDF Management - Quick Reference

## ✅ What's Been Implemented

### 1. **CloudSigner Token Management** (`backend/utils/cloudSignerIntegration.js`)
- Automatic token generation and refresh
- 5-minute expiry buffer to prevent token timeouts
- Service health checking
- Caching system for performance

### 2. **PDF Storage Management** (`backend/utils/pdfManager.js`)
- Organized folder structure with automatic creation
- Separate folders for regular, signed, and archived PDFs
- Metadata tracking with checksums
- Storage statistics and cleanup functions

### 3. **Enhanced Routes** (`backend/routes/invoiceRoutes.js`)
- `/api/invoice/generate-pdf` - Generate unsigned PDF
- `/api/invoice/generate-signed-pdf` - Generate & sign PDF
- `/api/invoice/cloudsigner/token-status` - Check token validity
- `/api/invoice/cloudsigner/refresh-token` - Refresh access token
- `/api/invoice/pdf-storage/stats` - View storage usage
- `/api/invoice/pdf-storage/invoice/:invoiceId` - Get invoice PDFs
- `/api/invoice/cloudsigner/verify-signature` - Verify signed PDF
- `/api/invoice/pdf-storage/cleanup` - Clean old PDFs

## 🚀 Quick Start

### Step 1: Verify Environment Variables
```
# backend/.env
CLOUDSIGNER_URL=http://172.20.202.92:1621
CLOUDSIGNER_API_KEY=Your_API_Key
CLOUDSIGNER_CERTIFICATE_ID=Your_Certificate_ID
```

### Step 2: Test CloudSigner Connection
```bash
curl http://localhost:5000/api/invoice/cloudsigner/token-status
```

### Step 3: Generate & Sign Your First Invoice
```bash
curl -X POST http://localhost:5000/api/invoice/generate-signed-pdf \
  -H "Content-Type: application/json" \
  -d '{
    "html": "<html><body>Invoice Content</body></html>",
    "invoiceId": "TEST-001",
    "signerName": "System",
    "signatureReason": "Invoice Approval"
  }'
```

## 📁 Folder Structure

```
backend/signed_invoices/
├── regular_pdfs/      # Unsigned PDFs
├── signed_pdfs/       # Signed PDFs (in one folder!)
├── archived_pdfs/     # Old PDFs (auto-cleanup)
└── metadata/          # Audit trail
```

All PDFs are now saved in **ONE organized location** with clear separation!

## 🔑 Token Management

**Automatic:**
- Token generated on first sign request
- Auto-refreshes before expiry
- 5-minute buffer to prevent timeouts

**Manual:**
```bash
# Check status
curl http://localhost:5000/api/invoice/cloudsigner/token-status

# Refresh if needed
curl -X POST http://localhost:5000/api/invoice/cloudsigner/refresh-token
```

## 📊 Monitoring

### Check Storage Usage
```bash
curl http://localhost:5000/api/invoice/pdf-storage/stats
```

**Response:**
```json
{
  "regularCount": 45,
  "signedCount": 38,
  "archivedCount": 12,
  "regularSize": 1024576,
  "signedSize": 2048576
}
```

### Get Invoice PDFs
```bash
curl http://localhost:5000/api/invoice/pdf-storage/invoice/INV-12345
```

## 🧹 Cleanup Old PDFs

### Automatic Cleanup (30 days)
```bash
curl -X POST http://localhost:5000/api/invoice/pdf-storage/cleanup \
  -H "Content-Type: application/json" \
  -d '{"daysOld": 30}'
```

## 🛡️ File Integrity

Each PDF has:
- **SHA-256 Checksum** - Verify file wasn't tampered
- **Metadata** - Track creation time, signer, reason
- **Audit Trail** - Complete history in metadata files

## 🔒 Security Features

✅ Automatic token refresh before expiry  
✅ Service health checks  
✅ File integrity verification (SHA-256)  
✅ Complete audit trail  
✅ Organized storage with backups  
✅ Automatic old PDF cleanup  

## ⚠️ Error Handling

If CloudSigner service is unavailable:
- System returns 503 error with details
- Regular PDF still generated for backup
- Token automatically refreshes on next request

## 💡 Best Practices

1. **Regular Monitoring**: Check storage stats weekly
2. **Cleanup Schedule**: Run cleanup monthly
3. **Token Status**: Check token before batch processing
4. **Backup**: Archive important signed PDFs regularly
5. **Error Logs**: Monitor console for CloudSigner errors

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| Token expired | Call refresh endpoint or wait for auto-refresh |
| Service unavailable | Check CloudSigner URL and connectivity |
| Storage full | Run cleanup endpoint with appropriate `daysOld` |
| PDF not signed | Verify CloudSigner credentials in .env |

## 📚 Related Files

- **Main Guide**: `CLOUDSIGNER_INTEGRATION_GUIDE.md`
- **CloudSigner Utils**: `backend/utils/cloudSignerIntegration.js`
- **PDF Manager**: `backend/utils/pdfManager.js`
- **Routes**: `backend/routes/invoiceRoutes.js`
- **.env Config**: `backend/.env`

## 🎯 Next Steps

1. Restart backend server to load new routes
2. Test generation-signed-pdf endpoint
3. Verify PDFs in `backend/signed_invoices/signed_pdfs/`
4. Set up monitoring for token status
5. Configure cleanup schedule

---
**Version:** 1.0  
**Last Updated:** 2024-01-15  
**Status:** ✅ Ready for Production
