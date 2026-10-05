const axios = require('axios');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env') });

const BASE_URL = `http://localhost:${process.env.PORT || 5000}`;
const JWT_SECRET = process.env.JWT_SECRET || 'NEW_SUPER_SECRET_KEY';

async function runTests() {
    console.log('🚀 Starting Manual Signature Workflow Integration Tests...\n');

    // 1. Generate Auth Token
    const userPayload = {
        id: 'usr_demo_admin',
        email: 'Demoadmins@gmail.com',
        role: 'admin',
        full_name: 'Demo Admin'
    };
    const token = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '1h' });
    const headers = { Authorization: `Bearer ${token}` };

    console.log('🔑 Auth Token generated for user:', userPayload.email);

    // 2. Fetch existing invoices or create a test invoice
    console.log('\n📄 Step 1: Fetching invoices from backend...');
    let invoiceId = null;
    let invoiceNumber = null;

    try {
        const invoicesRes = await axios.get(`${BASE_URL}/api/invoices`, { headers });
        console.log(`✅ Found ${invoicesRes.data.length} existing invoice(s)`);

        if (invoicesRes.data.length > 0) {
            invoiceId = invoicesRes.data[0].id;
            invoiceNumber = invoicesRes.data[0].invoice_number;
        }
    } catch (err) {
        console.error('❌ Failed to fetch invoices:', err.message);
    }

    if (!invoiceId) {
        console.log('Creating a new test invoice for test execution...');
        const createRes = await axios.post(`${BASE_URL}/api/invoices`, {
            invoice_number: `TEST/MS/${Date.now().toString().slice(-4)}`,
            date: new Date().toISOString().split('T')[0],
            client_name: 'Test Manual Sign Client Ltd',
            client_gst: '36ABCDE1234F1Z5',
            place_of_supply: '36-Telangana',
            items: [{ description: 'Professional Consultancy Fee', hsn: '998399', quantity: 1, price: 15000 }],
            bank_name: 'AXIS BANK LIMITED',
            bank_account_no: '922020060131840',
            bank_ifsc: 'UTIB0000425',
            account_holder: 'JAYARAMA ASSOCIATES'
        }, { headers });

        console.log('Created test invoice:', createRes.data);
        const refetch = await axios.get(`${BASE_URL}/api/invoices`, { headers });
        invoiceId = refetch.data[0].id;
        invoiceNumber = refetch.data[0].invoice_number;
    }

    console.log(`\n🎯 Testing on Invoice: ${invoiceNumber} (ID: ${invoiceId})`);

    // 3. Test Download Unsigned PDF for Manual Signing
    console.log('\n--- Step 2: Test Download Unsigned PDF ---');
    try {
        const unsignedRes = await axios.get(`${BASE_URL}/api/invoices/${invoiceId}/manual-signature/download-unsigned`, {
            headers,
            responseType: 'arraybuffer'
        });

        console.log('Status Code:', unsignedRes.status);
        console.log('Content-Type:', unsignedRes.headers['content-type']);
        console.log('Content-Disposition:', unsignedRes.headers['content-disposition']);
        console.log('PDF Buffer Size:', unsignedRes.data.byteLength, 'bytes');

        if (unsignedRes.status === 200 && unsignedRes.headers['content-type'].includes('application/pdf')) {
            console.log('✅ Unsigned PDF generation and download SUCCESSFUL!');
        } else {
            console.error('❌ Unsigned PDF validation failed');
        }
    } catch (err) {
        console.error('❌ Download unsigned PDF failed:', err.response?.data ? String(err.response.data) : err.message);
    }

    // 4. Test Upload Manually Signed PDF
    console.log('\n--- Step 3: Test Upload Manually Signed PDF ---');
    try {
        const mockPdfContent = `%PDF-1.4\n1 0 obj\n<< /Title (Test Manually Signed PDF) /Author (Test User) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF`;
        const mockPdfBuffer = Buffer.from(mockPdfContent);

        const form = new FormData();
        form.append('signed_pdf', mockPdfBuffer, {
            filename: `${invoiceNumber.replace(/[/\\?%*:|"<>]/g, '_')}_Manually_Signed.pdf`,
            contentType: 'application/pdf'
        });

        const uploadRes = await axios.post(
            `${BASE_URL}/api/invoices/${invoiceId}/manual-signature/upload`,
            form,
            {
                headers: {
                    ...headers,
                    ...form.getHeaders()
                }
            }
        );

        console.log('Upload Response:', uploadRes.data);
        if (uploadRes.data.success && uploadRes.data.manual_signature_status === 'Manually Signed') {
            console.log('✅ Upload Manually Signed PDF SUCCESSFUL!');
        } else {
            console.error('❌ Upload verification failed');
        }
    } catch (err) {
        console.error('❌ Upload manually signed PDF failed:', err.response?.data || err.message);
    }

    // 5. Test Database Retrieval for Manual Signature Fields
    console.log('\n--- Step 4: Test Database Persistence & Single Invoice Retrieval ---');
    try {
        const getRes = await axios.get(`${BASE_URL}/api/invoices/${invoiceId}`, { headers });
        const inv = getRes.data;

        console.log('Manual Signature Status:', inv.manual_signature_status);
        console.log('Manual Signed File ID:', inv.manual_signed_file_id);
        console.log('Manual Signed File Name:', inv.manual_signed_file_name);
        console.log('Manual Signed Uploaded At:', inv.manual_signed_uploaded_at);

        if (inv.manual_signature_status === 'Manually Signed' && inv.manual_signed_file_id) {
            console.log('✅ Database persistence for Manual Signature fields SUCCESSFUL!');
        } else {
            console.error('❌ Database fields verification failed');
        }
    } catch (err) {
        console.error('❌ Fetch invoice details failed:', err.response?.data || err.message);
    }

    // 6. Test Stream/View Manually Signed PDF
    console.log('\n--- Step 5: Test View Manually Signed PDF Stream ---');
    try {
        const viewRes = await axios.get(`${BASE_URL}/api/invoices/${invoiceId}/manual-signature/view`, {
            headers,
            responseType: 'arraybuffer'
        });

        console.log('Status Code:', viewRes.status);
        console.log('Content-Type:', viewRes.headers['content-type']);
        console.log('Content-Disposition:', viewRes.headers['content-disposition']);
        console.log('Streamed Bytes:', viewRes.data.byteLength);

        if (viewRes.status === 200 && viewRes.headers['content-type'].includes('application/pdf')) {
            console.log('✅ View Manually Signed PDF stream SUCCESSFUL!');
        }
    } catch (err) {
        console.error('❌ View PDF stream failed:', err.response?.data || err.message);
    }

    // 7. Test Download Manually Signed PDF
    console.log('\n--- Step 6: Test Download Manually Signed PDF Stream ---');
    try {
        const dlRes = await axios.get(`${BASE_URL}/api/invoices/${invoiceId}/manual-signature/download`, {
            headers,
            responseType: 'arraybuffer'
        });

        console.log('Status Code:', dlRes.status);
        console.log('Content-Type:', dlRes.headers['content-type']);
        console.log('Content-Disposition:', dlRes.headers['content-disposition']);

        if (dlRes.status === 200 && dlRes.headers['content-disposition'].includes('attachment')) {
            console.log('✅ Download Manually Signed PDF stream SUCCESSFUL!');
        }
    } catch (err) {
        console.error('❌ Download PDF stream failed:', err.response?.data || err.message);
    }

    // 8. Test Replace Manually Signed PDF
    console.log('\n--- Step 7: Test Replace Manually Signed PDF ---');
    try {
        const replacementPdf = Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Title (Replaced Signed PDF) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF`);
        const form = new FormData();
        form.append('signed_pdf', replacementPdf, {
            filename: `${invoiceNumber.replace(/[/\\?%*:|"<>]/g, '_')}_Manually_Signed_v2.pdf`,
            contentType: 'application/pdf'
        });

        const replaceRes = await axios.post(
            `${BASE_URL}/api/invoices/${invoiceId}/manual-signature/replace`,
            form,
            {
                headers: {
                    ...headers,
                    ...form.getHeaders()
                }
            }
        );

        console.log('Replace Response:', replaceRes.data);
        if (replaceRes.data.success && replaceRes.data.manual_signature_status === 'Manually Signed') {
            console.log('✅ Replace Manually Signed PDF SUCCESSFUL!');
        }
    } catch (err) {
        console.error('❌ Replace PDF failed:', err.response?.data || err.message);
    }

    console.log('\n🎉 All Manual Signature Workflow Tests Completed!');
}

runTests().catch(console.error);
