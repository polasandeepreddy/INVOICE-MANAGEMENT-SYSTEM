# CloudSigner eSIGN Integration & PDF Management System

## Overview
This document describes the CloudSigner eSIGN integration and PDF management system implemented in the Invoice Manager backend.

## Features

### 1. **CloudSigner Integration** (`cloudSignerIntegration.js`)
- **Automatic Token Management**: Manages access tokens with automatic refresh before expiry
- **PDF Signing**: Sign PDFs with digital signatures using CloudSigner API
- **Signature Verification**: Verify the validity of signed PDFs
- **Service Health Check**: Monitor CloudSigner service availability
- **Error Handling**: Comprehensive error handling and logging

### 2. **PDF Storage Management** (`pdfManager.js`)
- **Organized Folder Structure**:
  - `regular_pdfs/` - Unsigned PDFs
  - `signed_pdfs/` - Digitally signed PDFs
  - `archived_pdfs/` - Archived/old PDFs
  - `metadata/` - Metadata tracking for auditing

- **Metadata Tracking**: Automatic metadata creation for each PDF
- **Storage Statistics**: Monitor storage usage
- **PDF Cleanup**: Automated cleanup of old PDFs
- **Checksum Verification**: SHA-256 checksums for file integrity

## Configuration

### Environment Variables (.env)
```env
# CloudSigner Configuration
CLOUDSIGNER_URL=http://172.20.202.92:1621
CLOUDSIGNER_API_KEY=Your_API_Key_Here
CLOUDSIGNER_CERTIFICATE_ID=Your_Certificate_ID_Here
```

## API Endpoints

### 1. Generate Regular PDF (Unsigned)
```
POST /api/invoice/generate-pdf
```
**Request Body:**
```json
{
  "html": "<html>Invoice HTML content</html>",
  "invoiceId": "INV-12345"  // Optional
}
```

**Response:**
```json
{
  "success": true,
  "invoiceId": "INV-12345",
  "regular": {
    "fileName": "INV-12345-1692345678901.pdf",
    "type": "regular",
    "path": "/path/to/regular_pdfs/INV-12345-1692345678901.pdf",
    "fileSize": 245678,
    "createdAt": "2024-01-15T10:30:00.000Z",
    "checksum": "sha256hash..."
  }
}
```

### 2. Generate & Sign PDF (CloudSigner)
```
POST /api/invoice/generate-signed-pdf
```
**Request Body:**
```json
{
  "html": "<html>Invoice HTML content</html>",
  "invoiceId": "INV-12345",
  "signerName": "John Doe",
  "signatureReason": "Invoice Approval"
}
```

**Response:**
```json
{
  "success": true,
  "message": "PDF generated and signed successfully",
  "invoiceId": "INV-12345",
  "regular": {
    "fileName": "INV-12345-1692345678901.pdf",
    "type": "regular",
    ...
  },
  "signed": {
    "fileName": "INV-12345-SIGNED-1692345678902.pdf",
    "type": "signed",
    "signerName": "John Doe",
    "signatureReason": "Invoice Approval",
    "signedAt": "2024-01-15T10:30:01.000Z",
    ...
  }
}
```

### 3. Get CloudSigner Token Status
```
GET /api/invoice/cloudsigner/token-status
```

**Response:**
```json
{
  "success": true,
  "tokenStatus": {
    "hasToken": true,
    "isValid": true,
    "expiresIn": 2956,
    "expiryTime": "2024-01-15T11:00:00.000Z"
  }
}
```

### 4. Refresh CloudSigner Token
```
POST /api/invoice/cloudsigner/refresh-token
```

**Response:**
```json
{
  "success": true,
  "message": "Token refreshed successfully",
  "tokenStatus": {
    "hasToken": true,
    "isValid": true,
    "expiresIn": 3600,
    "expiryTime": "2024-01-15T11:30:00.000Z"
  }
}
```

### 5. Get PDF Storage Statistics
```
GET /api/invoice/pdf-storage/stats
```

**Response:**
```json
{
  "success": true,
  "statistics": {
    "regularSize": 1024576,
    "signedSize": 2048576,
    "archivedSize": 512000,
    "regularCount": 45,
    "signedCount": 38,
    "archivedCount": 12
  }
}
```

### 6. Get Invoice PDFs
```
GET /api/invoice/pdf-storage/invoice/:invoiceId
```

**Response:**
```json
{
  "success": true,
  "invoiceId": "INV-12345",
  "pdfs": {
    "regular": [
      {
        "name": "INV-12345-1692345678901.pdf",
        "path": "/path/to/regular_pdfs/INV-12345-1692345678901.pdf",
        "size": 245678
      }
    ],
    "signed": [
      {
        "name": "INV-12345-SIGNED-1692345678902.pdf",
        "path": "/path/to/signed_pdfs/INV-12345-SIGNED-1692345678902.pdf",
        "size": 246001
      }
    ]
  },
  "metadata": [
    {
      "type": "regular",
      "createdAt": "2024-01-15T10:30:00.000Z",
      ...
    }
  ]
}
```

### 7. Verify PDF Signature
```
POST /api/invoice/cloudsigner/verify-signature
```

**Request Body:**
```json
{
  "pdfBuffer": "base64EncodedPDF...",
  "invoiceId": "INV-12345"
}
```

**Response:**
```json
{
  "success": true,
  "invoiceId": "INV-12345",
  "verification": {
    "isValid": true,
    "signatureDetails": {
      "signerName": "John Doe",
      "timestamp": "2024-01-15T10:30:01Z",
      "certificateId": "..."
    },
    "timestamp": "2024-01-15T10:35:00.000Z"
  }
}
```

### 8. Clean Up Old PDFs
```
POST /api/invoice/pdf-storage/cleanup
```

**Request Body:**
```json
{
  "daysOld": 30  // Optional, defaults to 30 days
}
```

**Response:**
```json
{
  "success": true,
  "message": "Cleanup completed. 15 old PDFs deleted.",
  "deletedCount": 15
}
```

## Folder Structure

```
backend/
├── signed_invoices/
│   ├── regular_pdfs/          # Unsigned PDFs
│   │   └── INV-12345-1692345678901.pdf
│   ├── signed_pdfs/           # Digitally signed PDFs
│   │   └── INV-12345-SIGNED-1692345678902.pdf
│   ├── archived_pdfs/         # Old/archived PDFs
│   │   └── 1692345678901-INV-12345-1692345678901.pdf
│   └── metadata/              # Audit trail & metadata
│       └── INV-12345-metadata.json
└── temp/                      # Temporary PDF generation location
    └── invoice-1692345678901.pdf
```

## Metadata Structure

Each invoice has a metadata file tracking all PDF operations:

```json
[
  {
    "fileName": "INV-12345-1692345678901.pdf",
    "originalName": "INV-12345",
    "type": "regular",
    "path": "/path/to/regular_pdfs/INV-12345-1692345678901.pdf",
    "relativePath": "regular_pdfs/INV-12345-1692345678901.pdf",
    "fileSize": 245678,
    "createdAt": "2024-01-15T10:30:00.000Z",
    "checksum": "a3d5c8e9f2b4d6a8c1e3f5h7j9k2l4m6n8p0r2s4t6v8w0x"
  },
  {
    "fileName": "INV-12345-SIGNED-1692345678902.pdf",
    "originalName": "INV-12345",
    "type": "signed",
    "path": "/path/to/signed_pdfs/INV-12345-SIGNED-1692345678902.pdf",
    "relativePath": "signed_pdfs/INV-12345-SIGNED-1692345678902.pdf",
    "fileSize": 246001,
    "signerName": "John Doe",
    "signatureReason": "Invoice Approval",
    "signedAt": "2024-01-15T10:30:01.000Z",
    "createdAt": "2024-01-15T10:30:01.000Z",
    "checksum": "b4e6d9f0c3e5f7h9j1k3l5m7n9p1r3s5t7v9w1x3y5z7a9c"
  }
]
```

## Usage Examples

### Frontend Integration

#### Generate and Sign PDF
```javascript
const generateAndSignInvoice = async (invoiceData) => {
  try {
    const response = await fetch('/api/invoice/generate-signed-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        html: invoiceData.html,
        invoiceId: invoiceData.id,
        signerName: 'System Admin',
        signatureReason: 'Invoice Approval'
      })
    });

    const result = await response.json();
    if (result.success) {
      console.log('Signed PDF saved:', result.signed.relativePath);
      return result;
    }
  } catch (error) {
    console.error('Signing failed:', error);
  }
};
```

#### Check Token Status
```javascript
const checkTokenStatus = async () => {
  try {
    const response = await fetch('/api/invoice/cloudsigner/token-status');
    const data = await response.json();
    
    if (data.tokenStatus.isValid) {
      console.log(`Token valid for ${data.tokenStatus.expiresIn} seconds`);
    } else {
      // Refresh token if expired
      await fetch('/api/invoice/cloudsigner/refresh-token', { method: 'POST' });
    }
  } catch (error) {
    console.error('Token check failed:', error);
  }
};
```

### Error Handling

The system provides detailed error messages for common issues:

| Error | Cause | Solution |
|-------|-------|----------|
| CloudSigner service is not available | Service down or unreachable | Check network connection and service status |
| Token generation failed | Invalid API key or certificate ID | Verify credentials in .env file |
| PDF generation failed | Invalid HTML or memory issues | Check HTML content validity |
| PDF signing failed | Service error or timeout | Retry or refresh token |
| Signature verification failed | Invalid PDF or service error | Ensure PDF was properly signed |

## Security Considerations

1. **Token Management**: Tokens are automatically refreshed before expiry with a 5-minute buffer
2. **File Integrity**: SHA-256 checksums stored for verification
3. **Access Control**: Implement proper authorization checks in routes
4. **Data Retention**: Use cleanup endpoint to remove old PDFs
5. **Audit Trail**: Metadata files maintain complete history

## Performance Optimization

- PDFs are generated to temporary location then moved to organized storage
- Metadata is cached in JSON format for quick retrieval
- Automatic token refresh prevents service interruptions
- Storage cleanup removes files older than specified period

## Troubleshooting

### Token Issues
```bash
# Check token status
curl http://localhost:5000/api/invoice/cloudsigner/token-status

# Refresh token manually
curl -X POST http://localhost:5000/api/invoice/cloudsigner/refresh-token
```

### Storage Issues
```bash
# Get storage statistics
curl http://localhost:5000/api/invoice/pdf-storage/stats

# Cleanup old PDFs (30 days)
curl -X POST http://localhost:5000/api/invoice/pdf-storage/cleanup \
  -H "Content-Type: application/json" \
  -d '{"daysOld": 30}'
```

### Verify Signed PDFs
```bash
# Get invoice PDFs
curl http://localhost:5000/api/invoice/pdf-storage/invoice/INV-12345
```

## Future Enhancements

- Multi-signature support
- Batch PDF signing
- Advanced audit logging to database
- PDF encryption
- Scheduled cleanup jobs
- S3/Cloud storage integration
- PDF template management
