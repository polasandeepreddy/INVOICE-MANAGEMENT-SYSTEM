const express = require('express');
const router = express.Router();
const generateInvoicePDF = require("../utils/generateInvoicePDF");
const cloudSignerIntegration = require("../utils/cloudSignerIntegration");
const pdfManager = require("../utils/pdfManager");
const path = require('path');
const fs = require('fs');

// Ensure temp directory exists
const tempDir = path.join(__dirname, "../temp");
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

/**
 * Generate PDF without signing (download only, not saved to storage)
 * Original PDFs are stored in database
 */
router.post('/generate-pdf', async (req, res) => {
  try {
    const { html, invoiceId } = req.body;

    if (!html) {
      return res.status(400).json({ error: "HTML content is required" });
    }

    const tempOutputPath = path.join(tempDir, `invoice-${Date.now()}.pdf`);

    // Generate PDF to temporary location
    await generateInvoicePDF(html, tempOutputPath);

    const invoiceName = invoiceId || `invoice-${Date.now()}`;

    // Download and clean up temp file
    res.download(tempOutputPath, `${invoiceName}.pdf`, (err) => {
      if (err) {
        console.error("[Invoice Routes] Download error:", err);
      }
      // Clean up temp file after download
      setTimeout(() => {
        if (fs.existsSync(tempOutputPath)) {
          fs.unlinkSync(tempOutputPath);
        }
      }, 1000);
    });

  } catch (err) {
    console.error("[Invoice Routes] PDF generation error:", err);
    res.status(500).json({
      error: "PDF generation failed",
      details: err.message,
    });
  }
});

/**
 * Generate and sign PDF with CloudSigner
 * Original PDF is stored in database. Only signed PDF saved to folder.
 */
router.post('/generate-signed-pdf', async (req, res) => {
  try {
    const { html, invoiceId, signerName, signatureReason } = req.body;

    if (!html) {
      return res.status(400).json({ error: "HTML content is required" });
    }

    // Check CloudSigner service availability
    const isServiceAvailable = await cloudSignerIntegration.isServiceAvailable();
    if (!isServiceAvailable) {
      return res.status(503).json({
        error: "CloudSigner service is not available",
        details: "Please try again later",
      });
    }

    // Generate PDF to temporary location
    const tempOutputPath = path.join(tempDir, `invoice-${Date.now()}.pdf`);
    await generateInvoicePDF(html, tempOutputPath);

    // Read generated PDF
    const pdfBuffer = fs.readFileSync(tempOutputPath);

    const invoiceName = invoiceId || `invoice-${Date.now()}`;

    // Sign the PDF
    const signedPdfBuffer = await cloudSignerIntegration.signPDF(
      pdfBuffer,
      signatureReason || 'Invoice Approval',
      signerName || 'System'
    );

    // ✅ ONLY SAVE SIGNED PDF (Original is in database)
    const signedMetadata = await pdfManager.saveSignedPDF(
      signedPdfBuffer,
      invoiceName,
      signerName || 'System',
      signatureReason || 'Invoice Approval'
    );

    // Clean up temp file
    if (fs.existsSync(tempOutputPath)) {
      fs.unlinkSync(tempOutputPath);
    }

    res.json({
      success: true,
      message: "PDF signed and saved successfully",
      invoiceId: invoiceName,
      signed: signedMetadata,
      note: "Original PDF is stored in database"
    });

  } catch (err) {
    console.error("[Invoice Routes] PDF signing error:", err);
    res.status(500).json({
      error: "PDF signing failed",
      details: err.message,
    });
  }
});

/**
 * Get CloudSigner token status
 */
router.get('/cloudsigner/token-status', async (req, res) => {
  try {
    const tokenStatus = cloudSignerIntegration.getTokenStatus();
    res.json({
      success: true,
      tokenStatus,
    });
  } catch (err) {
    console.error("[Invoice Routes] Token status check error:", err);
    res.status(500).json({
      error: "Failed to get token status",
      details: err.message,
    });
  }
});

/**
 * Refresh CloudSigner token
 */
router.post('/cloudsigner/refresh-token', async (req, res) => {
  try {
    const newToken = await cloudSignerIntegration.refreshToken();
    const tokenStatus = cloudSignerIntegration.getTokenStatus();

    res.json({
      success: true,
      message: "Token refreshed successfully",
      tokenStatus,
    });
  } catch (err) {
    console.error("[Invoice Routes] Token refresh error:", err);
    res.status(500).json({
      error: "Failed to refresh token",
      details: err.message,
    });
  }
});

/**
 * Get PDF storage statistics (Signed PDFs only)
 * Original PDFs are stored in database
 */
router.get('/pdf-storage/stats', async (req, res) => {
  try {
    const stats = pdfManager.getStorageStats();
    res.json({
      success: true,
      statistics: {
        signedCount: stats.signedCount,
        signedSize: stats.signedSize,
        archivedCount: stats.archivedCount,
        archivedSize: stats.archivedSize,
      },
      note: "Only signed PDFs are stored. Original PDFs are in database."
    });
  } catch (err) {
    console.error("[Invoice Routes] Storage stats error:", err);
    res.status(500).json({
      error: "Failed to retrieve storage statistics",
      details: err.message,
    });
  }
});

/**
 * Get signed PDFs for a specific invoice
 * (Regular/original PDFs are stored in database)
 */
router.get('/pdf-storage/invoice/:invoiceId', async (req, res) => {
  try {
    const { invoiceId } = req.params;

    if (!invoiceId) {
      return res.status(400).json({ error: "Invoice ID is required" });
    }

    const invoicePDFs = pdfManager.getInvoicePDFs(invoiceId);
    const metadata = pdfManager.getMetadata(invoiceId);

    res.json({
      success: true,
      invoiceId,
      signedPDFs: invoicePDFs.signed,
      metadata: metadata ? metadata.filter(m => m.type === 'signed') : [],
      note: "Original PDF is stored in database"
    });
  } catch (err) {
    console.error("[Invoice Routes] Get invoice PDFs error:", err);
    res.status(500).json({
      error: "Failed to retrieve invoice PDFs",
      details: err.message,
    });
  }
});

/**
 * Download signed PDF from folder
 */
router.get('/pdf-storage/download/:invoiceId', async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const invoicePDFs = pdfManager.getInvoicePDFs(invoiceId);
    if (!invoicePDFs.signed || invoicePDFs.signed.length === 0) {
      return res.status(404).json({ error: "Signed PDF not found in folder" });
    }
    const latestSignedPDF = invoicePDFs.signed[invoicePDFs.signed.length - 1];
    res.download(latestSignedPDF.path, latestSignedPDF.name);
  } catch (err) {
    console.error("[Invoice Routes] Download signed PDF error:", err);
    res.status(500).json({ error: "Failed to download signed PDF", details: err.message });
  }
});

/**
 * Open (view inline) signed PDF from folder
 */
router.get('/pdf-storage/open/:invoiceId', async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const invoicePDFs = pdfManager.getInvoicePDFs(invoiceId);
    if (!invoicePDFs.signed || invoicePDFs.signed.length === 0) {
      return res.status(404).json({ error: "Signed PDF not found in folder" });
    }
    const latestSignedPDF = invoicePDFs.signed[invoicePDFs.signed.length - 1];
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${latestSignedPDF.name}"`);
    fs.createReadStream(latestSignedPDF.path).pipe(res);
  } catch (err) {
    console.error("[Invoice Routes] Open signed PDF error:", err);
    res.status(500).json({ error: "Failed to open signed PDF", details: err.message });
  }
});

/**
 * Clean up old PDFs
 */
router.post('/pdf-storage/cleanup', async (req, res) => {
  try {
    const { daysOld = 30 } = req.body;

    const deletedCount = pdfManager.cleanupOldPDFs(daysOld);

    res.json({
      success: true,
      message: `Cleanup completed. ${deletedCount} old PDFs deleted.`,
      deletedCount,
    });
  } catch (err) {
    console.error("[Invoice Routes] Cleanup error:", err);
    res.status(500).json({
      error: "Failed to cleanup old PDFs",
      details: err.message,
    });
  }
});

/**
 * Verify PDF signature
 */
router.post('/cloudsigner/verify-signature', async (req, res) => {
  try {
    const { pdfBuffer, invoiceId } = req.body;

    if (!pdfBuffer) {
      return res.status(400).json({ error: "PDF buffer is required" });
    }

    const pdfData = Buffer.from(pdfBuffer, 'base64');
    const verificationResult = await cloudSignerIntegration.verifySignature(pdfData);

    res.json({
      success: true,
      invoiceId,
      verification: verificationResult,
    });
  } catch (err) {
    console.error("[Invoice Routes] Signature verification error:", err);
    res.status(500).json({
      error: "Failed to verify signature",
      details: err.message,
    });
  }
});

module.exports = router;