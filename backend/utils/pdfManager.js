const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class PDFManager {
  constructor() {
    this.basePath = path.join(__dirname, '../signed_invoices');
    this.initializeFolders();
  }

  /**
   * Initialize folder structure for PDF storage
   * Structure (Signed PDFs only - Original PDFs stored in database):
   * signed_invoices/
   *   ├── signed_pdfs/
   *   ├── archived_pdfs/
   *   └── metadata/
   */
  initializeFolders() {
    const folders = [
      this.basePath,
      path.join(this.basePath, 'signed_pdfs'),
      path.join(this.basePath, 'archived_pdfs'),
      path.join(this.basePath, 'metadata'),
    ];

    folders.forEach(folder => {
      if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder, { recursive: true });
        console.log(`[PDFManager] Created directory: ${folder}`);
      }
    });
  }

  /**
   * Generate unique invoice ID
   */
  generateInvoiceId() {
    return `INV-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  }

  /**
   * Save regular (unsigned) PDF
   * @param {Buffer} pdfBuffer - PDF file buffer
   * @param {string} invoiceName - Invoice name or ID
   * @returns {Promise<Object>} - File info including path and metadata
   */
  /**
   * Helper to sanitize names for filesystem operations
   */
  sanitizeName(name) {
    if (!name) return 'INV';
    return String(name).replace(/[/\\?%*:|"<>]/g, '-');
  }

  /**
   * Save regular (unsigned) PDF
   * @param {Buffer} pdfBuffer - PDF file buffer
   * @param {string} invoiceName - Invoice name or ID
   * @returns {Promise<Object>} - File info including path and metadata
   */
  async saveRegularPDF(pdfBuffer, invoiceName) {
    try {
      const safeName = this.sanitizeName(invoiceName);
      const fileName = `${safeName}-${Date.now()}.pdf`;
      const filePath = path.join(this.basePath, 'regular_pdfs', fileName);

      fs.writeFileSync(filePath, pdfBuffer);

      const metadata = {
        fileName,
        originalName: invoiceName,
        type: 'regular',
        path: filePath,
        relativePath: `regular_pdfs/${fileName}`,
        fileSize: pdfBuffer.length,
        createdAt: new Date().toISOString(),
        checksum: crypto.createHash('sha256').update(pdfBuffer).digest('hex'),
      };

      this.saveMetadata(invoiceName, metadata);

      console.log(`[PDFManager] Regular PDF saved: ${filePath}`);
      return metadata;
    } catch (error) {
      console.error('[PDFManager] Error saving regular PDF:', error);
      throw error;
    }
  }

  /**
   * Save signed PDF
   * @param {Buffer} pdfBuffer - Signed PDF file buffer
   * @param {string} invoiceName - Invoice name or ID
   * @param {string} signerName - Name of the signer
   * @param {string} signatureReason - Reason for signing
   * @returns {Promise<Object>} - File info including path and metadata
   */
  async saveSignedPDF(pdfBuffer, invoiceName, signerName, signatureReason) {
    try {
      const safeName = this.sanitizeName(invoiceName);
      const fileName = `${safeName}-SIGNED-${Date.now()}.pdf`;
      const filePath = path.join(this.basePath, 'signed_pdfs', fileName);

      fs.writeFileSync(filePath, pdfBuffer);

      const metadata = {
        fileName,
        originalName: invoiceName,
        type: 'signed',
        path: filePath,
        relativePath: `signed_pdfs/${fileName}`,
        fileSize: pdfBuffer.length,
        signerName,
        signatureReason,
        signedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        checksum: crypto.createHash('sha256').update(pdfBuffer).digest('hex'),
      };

      this.saveMetadata(invoiceName, metadata);

      console.log(`[PDFManager] Signed PDF saved: ${filePath}`);
      return metadata;
    } catch (error) {
      console.error('[PDFManager] Error saving signed PDF:', error);
      throw error;
    }
  }

  /**
   * Save PDF metadata for tracking and audit
   * @param {string} invoiceId - Invoice identifier
   * @param {Object} metadata - Metadata object
   */
  saveMetadata(invoiceId, metadata) {
    try {
      const safeId = this.sanitizeName(invoiceId);
      const metadataFile = path.join(this.basePath, 'metadata', `${safeId}-metadata.json`);
      
      // Read existing metadata if available
      let allMetadata = [];
      if (fs.existsSync(metadataFile)) {
        const existing = fs.readFileSync(metadataFile, 'utf8');
        allMetadata = JSON.parse(existing);
      }

      // Add new metadata entry
      allMetadata.push(metadata);

      // Write updated metadata
      fs.writeFileSync(metadataFile, JSON.stringify(allMetadata, null, 2));

      console.log(`[PDFManager] Metadata saved for invoice: ${invoiceId}`);
    } catch (error) {
      console.error('[PDFManager] Error saving metadata:', error);
    }
  }

  /**
   * Retrieve PDF metadata
   * @param {string} invoiceId - Invoice identifier
   * @returns {Object|null} - Metadata object or null if not found
   */
  getMetadata(invoiceId) {
    try {
      const safeId = this.sanitizeName(invoiceId);
      const metadataFile = path.join(this.basePath, 'metadata', `${safeId}-metadata.json`);
      
      if (fs.existsSync(metadataFile)) {
        const metadata = fs.readFileSync(metadataFile, 'utf8');
        return JSON.parse(metadata);
      }
      return null;
    } catch (error) {
      console.error('[PDFManager] Error reading metadata:', error);
      return null;
    }
  }

  /**
   * Archive a signed PDF (move to archived folder)
   * @param {string} fileName - File name to archive
   * @param {string} fromType - Source type (default: 'signed_pdfs')
   */
  archivePDF(fileName, fromType = 'signed_pdfs') {
    try {
      const sourcePath = path.join(this.basePath, fromType, fileName);
      const destPath = path.join(this.basePath, 'archived_pdfs', `${Date.now()}-${fileName}`);

      if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, destPath);
        fs.unlinkSync(sourcePath);
        console.log(`[PDFManager] PDF archived: ${fileName}`);
        return destPath;
      }
      return null;
    } catch (error) {
      console.error('[PDFManager] Error archiving PDF:', error);
      throw error;
    }
  }

  /**
   * Get signed PDFs for an invoice
   * (Original PDFs are stored in database)
   * @param {string} invoiceId - Invoice identifier
   * @returns {Object} - Object containing paths to signed PDFs
   */
  getInvoicePDFs(invoiceId) {
    try {
      const signedPath = path.join(this.basePath, 'signed_pdfs');
      const safeId = this.sanitizeName(invoiceId);

      const files = {
        signed: [],
      };

      // Find signed PDFs
      if (fs.existsSync(signedPath)) {
        const signedFiles = fs.readdirSync(signedPath);
        files.signed = signedFiles
          .filter(f => f.includes(invoiceId) || f.includes(safeId))
          .map(f => ({
            name: f,
            path: path.join(signedPath, f),
            size: fs.statSync(path.join(signedPath, f)).size,
          }));
      }

      return files;
    } catch (error) {
      console.error('[PDFManager] Error retrieving invoice PDFs:', error);
      return { signed: [] };
    }
  }

  /**
   * Get folder statistics (Signed PDFs only)
   * Original PDFs are stored in database
   * @returns {Object} - Statistics about signed PDFs storage
   */
  getStorageStats() {
    try {
      const signedPath = path.join(this.basePath, 'signed_pdfs');
      const archivedPath = path.join(this.basePath, 'archived_pdfs');

      const calculateSize = (folderPath) => {
        if (!fs.existsSync(folderPath)) return 0;
        return fs.readdirSync(folderPath).reduce((total, file) => {
          const filePath = path.join(folderPath, file);
          return total + fs.statSync(filePath).size;
        }, 0);
      };

      return {
        signedSize: calculateSize(signedPath),
        archivedSize: calculateSize(archivedPath),
        signedCount: fs.existsSync(signedPath) ? fs.readdirSync(signedPath).length : 0,
        archivedCount: fs.existsSync(archivedPath) ? fs.readdirSync(archivedPath).length : 0,
      };
    } catch (error) {
      console.error('[PDFManager] Error calculating storage stats:', error);
      return {};
    }
  }

  /**
   * Clean up old PDFs (older than specified days)
   * Signed PDFs only - Original PDFs managed in database
   * @param {number} daysOld - Age threshold in days
   */
  cleanupOldPDFs(daysOld = 30) {
    try {
      const folders = [
        path.join(this.basePath, 'signed_pdfs'),
        path.join(this.basePath, 'archived_pdfs'),
      ];

      const thresholdTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
      let deletedCount = 0;

      folders.forEach(folder => {
        if (fs.existsSync(folder)) {
          fs.readdirSync(folder).forEach(file => {
            const filePath = path.join(folder, file);
            const stats = fs.statSync(filePath);
            if (stats.mtimeMs < thresholdTime) {
              fs.unlinkSync(filePath);
              deletedCount++;
            }
          });
        }
      });

      console.log(`[PDFManager] Cleanup completed: ${deletedCount} files deleted`);
      return deletedCount;
    } catch (error) {
      console.error('[PDFManager] Error during cleanup:', error);
      return 0;
    }
  }
}

module.exports = new PDFManager();
