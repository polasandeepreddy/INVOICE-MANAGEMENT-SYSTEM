// routes/invoices.js or similar
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const ExcelJS = require('exceljs');

// Upload and import invoices from Excel
router.post('/invoices/import-excel', upload.single('file'), async (req, res) => {
  try {
    // Verify Super Admin access
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Super Admin access required' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const worksheet = workbook.getWorksheet(1);
    
    const importedInvoices = [];
    const errors = [];
    
    // Get headers (assuming row 2 has headers)
    const headers = [];
    const headerRow = worksheet.getRow(2);
    headerRow.eachCell((cell, colNumber) => {
      headers[colNumber] = cell.value;
    });

    // Process data rows (starting from row 3)
    for (let rowNumber = 3; rowNumber <= worksheet.rowCount; rowNumber++) {
      const row = worksheet.getRow(rowNumber);
      const invoiceNumber = row.getCell(3).value; // Assuming column 3 is Invoice No.
      
      if (!invoiceNumber) {
        errors.push(`Row ${rowNumber}: Missing invoice number, skipped`);
        continue;
      }

      // Check if invoice already exists
      const existingInvoice = await db.query(
        'SELECT id FROM invoices WHERE invoice_number = $1',
        [invoiceNumber.toString()]
      );

      if (existingInvoice.rows.length > 0) {
        errors.push(`Row ${rowNumber}: Invoice ${invoiceNumber} already exists, skipped`);
        continue;
      }

      // Parse date from Excel
      let invoiceDate = row.getCell(2).value;
      let formattedDate = null;
      
      if (invoiceDate) {
        if (invoiceDate instanceof Date) {
          formattedDate = invoiceDate.toISOString().split('T')[0];
        } else {
          // Try to parse date string
          const dateStr = invoiceDate.toString();
          const dateParts = dateStr.split('-');
          if (dateParts.length === 3) {
            formattedDate = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
          } else {
            formattedDate = new Date(dateStr).toISOString().split('T')[0];
          }
        }
      }

      // Parse amounts
      const baseAmount = parseFloat(row.getCell(8).value) || 0;
      const sgst = parseFloat(row.getCell(9).value) || 0;
      const cgst = parseFloat(row.getCell(10).value) || 0;
      const igst = parseFloat(row.getCell(11).value) || 0;
      const totalAmount = parseFloat(row.getCell(12).value) || baseAmount + sgst + cgst + igst;
      
      // Get payment status
      let paymentStatus = 'unpaid';
      const statusText = (row.getCell(14).value || '').toString().toLowerCase();
      if (statusText === 'paid') paymentStatus = 'paid';
      else if (statusText === 'cancelled') paymentStatus = 'cancelled';

      // Insert invoice
      const result = await db.query(
        `INSERT INTO invoices (
          invoice_number, date, bank_name, description, client_gst, 
          base_amount, sgst, cgst, igst, total_amount, payment_status, 
          remarks, user_id, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
        RETURNING *`,
        [
          invoiceNumber.toString(),
          formattedDate,
          row.getCell(4).value || '',
          row.getCell(5).value || '',
          row.getCell(7).value || '',
          baseAmount,
          sgst,
          cgst,
          igst,
          totalAmount,
          paymentStatus,
          row.getCell(15).value || '',
          req.user.id
        ]
      );

      importedInvoices.push({
        invoice_number: invoiceNumber,
        row: rowNumber,
        id: result.rows[0].id
      });
    }

    res.json({
      success: true,
      message: `Imported ${importedInvoices.length} invoices successfully`,
      imported: importedInvoices,
      errors: errors,
      totalProcessed: worksheet.rowCount - 2,
      totalImported: importedInvoices.length
    });

  } catch (error) {
    console.error('Excel import error:', error);
    res.status(500).json({ error: 'Failed to import Excel file: ' + error.message });
  }
});