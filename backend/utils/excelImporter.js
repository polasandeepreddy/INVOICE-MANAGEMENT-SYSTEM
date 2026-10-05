const ExcelJS = require('exceljs');

class ExcelImporter {
    constructor(promiseDb, userId, userName) {
        this.promiseDb = promiseDb;
        this.userId = userId;
        this.userName = userName;
        this.importedInvoices = [];
        this.errors = [];
        this.warnings = [];
    }

    getCellValue(cell) {
        if (!cell || cell.value === undefined || cell.value === null) {
            return null;
        }
        const value = cell.value;
        if (typeof value === 'object') {
            if (value.result !== undefined) return value.result;
            if (value.text !== undefined) return value.text;
            if (value.richText) return value.richText.map(rt => rt.text).join('');
            if (value.error) return null;
        }
        return value;
    }

    // Extract invoice number numeric value for sorting
    getInvoiceNumberValue(invoiceNumber) {
        if (!invoiceNumber) return 0;
        // Extract numbers from patterns like JA/26-27/127 -> 127
        const match = invoiceNumber.match(/\/(\d+)$/);
        if (match) {
            return parseInt(match[1]);
        }
        // If no match, try to extract any numbers
        const numMatch = invoiceNumber.match(/(\d+)/);
        if (numMatch) {
            return parseInt(numMatch[1]);
        }
        return 0;
    }

    // Improved numeric value extraction with better error handling
    getNumericValue(cell, fieldName = 'amount', rowNumber = 0) {
        const value = this.getCellValue(cell);
        
        if (value === null || value === undefined || value === '') {
            return 0;
        }
        
        // If it's already a number
        if (typeof value === 'number') {
            return Math.round(value * 100) / 100;
        }
        
        // If it's a string
        if (typeof value === 'string') {
            // Remove currency symbols (₹, $), commas, spaces, and extra characters
            let cleaned = value.replace(/[₹$,]/g, '').replace(/\s/g, '').replace(/[^\d.-]/g, '');
            
            // Handle negative numbers in parentheses
            if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
                cleaned = '-' + cleaned.slice(1, -1);
            }
            
            const num = parseFloat(cleaned);
            const result = isNaN(num) ? 0 : Math.round(num * 100) / 100;
            return result;
        }
        
        return 0;
    }

    getDateValue(cell, rowNumber) {
        const value = this.getCellValue(cell);
        const formatYMD = (d) => {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        };

        if (!value) {
            this.warnings.push(`Row ${rowNumber}: Missing date, using today's date`);
            return formatYMD(new Date());
        }
        if (typeof value === 'number') {
            const dateObj = new Date(Math.round((value - 25569) * 86400 * 1000));
            const y = dateObj.getUTCFullYear();
            const m = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
            const day = String(dateObj.getUTCDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        }
        if (value instanceof Date) {
            return formatYMD(value);
        }
        if (typeof value === 'string') {
            const dateStr = value.trim();
            const months = {
                'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04', 'may': '05', 'jun': '06',
                'jul': '07', 'aug': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
            };
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                return dateStr;
            }
            const pattern1 = dateStr.match(/(\d{1,2})[-\s\/]+([A-Za-z]+)[-\s\/]+(\d{2,4})/i);
            if (pattern1) {
                const day = pattern1[1].padStart(2, '0');
                const month = months[pattern1[2].substring(0, 3).toLowerCase()] || '01';
                let year = pattern1[3];
                if (year.length === 2) year = '20' + year;
                return `${year}-${month}-${day}`;
            }
            const pattern2 = dateStr.match(/(\d{1,2})[-\/\.](\d{1,2})[-\/\.](\d{2,4})/);
            if (pattern2) {
                const day = pattern2[1].padStart(2, '0');
                const month = pattern2[2].padStart(2, '0');
                let year = pattern2[3];
                if (year.length === 2) year = '20' + year;
                return `${year}-${month}-${day}`;
            }
        }
        this.warnings.push(`Row ${rowNumber}: Could not parse date "${value}", using today's date`);
        return formatYMD(new Date());
    }

    getStringValue(cell, defaultValue = '') {
        const value = this.getCellValue(cell);
        if (!value || value === '—' || value === '-' || value === 'NULL') return defaultValue;
        return String(value).trim();
    }

    getPaymentStatus(cell) {
        const value = this.getCellValue(cell);
        if (!value) return 'unpaid';
        const status = String(value).toLowerCase().trim();
        if (status === 'paid') return 'paid';
        if (status === 'cancelled' || status === 'canceled') return 'cancelled';
        return 'unpaid';
    }

    async importFromWorksheet(worksheet) {
        console.log('📊 Starting Excel import...');
        
        // Get headers from row 2
        const headerRow = worksheet.getRow(2);
        const headers = {};
        headerRow.eachCell((cell, colNumber) => {
            let headerText = this.getStringValue(cell);
            if (headerText) {
                headers[headerText.toLowerCase()] = colNumber;
            }
        });
        
        console.log('📋 Detected headers:', Object.keys(headers));
        
        // Define column mapping with fallback to fixed positions
        const columnMap = {
            date: this.findColumn(headers, ['date', 'invoice date']) || 2,
            invoiceNo: this.findColumn(headers, ['invoice no.', 'invoice no', 'invoice number', 'invoiceno']) || 3,
            bankName: this.findColumn(headers, ['bank name', 'bank']) || 4,
            customerName: this.findColumn(headers, ['customer name', 'customer', 'client name', 'description']) || 5,
            branch: this.findColumn(headers, ['branch', 'client branch']) || 6,
            gstin: this.findColumn(headers, ['gsti no.', 'gstin', 'gst no.', 'gst']) || 7,
            baseAmount: this.findColumn(headers, ['base amount', 'base', 'taxable amount', 'taxable value', 'basic amount', 'amount', 'price', 'unit price', 'rate']) || 8,
            sgst: this.findColumn(headers, ['sgst']) || 9,
            cgst: this.findColumn(headers, ['cgst']) || 10,
            igst: this.findColumn(headers, ['igst']) || 11,
            totalAmount: this.findColumn(headers, ['total amount', 'total', 'grand total', 'invoice amount', 'net amount', 'invoice value']) || 12,
            paymentStatus: this.findColumn(headers, ['payment status', 'payment', 'status']) || 14,
            remarks: this.findColumn(headers, ['remarks', 'remark', 'notes']) || 15
        };
        
        console.log('🔍 Final Column mapping:', columnMap);
        
        let processedCount = 0;
        let skippedCount = 0;
        
        // Collect all invoices to import
        const invoicesToImport = [];
        
        for (let rowNumber = 3; rowNumber <= worksheet.rowCount; rowNumber++) {
            try {
                const row = worksheet.getRow(rowNumber);
                
                // Check if row is empty
                let isEmpty = true;
                for (let i = 1; i <= 15; i++) {
                    const cellValue = this.getCellValue(row.getCell(i));
                    if (cellValue && cellValue !== '—' && cellValue !== '-') {
                        isEmpty = false;
                        break;
                    }
                }
                if (isEmpty) continue;
                
                const invoiceNumber = this.getStringValue(row.getCell(columnMap.invoiceNo));
                if (!invoiceNumber) {
                    this.errors.push(`Row ${rowNumber}: Missing invoice number`);
                    skippedCount++;
                    continue;
                }
                
                // Check for duplicate invoice
                const [existing] = await this.promiseDb.execute(
                    'SELECT id FROM invoices WHERE invoice_number = ?',
                    [invoiceNumber]
                );
                if (existing.length > 0) {
                    this.errors.push(`Row ${rowNumber}: Invoice ${invoiceNumber} already exists`);
                    skippedCount++;
                    continue;
                }
                
                // Parse amounts - use getNumericValue for reliable parsing across formulas and strings
                const baseAmountCell = row.getCell(columnMap.baseAmount);
                const sgstCell = row.getCell(columnMap.sgst);
                const cgstCell = row.getCell(columnMap.cgst);
                const igstCell = row.getCell(columnMap.igst);
                const totalAmountCell = row.getCell(columnMap.totalAmount);
                
                let baseAmount = this.getNumericValue(baseAmountCell, 'baseAmount', rowNumber);
                let sgst = this.getNumericValue(sgstCell, 'sgst', rowNumber);
                let cgst = this.getNumericValue(cgstCell, 'cgst', rowNumber);
                let igst = this.getNumericValue(igstCell, 'igst', rowNumber);
                let totalAmount = this.getNumericValue(totalAmountCell, 'totalAmount', rowNumber);
                
                // If baseAmount is missing/0 but totalAmount is present, back-calculate baseAmount
                if (baseAmount === 0 && totalAmount > 0) {
                    if (sgst > 0 || cgst > 0 || igst > 0) {
                        baseAmount = Math.round((totalAmount - (sgst + cgst + igst)) * 100) / 100;
                    } else {
                        baseAmount = Math.round((totalAmount / 1.18) * 100) / 100;
                        sgst = Math.round((baseAmount * 0.09) * 100) / 100;
                        cgst = Math.round((baseAmount * 0.09) * 100) / 100;
                    }
                    this.warnings.push(`Row ${rowNumber}: Calculated base amount = ${baseAmount}`);
                }
                
                // Calculate total if not present
                if (totalAmount === 0 && baseAmount > 0) {
                    if (sgst === 0 && cgst === 0 && igst === 0) {
                        sgst = Math.round((baseAmount * 0.09) * 100) / 100;
                        cgst = Math.round((baseAmount * 0.09) * 100) / 100;
                    }
                    totalAmount = Math.round((baseAmount + sgst + cgst + igst) * 100) / 100;
                    this.warnings.push(`Row ${rowNumber}: Auto-calculated total amount = ${totalAmount}`);
                }
                
                console.log(`Row ${rowNumber} - ${invoiceNumber}: Base=${baseAmount}, SGST=${sgst}, CGST=${cgst}, IGST=${igst}, Total=${totalAmount}`);
                
                const date = this.getDateValue(row.getCell(columnMap.date), rowNumber);
                const bankName = this.getStringValue(row.getCell(columnMap.bankName), 'AXIS BANK LIMITED');
                const description = this.getStringValue(row.getCell(columnMap.customerName));
                const clientGst = this.getStringValue(row.getCell(columnMap.gstin));
                const clientBranch = this.getStringValue(row.getCell(columnMap.branch));
                const paymentStatus = this.getPaymentStatus(row.getCell(columnMap.paymentStatus));
                const remarks = this.getStringValue(row.getCell(columnMap.remarks));
                
                // Store invoice data
                invoicesToImport.push({
                    rowNumber,
                    invoiceNumber,
                    date,
                    bankName,
                    description,
                    clientGst,
                    clientBranch,
                    baseAmount,
                    sgst,
                    cgst,
                    igst,
                    totalAmount,
                    paymentStatus,
                    remarks,
                    invoiceNumberValue: this.getInvoiceNumberValue(invoiceNumber)
                });
                
            } catch (rowError) {
                console.error(`❌ Row ${rowNumber} error:`, rowError);
                this.errors.push(`Row ${rowNumber}: ${rowError.message}`);
                skippedCount++;
            }
        }
        
        // Sort invoices by invoice number DESCENDING (highest number first)
        invoicesToImport.sort((a, b) => b.invoiceNumberValue - a.invoiceNumberValue);
        
        console.log(`\n📊 Sorted ${invoicesToImport.length} invoices by invoice number (highest first)`);
        
        // Insert sorted invoices
        for (const inv of invoicesToImport) {
            try {
                const invoiceId = `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${inv.rowNumber}`;
                const itemPrice = inv.baseAmount > 0 ? inv.baseAmount : (inv.totalAmount ? Math.round((inv.totalAmount / 1.18) * 100) / 100 : 0);
                const itemsJSON = JSON.stringify([{
                    description: inv.description || 'PROFESSIONAL FEE FOR SERVICES RENDERED',
                    hsn: '998399',
                    quantity: 1,
                    price: itemPrice
                }]);
                const clientName = inv.description || 'Customer';
                const placeOfSupply = '36-Telangana';
                
                await this.promiseDb.execute(
                    `INSERT INTO invoices (
                        id, user_id, created_by_name, invoice_number, date,
                        bank_name, client_name, description, client_gst, client_branch, place_of_supply,
                        base_amount, sgst, cgst, igst, total_amount,
                        tds_amount, net_amount, received, pending_amount,
                        payment_status, approval_status, remarks, items,
                        created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
                    [
                        invoiceId, this.userId, this.userName, inv.invoiceNumber, inv.date,
                        inv.bankName, clientName, inv.description, inv.clientGst, inv.clientBranch, placeOfSupply,
                        inv.baseAmount, inv.sgst, inv.cgst, inv.igst, inv.totalAmount,
                        0, inv.totalAmount, 0, inv.totalAmount,
                        inv.paymentStatus, 'created', inv.remarks, itemsJSON
                    ]
                );
                
                this.importedInvoices.push({ 
                    invoice_number: inv.invoiceNumber, 
                    row: inv.rowNumber, 
                    total_amount: inv.totalAmount,
                    date: inv.date
                });
                processedCount++;
                console.log(`✅ Imported ${inv.invoiceNumber} - Amount: ₹${inv.totalAmount.toLocaleString('en-IN')}`);
                
            } catch (dbError) {
                console.error(`❌ DB error for ${inv.invoiceNumber}:`, dbError);
                this.errors.push(`Row ${inv.rowNumber}: ${dbError.message}`);
            }
        }
        
        console.log(`\n📊 Import Summary:`);
        console.log(`   ✅ Imported: ${processedCount} invoices`);
        console.log(`   ⚠️ Skipped: ${skippedCount} rows`);
        console.log(`   ❌ Errors: ${this.errors.length}`);
        console.log(`   ⚡ Warnings: ${this.warnings.length}`);
        
        return {
            success: true,
            imported: this.importedInvoices,
            errors: this.errors,
            warnings: this.warnings,
            totalImported: processedCount,
            totalErrors: this.errors.length,
            totalWarnings: this.warnings.length
        };
    }
    
    findColumn(headers, possibleNames) {
        for (const name of possibleNames) {
            const lowerName = name.toLowerCase();
            for (const [header, colNum] of Object.entries(headers)) {
                if (header === lowerName || header.includes(lowerName) || lowerName.includes(header)) {
                    return colNum;
                }
            }
        }
        return null;
    }
}

module.exports = ExcelImporter;