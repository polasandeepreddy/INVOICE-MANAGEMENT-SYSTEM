const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');

dotenv.config({ path: path.join(__dirname, '.env') });

const googleDrive = require('./utils/googleDrive');

async function syncAllToGoogleDrive() {
    console.log('🚀 Starting synchronization of local manual signed PDFs to Google Drive...\n');

    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME || 'invoice_manager'
    });

    try {
        const [invoices] = await conn.execute(
            `SELECT id, invoice_number, manual_signature_status, manual_signed_file_id, manual_signed_file_name 
             FROM invoices 
             WHERE manual_signed_file_id LIKE 'local-manual-test-%'`
        );

        console.log(`Found ${invoices.length} local manually signed invoice(s) to sync:\n`);

        const manualDir = path.join(__dirname, 'signed_invoices/manually_signed_pdfs');

        for (const inv of invoices) {
            const fileName = inv.manual_signed_file_name || `${inv.invoice_number.replace(/[/\\?%*:|"<>]/g, '_')}_Manually_Signed.pdf`;
            const localFile = path.join(manualDir, fileName);

            if (!fs.existsSync(localFile)) {
                console.warn(`⚠️ Local file not found for invoice ${inv.invoice_number}: ${localFile}`);
                continue;
            }

            console.log(`📤 Uploading invoice ${inv.invoice_number} (${fileName}) to Google Drive...`);
            const pdfBuffer = fs.readFileSync(localFile);

            const uploadRes = await googleDrive.uploadManuallySignedPDF(pdfBuffer, fileName);

            if (uploadRes && uploadRes.fileId && !uploadRes.isLocalTest) {
                console.log(`✅ Uploaded to Google Drive! File ID: ${uploadRes.fileId}, URL: ${uploadRes.webViewLink}`);

                await conn.execute(
                    `UPDATE invoices SET 
                        manual_signed_file_id = ?, 
                        manual_signed_file_url = ?, 
                        manual_signature_status = 'Manually Signed'
                     WHERE id = ?`,
                    [uploadRes.fileId, uploadRes.webViewLink, inv.id]
                );
                console.log(`💾 Updated database record for invoice ${inv.invoice_number}`);
            } else {
                console.warn(`⚠️ Google Drive upload did not return a remote file ID for ${inv.invoice_number}`);
            }
        }

        console.log('\n🎉 Sync finished!');
    } catch (err) {
        console.error('❌ Sync error:', err.message);
    } finally {
        await conn.end();
    }
}

syncAllToGoogleDrive().catch(console.error);
