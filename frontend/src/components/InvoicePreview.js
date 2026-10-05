import React, { useRef, useState, useEffect, useImperativeHandle } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import LoadingScreen from './LoadingScreen';

const InvoicePreview = React.forwardRef(({ formData, hideActions = false }, ref) => {
    const invoiceRef = useRef(null);
    const previewContainerRef = useRef(null);

    useImperativeHandle(ref, () => invoiceRef.current);
    const [zoomLevel, setZoomLevel] = useState(1);
    const [isExportReady, setIsExportReady] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    
    // Panning state
    const [isPanning, setIsPanning] = useState(false);
    const [panStart, setPanStart] = useState({ x: 0, y: 0 });
    const [scrollPosition, setScrollPosition] = useState({ left: 0, top: 0 });

    const COMPANY_LOGO_URL = "/JAYARAMA LOGO1.png";
    
    const FALLBACK_LOGO = `data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNzAiIGhlaWdodD0iNzAiIHZpZXdCb3g9IjAgMCAxMDAgMTAwIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxwYXRoIGQ9Ik01MCA1IEw5NSA4NSBMNSA4NSBaIiBmaWxsPSJub25lIiBzdHJva2U9IiMwMDcyYmMiIHN0cm9rZVdpZHRoPSI0Ii8+PHBhdGggZD0iTTUwIDI1IEw3NSA3NSBMMjUgNzUgWiIgZmlsbD0iI2VkMWMyNCIgb3BhY2l0eT0iMC44Ii8+PHJlY3QgeD0iNDAiIHk9IjU1IiB3aWR0aD0iNSIgaGVpZ2h0PSIxNSIgZmlsbD0id2hpdGUiLz48cmVjdCB4PSI1MCIgeT0iNTAiIHdpZHRoPSI1IiBoZWlnaHQ9IjIwIiBmaWxsPSJ3aGl0ZSIvPjxyZWN0IHg9IjU1IiB5PSI2MCIgd2lkdGg9IjUiIGhlaWdodD0iMTAiIGZpbGw9IndoaXRlIi8+PC9zdmc+`;

    const COMPLETE_BUSINESS_ADDRESS = `Plot No: 12, Road No: 1A, Czech Colony,
Sanath Nagar, Hyderabad - 500018
Phone No. : 9866669777
Email : jayaramassociates@yahoo.com
PAN : AMIPM2958D
GSTIN : 36AMIPM2958D1ZY
State: 36-Telangana`;

    const getStateCode = (stateString) => {
        if (!stateString) return '';
        const match = stateString.match(/^(\d+)/);
        return match ? match[1] : '';
    };

    const isSameState = () => {
        const clientStateCode = getStateCode(formData.client_state);
        const placeOfSupplyCode = getStateCode(formData.place_of_supply);
        
        if (!clientStateCode || !placeOfSupplyCode) return true;
        
        return clientStateCode === placeOfSupplyCode;
    };

    const parseNum = (val) => {
        if (val === undefined || val === null || val === '') return 0;
        if (typeof val === 'number') return isNaN(val) ? 0 : val;
        const clean = String(val).replace(/[^0-9.-]+/g, '');
        const num = parseFloat(clean);
        return isNaN(num) ? 0 : num;
    };

    const formatINR = (val) => {
        const num = parseNum(val);
        return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const getEffectiveBase = () => {
        const dbBase = parseNum(formData.base_amount);
        const dbTotal = parseNum(formData.total_amount);
        const dbSgst = parseNum(formData.sgst);
        const dbCgst = parseNum(formData.cgst);
        const dbIgst = parseNum(formData.igst);
        if (dbBase > 0) return dbBase;
        if (dbTotal > 0) return (dbSgst || dbCgst || dbIgst) ? dbTotal - (dbSgst + dbCgst + dbIgst) : dbTotal / 1.18;
        return 0;
    };

    const getItemPrice = (item) => {
        const price = parseNum(item.price);
        if (price > 0) return price;
        const qty = item.quantity !== undefined && item.quantity !== null && item.quantity !== '' ? parseNum(item.quantity) : 1;
        const effBase = getEffectiveBase();
        return effBase > 0 ? effBase / qty : 0;
    };

    const calculateTotals = () => {
        const items = formData.items || [];
        const effBase = getEffectiveBase();
        let subtotal = items.reduce((sum, item) => {
            const qty = item.quantity !== undefined && item.quantity !== null && item.quantity !== '' ? parseNum(item.quantity) : 1;
            const price = getItemPrice(item);
            return sum + (qty * price);
        }, 0);

        if (subtotal === 0 && effBase > 0) {
            subtotal = effBase;
        }
        
        const sameState = isSameState();
        
        let sgst = 0;
        let cgst = 0;
        let igst = 0;
        
        if (sameState) {
            sgst = subtotal * 0.09;
            cgst = subtotal * 0.09;
        } else {
            igst = subtotal * 0.18;
        }
        
        const total = subtotal + sgst + cgst + igst;
        const balance = total - parseNum(formData.received);
        
        return { subtotal, sgst, cgst, igst, total, balance, sameState };
    };

    const totals = calculateTotals();

    // Single source of truth for the signature block (mirrors backend/server.js and
    // generateSignedPDF.js). "Authorized Signatory" must always anchor to this same
    // flag so the CloudSigner signature and the signatory line move together.
    const hasSignature = !!(
        (formData.signature_data && formData.signature_data !== 'CloudSigner_Digital_Signature') ||
        (formData.cloud_signer_signature_url && formData.cloud_signer_signature_url !== 'null' && formData.cloud_signer_signature_url !== '')
    );
    const signatureSrc = hasSignature ? (formData.cloud_signer_signature_url || formData.signature_data) : '';

    useEffect(() => {
        const checkExportReadiness = () => {
            const hasBusinessName = formData.business_name && formData.business_name.trim();
            const hasInvoiceNumber = formData.invoice_number && formData.invoice_number.trim();
            const hasDate = !!formData.date;
            const hasClientName = formData.client_name && formData.client_name.trim();
            const hasClientAddress = formData.client_address && formData.client_address.trim();
            const hasClientState = formData.client_state && formData.client_state.trim();
            const hasPlaceOfSupply = formData.place_of_supply && formData.place_of_supply.trim();
            const hasItems = (formData.items || []).length > 0;
            const hasDescription = formData.description && formData.description.trim();
            
            const hasBankName = formData.bank_name && formData.bank_name.trim();
            const hasBankAccount = formData.bank_account_no && formData.bank_account_no.trim();
            const hasBankIfsc = formData.bank_ifsc && formData.bank_ifsc.trim();
            const hasAccountHolder = formData.account_holder && formData.account_holder.trim();
            
            const bankDetailsValid = (!hasBankName && !hasBankAccount && !hasBankIfsc && !hasAccountHolder) ||
                (hasBankName && hasBankAccount && hasBankIfsc && hasAccountHolder);
            
            const isReady = hasBusinessName && hasInvoiceNumber && hasDate && 
                           hasClientName && hasClientAddress && hasClientState && 
                           hasPlaceOfSupply && hasItems && hasDescription && bankDetailsValid;
            
            setIsExportReady(isReady);
        };
        
        checkExportReadiness();
    }, [formData]);

    // Handle zoom with mouse wheel - centered on mouse position
    const handleWheel = (e) => {
        if (!previewContainerRef.current) return;
        
        e.preventDefault();
        
        const container = previewContainerRef.current;
        const rect = container.getBoundingClientRect();
        
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        const scrollLeft = container.scrollLeft;
        const scrollTop = container.scrollTop;
        
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        const newZoom = Math.min(Math.max(zoomLevel + delta, 0.5), 2.5);
        
        const contentX = (mouseX + scrollLeft) / zoomLevel;
        const contentY = (mouseY + scrollTop) / zoomLevel;
        
        setZoomLevel(newZoom);
        
        setTimeout(() => {
            if (container) {
                const newScrollLeft = contentX * newZoom - mouseX;
                const newScrollTop = contentY * newZoom - mouseY;
                
                container.scrollLeft = newScrollLeft;
                container.scrollTop = newScrollTop;
            }
        }, 0);
    };

    const handleMouseDown = (e) => {
        if (e.button !== 0) return;
        
        setIsPanning(true);
        setPanStart({
            x: e.clientX,
            y: e.clientY
        });
        
        if (previewContainerRef.current) {
            setScrollPosition({
                left: previewContainerRef.current.scrollLeft,
                top: previewContainerRef.current.scrollTop
            });
            previewContainerRef.current.style.cursor = 'grabbing';
        }
        
        e.preventDefault();
    };

    const handleMouseMove = (e) => {
        if (!isPanning || !previewContainerRef.current) return;
        
        const dx = e.clientX - panStart.x;
        const dy = e.clientY - panStart.y;
        
        previewContainerRef.current.scrollLeft = scrollPosition.left - dx;
        previewContainerRef.current.scrollTop = scrollPosition.top - dy;
    };

    const handleMouseUp = () => {
        setIsPanning(false);
        if (previewContainerRef.current) {
            previewContainerRef.current.style.cursor = 'grab';
        }
    };

    const handleMouseLeave = () => {
        setIsPanning(false);
        if (previewContainerRef.current) {
            previewContainerRef.current.style.cursor = 'grab';
        }
    };

    const getZoomWrapperStyle = () => ({
        transform: `scale(${zoomLevel})`,
        transformOrigin: '0 0',
        transition: 'transform 0.05s ease-out',
        willChange: 'transform'
    });

    const numberToWords = (num) => {
        const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
        const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
        
        const convert = (n) => {
            if (n === 0) return '';
            if (n < 20) return a[n];
            if (n < 100) return b[Math.floor(n / 10)] + (n % 10 ? ' ' + a[n % 10] : '');
            if (n < 1000) return a[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' and ' + convert(n % 100) : '');
            if (n < 100000) {
                const thousands = Math.floor(n / 1000);
                const remainder = n % 1000;
                const thousandsWord = thousands === 1 ? 'Thousand' : 'Thousand';
                return convert(thousands) + ' ' + thousandsWord + (remainder ? ' ' + convert(remainder) : '');
            }
            if (n < 10000000) {
                const lakhs = Math.floor(n / 100000);
                const remainder = n % 100000;
                const lakhsWord = lakhs === 1 ? 'Lakh' : 'Lakhs';
                return convert(lakhs) + ' ' + lakhsWord + (remainder ? ' ' + convert(remainder) : '');
            }
            if (n < 1000000000) {
                const crores = Math.floor(n / 10000000);
                const remainder = n % 10000000;
                const croresWord = crores === 1 ? 'Crore' : 'Crores';
                return convert(crores) + ' ' + croresWord + (remainder ? ' ' + convert(remainder) : '');
            }
            return 'Large Amount';
        };
        
        const validNum = parseNum(num);
        if (!validNum || validNum <= 0) return 'Zero Rupees only';
        
        const rupees = Math.floor(validNum);
        const paise = Math.round((validNum - rupees) * 100);
        
        let words = convert(rupees) + ' Rupees';
        
        if (paise > 0) {
            const paiseWord = paise === 1 ? 'Paise' : 'Paise';
            words += ' and ' + convert(paise) + ' ' + paiseWord;
        }
        
        return words + ' only';
    };

    const getBusinessAddress = () => {
        if (!formData.business_address) {
            return COMPLETE_BUSINESS_ADDRESS;
        }
        if (formData.business_address.includes('PAN')) {
            return formData.business_address;
        }
        return COMPLETE_BUSINESS_ADDRESS;
    };

    const downloadPDF = async () => {
        const element = invoiceRef.current;
        
        if (!element || !isExportReady) {
            console.error('Invoice element not found or not ready');
            return;
        }

        setIsExporting(true);

        try {
            const originalOverflow = element.style.overflow;
            const originalHeight = element.style.height;
            element.style.overflow = 'visible';
            element.style.height = 'auto';
            
            const canvas = await html2canvas(element, {
                scale: 3,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff',
                allowTaint: false,
                foreignObjectRendering: false,
                onclone: (clonedDoc) => {
                    const clonedInvoice = clonedDoc.querySelector('.invoice-doc');
                    if (clonedInvoice) {
                        clonedInvoice.style.padding = '1.5cm';
                        clonedInvoice.style.backgroundColor = '#ffffff';
                    }
                }
            });
            
            element.style.overflow = originalOverflow;
            element.style.height = originalHeight;
            
            const imgWidth = 210;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            
            const pdf = new jsPDF({
                unit: 'mm',
                format: 'a4',
                orientation: 'portrait'
            });
            
            const imgData = canvas.toDataURL('image/jpeg', 1.0);
            pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight);
            pdf.save(`Invoice_${formData.invoice_number || 'JA'}_${formData.date || new Date().toISOString().split('T')[0]}.pdf`);
            
        } catch (error) {
            console.error('PDF Generation Error:', error);
            alert('Error generating PDF. Please try again.');
        } finally {
            setIsExporting(false);
        }
    };

    const getPrintHTML = () => {
        const formatCurrency = (value) => {
            return `₹ ${formatINR(value)}`;
        };

        const itemsTableRows = (formData.items || []).map((item, index) => {
            const qty = item.quantity !== undefined && item.quantity !== null && item.quantity !== '' ? parseNum(item.quantity) : 1;
            const price = getItemPrice(item);
            const amount = qty * price;
            return `
            <tr>
                <td class="c" style="text-align: center; padding: 8px; font-family: 'Times New Roman', Times, serif; font-size: 12px; border: 1px solid #ddd; color: #000000;">${index + 1}.</td>
                <td style="padding: 8px; font-family: 'Times New Roman', Times, serif; font-size: 12px; border: 1px solid #ddd; color: #000000;">${item.description || 'PROFESSIONAL FEE'}</td>
                <td style="text-align: center; padding: 8px; font-family: 'Times New Roman', Times, serif; font-size: 12px; border: 1px solid #ddd; color: #000000;">${item.hsn || '998399'}</td>
                <td class="c" style="text-align: center; padding: 8px; font-family: 'Times New Roman', Times, serif; font-size: 12px; border: 1px solid #ddd; color: #000000;">${qty}</td>
                <td class="r" style="text-align: right; padding: 8px; font-family: 'Times New Roman', Times, serif; font-size: 12px; border: 1px solid #ddd; color: #000000;">${formatCurrency(price)}</td>
                <td class="r" style="text-align: right; padding: 8px; font-family: 'Times New Roman', Times, serif; font-size: 12px; border: 1px solid #ddd; color: #000000;">${formatCurrency(amount)}</td>
            </tr>
        `;
        }).join('');

        const noItemsRow = (formData.items || []).length === 0 ? `
            <tr>
                <td colspan="6" style="text-align: center; padding: 40px; color: #000000; font-family: 'Times New Roman', Times, serif; font-size: 12px; border: 1px solid #ddd;">
                    No items added
                 </td>
            </tr>
        ` : '';

        const gstRows = () => {
            if (totals.sameState) {
                return `
                    <div style="display: flex; justify-content: space-between; padding: 5px 0; font-family: 'Times New Roman', Times, serif; font-size: 11px; color: #000000;">
                        <span>SGST @ 9%</span>
                        <span>${formatCurrency(totals.sgst)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; padding: 5px 0; font-family: 'Times New Roman', Times, serif; font-size: 11px; color: #000000;">
                        <span>CGST @ 9%</span>
                        <span>${formatCurrency(totals.cgst)}</span>
                    </div>
                `;
            } else {
                return `
                    <div style="display: flex; justify-content: space-between; padding: 5px 0; font-family: 'Times New Roman', Times, serif; font-size: 11px; color: #000000;">
                        <span>IGST @ 18%</span>
                        <span>${formatCurrency(totals.igst)}</span>
                    </div>
                `;
            }
        };

        return `
            <!DOCTYPE html>
            <html>
                <head>
                    <title>Invoice ${formData.invoice_number || 'JA'}</title>
                    <meta charset="utf-8">
                    <style>
                        * { margin: 0; padding: 0; box-sizing: border-box; }
                        body { font-family: 'Times New Roman', Times, serif !important; margin: 0; padding: 0; background: white; }
                        @page { size: A4; margin: 1.5cm !important; }
                        @media print {
                            body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; margin: 0; padding: 0; }
                            .no-print { display: none !important; }
                            .invoice-doc { box-shadow: none !important; margin: 0 !important; padding: 0 !important; }
                        }
                        .invoice-doc { width: 100%; max-width: 210mm; background: white; font-family: 'Times New Roman', Times, serif !important; color: #000000 !important; margin: 0 auto; padding: 0; }
                        .p-biz-hdr { display: flex !important; justify-content: space-between !important; margin-bottom: 20px !important; }
                        .p-title { text-align: center !important; font-size: 20px !important; margin: 20px 0 !important; text-transform: uppercase !important; letter-spacing: 3px !important; display: inline-block !important; color: #00AEEF !important; font-family: 'Times New Roman', Times, serif !important; }
                        .p-title-wrap { text-align: center !important; }
                        .p-bill-row { display: flex !important; justify-content: space-between !important; align-items: flex-start !important; margin: 20px 0 !important; gap: 20px !important; }
                        .ptable { width: 100% !important; border-collapse: collapse !important; margin: 20px 0 !important; font-family: 'Times New Roman', Times, serif !important; }
                        .ptable th { background: #00AEEF !important; background-color: #00AEEF !important; color: white !important; padding: 10px !important; text-align: left !important; border: 1px solid #00AEEF !important; font-family: 'Times New Roman', Times, serif !important; }
                        .ptable td { border: 1px solid #ddd !important; padding: 8px !important; text-align: left !important; color: #000000 !important; font-family: 'Times New Roman', Times, serif !important; }
                        .ptable th:first-child, .ptable td:first-child { text-align: center !important; }
                        .ptable th:nth-child(5), .ptable td:nth-child(5), .ptable th:nth-child(6), .ptable td:nth-child(6) { text-align: right !important; }
                        .p-grand { background: #00AEEF !important; background-color: #00AEEF !important; color: black !important; border-radius: 5px !important; display: flex !important; justify-content: space-between !important; padding: 10px !important; margin: 10px 0 !important; font-family: 'Times New Roman', Times, serif !important; }
                        .p-footer { display: flex !important; justify-content: space-between !important; margin: 20px 0 !important; }
                        .p-sign-row { display: flex !important; justify-content: space-between !important; margin-top: 40px !important; border-top: 2px solid #f1f5f9 !important; padding-top: 20px !important; }
                        .company-logo-img { max-width: 100px !important; max-height: 80px !important; object-fit: contain !important; }
                        .p-biz-name { font-size: 18px !important; color: #000000 !important; font-family: 'Times New Roman', Times, serif !important; }
                        .p-biz-addr { white-space: pre-line !important; font-size: 11px !important; color: #000000 !important; font-family: 'Times New Roman', Times, serif !important; }
                        .p-bt-label { font-size: 10px !important; text-transform: uppercase !important; color: #000000 !important; border-bottom: 1px solid #f1f5f9 !important; margin-bottom: 8px !important; display: inline-block !important; font-family: 'Times New Roman', Times, serif !important; }
                        .p-cname { font-size: 14px !important; margin-bottom: 5px !important; color: #000000 !important; font-family: 'Times New Roman', Times, serif !important; }
                        .p-caddr { font-size: 12px !important; color: #000000 !important; white-space: pre-line !important; font-family: 'Times New Roman', Times, serif !important; }
                        .c { text-align: center !important; }
                        .r { text-align: right !important; }
                        .mono { font-family: 'Times New Roman', Times, serif !important; }
                        .p-dl, .p-wl { font-size: 10px !important; text-transform: uppercase !important; margin-bottom: 5px !important; color: #000000 !important; font-family: 'Times New Roman', Times, serif !important; }
                        .p-desc-text { font-size: 11px !important; color: #000000 !important; border-left: 3px solid #f1f5f9 !important; padding-left: 10px !important; font-family: 'Times New Roman', Times, serif !important; font-style: normal !important; font-weight: normal !important; }
                        .p-words { font-size: 12px !important; color: #000000 !important; font-family: 'Times New Roman', Times, serif !important; font-style: normal !important; font-weight: normal !important; }
                        .p-terms { margin-top: 20px !important; }
                        .p-tl { font-size: 10px !important; text-transform: uppercase !important; color: #000000 !important; font-family: 'Times New Roman', Times, serif !important; }
                        .p-tt { font-size: 11px !important; color: #000000 !important; line-height: 1.5 !important; font-family: 'Times New Roman', Times, serif !important; }
                        .p-pay-to { margin-bottom: 10px !important; text-decoration: underline !important; font-size: 11px !important; color: #000000 !important; font-family: 'Times New Roman', Times, serif !important; }
                        .p-bank-row { margin-bottom: 5px !important; font-size: 11px !important; color: #000000 !important; font-family: 'Times New Roman', Times, serif !important; }
                        .p-for { font-size: 10px !important; margin-bottom: 30px !important; color: #000000 !important; font-family: 'Times New Roman', Times, serif !important; }
                        .p-sig-line { width: 150px !important; border-bottom: 2px solid #e2e8f0 !important; margin-left: auto !important; }
                        .p-auth { font-size: 9px !important; margin-top: 8px !important; color: #000000 !important; font-family: 'Times New Roman', Times, serif !important; }
                        .p-trow { display: flex !important; justify-content: space-between !important; padding: 5px 0 !important; font-size: 11px !important; color: #000000 !important; font-family: 'Times New Roman', Times, serif !important; }
                        .p-inv-meta { text-align: right !important; color: #000000 !important; }
                        .p-pos { font-size: 11px !important; color: #000000 !important; margin: 5px 0 !important; font-family: 'Times New Roman', Times, serif !important; }
                        .p-inv-no { font-size: 14px !important; margin: 10px 0 5px 0 !important; color: #000000 !important; font-family: 'Times New Roman', Times, serif !important; }
                        .p-bal { display: flex !important; justify-content: space-between !important; padding: 5px 0 !important; border-top: 2px solid #f1f5f9 !important; margin-top: 5px !important; padding-top: 10px !important; font-size: 12px !important; color: #000000 !important; font-family: 'Times New Roman', Times, serif !important; font-weight: bold !important; }
                        .p-desc-block { flex: 1 !important; margin-right: 20px !important; }
                        .p-tots { width: 250px !important; }
                        .p-bank { flex: 1 !important; }
                        .p-bank-row b { font-weight: 900 !important; }
                        b, strong { font-weight: 900 !important; }
                        .p-sign { text-align: right !important; }
                        .signature-badge {
                            display: inline-block;
                            background: #4c9aff;
                            color: white;
                            font-size: 8px;
                            padding: 2px 6px;
                            border-radius: 10px;
                            margin-left: 8px;
                            vertical-align: middle;
                        }
                    </style>
                </head>
                <body>
                    <div class="invoice-doc" style="font-family: 'Times New Roman', Times, serif; background: white; padding: 0; width: 100%; box-sizing: border-box; color: #000000;">
                        <div class="p-biz-hdr">
                            <div>
                                <div class="p-biz-name" style="font-family: 'Times New Roman', Times, serif; font-size: 18px; color: #000000;">${formData.business_name || 'JAYARAMA ASSOCIATES'}</div>
                                <div class="p-biz-addr" style="font-family: 'Times New Roman', Times, serif; white-space: pre-line; font-size: 11px; color: #000000;">${getBusinessAddress()}</div>
                            </div>
                            <div style="text-align: center;">
                                <img src="${COMPANY_LOGO_URL}" alt="Company Logo" class="company-logo-img" style="max-width: 140px; max-height: 120px; object-fit: contain; margin-bottom: 5px; transform: translate(-40px, 10px);" onerror="this.onerror=null; this.src='${FALLBACK_LOGO}';" />
                            </div>
                        </div>
                        <div class="p-title-wrap" style="margin-bottom: 5px;">
                            <div class="p-title" style="font-family: 'Times New Roman', Times, serif; font-size: 20px; text-align: center; letter-spacing: 0px; display: inline-block; margin-top: -10px; color: #00AEEF; border-bottom: none; text-transform: capitalize;">tax invoice</div>
                        </div>
                        <div class="p-bill-row" style="display: flex; justify-content: space-between; align-items: flex-start; gap: 20px;">
                            <div style="flex: 1;">
                                <div class="p-bt-label" style="font-family: 'Times New Roman', Times, serif; font-size: 10px; letter-spacing: 0px; color: #000000; border-bottom: 1px solid #f1f5f9; margin-bottom: 8px; margin-top: 1px; display: inline-block;">Bill To</div>
                                <div class="p-cname" style="font-family: 'Times New Roman', Times, serif; font-size: 14px; margin-bottom: 5px; color: #000000;">${formData.client_name || ''}</div>
                                <div class="p-caddr" style="font-family: 'Times New Roman', Times, serif; font-size: 12px; color: #000000; white-space: pre-line;">${(formData.client_address || '').toLowerCase().replace(/\b\w/g, char => char.toUpperCase())}</div>
                                ${formData.client_phone ? `<div class="p-caddr" style="font-family: 'Times New Roman', Times, serif; font-size: 12px; color: #000000; margin-top: 3px;">Phone: ${formData.client_phone}</div>` : ''}
                                ${formData.client_gst ? `<div class="p-caddr" style="font-family: 'Times New Roman', Times, serif; margin-top: 8px; font-size: 12px; color: #000000;">GSTIN: ${formData.client_gst}</div>` : ''}
                                ${formData.client_email ? `<div class="p-caddr" style="font-family: 'Times New Roman', Times, serif; font-size: 12px; color: #000000; margin-top: 3px;">Email: ${formData.client_email}</div>` : ''}
                                <div class="p-caddr" style="font-family: 'Times New Roman', Times, serif; font-size: 12px; color: #000000; margin-top: 3px;">State: ${formData.client_state || '36-Telangana'}</div>
                            </div>
                            <div class="p-inv-meta" style="text-align: right; color: #000000;">
                                <p class="p-pos" style="font-family: 'Times New Roman', Times, serif; font-size: 13px; color: #000000; margin: 2px 0; font-weight: normal;"><span style="font-weight: normal;">Place of supply:</span> <span style="font-weight: normal;">${formData.place_of_supply || '36-Telangana'}</span></p>
                                <p class="p-inv-no" style="font-family: 'Times New Roman', Times, serif; font-size: 13px; margin-top: 10px; margin-bottom: 5px; color: #000000;">Invoice No: ${formData.invoice_number || ''}</p>
                                <p style="font-family: 'Times New Roman', Times, serif; font-size: 12px; margin-top: 5px; color: #000000;">Date: ${formData.date || ''}</p>
                            </div>
                        </div>
                        <table class="ptable" style="width: 100%; border-collapse: collapse; margin-top: 20px; font-family: 'Times New Roman', Times, serif;">
                            <thead>
                                <tr style="background: #00AEEF; background-color: #00AEEF;">
                                    <th style="width: 42px; padding: 10px; color: white; text-align: center; font-family: 'Times New Roman', Times, serif; font-size: 11px; background: #00AEEF; border: 1px solid #00AEEF;">S.No.</th>
                                    <th style="padding: 10px; color: white; text-align: left; font-family: 'Times New Roman', Times, serif; font-size: 11px; background: #00AEEF; border: 1px solid #00AEEF;">Item Name</th>
                                    <th style="width: 80px; padding: 10px; color: white; text-align: center; font-family: 'Times New Roman', Times, serif; font-size: 11px; background: #00AEEF; border: 1px solid #00AEEF;">HSN/SAC</th>
                                    <th class="c" style="width: 60px; padding: 10px; color: white; text-align: center; font-family: 'Times New Roman', Times, serif; font-size: 11px; background: #00AEEF; border: 1px solid #00AEEF;">Qty</th>
                                    <th class="r" style="width: 110px; padding: 10px; color: white; text-align: right; font-family: 'Times New Roman', Times, serif; font-size: 11px; background: #00AEEF; border: 1px solid #00AEEF;">Price/Unit</th>
                                    <th class="r" style="width: 110px; padding: 10px; color: white; text-align: right; font-family: 'Times New Roman', Times, serif; font-size: 11px; background: #00AEEF; border: 1px solid #00AEEF;">Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${itemsTableRows || noItemsRow}
                            </tbody>
                        </table>
                        <div class="p-footer" style="display: flex; justify-content: space-between; margin-top: -10px;">
                            <div class="p-desc-block" style="flex: 1; margin-right: 20px;">
                                <div class="p-dl" style="font-family: 'Times New Roman', Times, serif; letter-spacing: 0px; font-size: 12px; margin-top: 20px; text-transform: capitalize; margin-bottom: 5px; color: #000000;">Description</div>
                                <div class="p-desc-text" style="font-family: 'Times New Roman', Times, serif; font-size: 11px; color: #000000; text-transform: uppercase; border-left: none; padding-left: 1px; font-style: normal; font-weight: normal; width: 100%; white-space: pre-wrap; word-break: break-word;">${formData.description || ''}</div>
                                <div class="p-wl" style="font-family: 'Times New Roman', Times, serif; font-size: 12px; letter-spacing: 0px; text-transform: capitalize; margin-top: 40px; margin-bottom: 5px; color: #000000;">Invoice Amount in Words</div>
                                <div class="p-words" style="font-family: 'Times New Roman', Times, serif; font-size: 12px; color: #000000; font-style: normal; font-weight: normal;">${numberToWords(totals.total)}</div>
                            </div>
                            <div class="p-tots" style="width: 250px;">
                                <div style="display: flex; justify-content: space-between; padding: 5px 0; font-family: 'Times New Roman', Times, serif; font-size: 11px; color: #000000;"><span>Sub Total</span><span>${formatCurrency(totals.subtotal)}</span></div>
                                ${gstRows()}
                                <div class="p-grand" style="background: #00AEEF; background-color: #00AEEF; color: black; display: flex; justify-content: space-between; padding: 10px; border-radius: 5px; margin: 10px 0; font-family: 'Times New Roman', Times, serif; font-size: 13px;"><span style="font-weight: bold;">TOTAL</span><span style="font-weight: bold;">${formatCurrency(totals.total)}</span></div>
                                <div style="display: flex; justify-content: space-between; padding: 5px 0; color: #000000; font-family: 'Times New Roman', Times, serif; font-size: 11px;"><span>Received</span><span>${formatCurrency(formData.received || 0)}</span></div>
                                <div class="p-bal" style="display: flex; justify-content: space-between; padding: 5px 0; border-top: none; margin-top: 5px; padding-top: 10px; font-family: 'Times New Roman', Times, serif; font-size: 12px; color: #000000;"><span style="font-weight: bold;">Balance Due</span><span style="font-weight: bold;">${formatCurrency(totals.balance)}</span></div>
                            </div>
                        </div>
                        <div class="p-terms" style="margin-top: 0px;">
                            <div class="p-tl" style="font-family: 'Times New Roman', Times, serif; letter-spacing: 0px; font-size: 12px; text-transform: uppercase; color: #000000; text-transform: capitalize; font-weight: bold;">Terms and Conditions</div>
                            <div class="p-tt" style="font-family: 'Times New Roman', Times, serif; font-size: 11px; color: #000000; line-height: 1.3; font-weight: normal;">Thanks for doing business with us!</div>
                        </div>
                        <div class="p-sign-row" style="display: flex; justify-content: space-between; align-items: flex-start; margin-top: 10px; border-top: none; padding-top: 5px;">
                            <div class="p-bank" style="flex: 1;">
                                <div class="p-pay-to" style="font-family: 'Times New Roman', Times, serif; margin-bottom: 10px; text-decoration: underline; font-size: 11px; color: #000000;">Pay To-</div>
                                <div class="p-bank-row" style="margin-bottom: 5px; font-size: 11px; font-family: 'Times New Roman', Times, serif; color: #000000;">Bank Name : <b>${formData.bank_name || 'POLA SANDEEP REDDY'}</b></div>
                                <div class="p-bank-row" style="margin-bottom: 5px; font-size: 11px; font-family: 'Times New Roman', Times, serif; color: #000000;">Bank Account No : <b>${formData.bank_account_no || '922020060131840'}</b></div>
                                <div class="p-bank-row" style="margin-bottom: 5px; font-size: 11px; font-family: 'Times New Roman', Times, serif; color: #000000;">Bank IFSC code : <b>${formData.bank_ifsc || 'UTIB0000425'}</b></div>
                                <div class="p-bank-row" style="margin-bottom: 5px; font-size: 11px; font-family: 'Times New Roman', Times, serif; color: #000000;">Account holder's name : <b>${formData.account_holder || 'JAYARAMA ASSOCIATES'}</b></div>
                            </div>
                            <div class="p-sign" style="text-align: center; min-width: 200px; padding-right: 20px;">
                                <div class="p-for" style="font-family: 'Times New Roman', Times, serif; font-size: 12px; margin-bottom: 8px; color: #000000; font-weight: normal; text-align: center;">For : JAYARAMA ASSOCIATES</div>
                                ${hasSignature && signatureSrc ? `
                                <div style="display: flex; justify-content: center; align-items: center; margin-bottom: 4px; min-height: 50px;">
                                    <img src="${signatureSrc}" alt="Digital Signature" style="max-width: 130px; max-height: 48px; width: auto; height: auto; object-fit: contain; background: transparent; border: none;" />
                                </div>
                                ` : ''}
                                <div class="p-auth" style="font-family: 'Times New Roman', Times, serif; text-align: center; font-size: 12px; margin-top: ${hasSignature ? '4px' : '55px'}; letter-spacing: 1px; color: #000000; font-weight: normal; text-transform: capitalize; line-height: 1.2;">
                                    Authorized Signatory
                                </div>
                            </div>
                        </div>
                    </div>
                    <script>
                        window.onload = () => { setTimeout(() => { window.print(); setTimeout(() => window.close(), 500); }, 500); };
                    </script>
                </body>
            </html>
        `;
    };

    const handlePrint = () => {
        const printHTML = getPrintHTML();
        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(printHTML);
            printWindow.document.close();
        }
    };

    return (
        <div className="preview-panel" style={{ 
            width: '100%', 
            height: '100%', 
            overflowX: 'hidden',
            overflowY: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            position: 'relative',
            background: '#e2e8f0'
        }}>
            <style>
                {`
                    .hide-scrollbars::-webkit-scrollbar {
                        display: none;
                    }
                    @keyframes pulseGlow {
                        0% {
                            box-shadow: 0 4px 15px rgba(0,174,239,0.4);
                            transform: scale(1);
                        }
                        50% {
                            box-shadow: 0 0 25px rgba(0,174,239,0.8), 0 4px 20px rgba(0,174,239,0.5);
                            transform: scale(1.02);
                        }
                        100% {
                            box-shadow: 0 4px 15px rgba(0,174,239,0.4);
                            transform: scale(1);
                        }
                    }
                `}
            </style>
            
            <div 
                ref={previewContainerRef}
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
                style={{
                    width: '100%',
                    height: '100%',
                    overflow: 'scroll',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'flex-start',
                    padding: '40px 20px',
                    cursor: 'grab',
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none',
                    userSelect: isPanning ? 'none' : 'auto'
                }}
                className="hide-scrollbars"
            >
                <div style={getZoomWrapperStyle()}>
                    <div ref={invoiceRef} className="invoice-doc" style={{ 
                        fontFamily: 'Times New Roman, Times, serif', 
                        background: 'white',
                        padding: '1.5cm',
                        width: '210mm',
                        minWidth: '210mm',
                        maxWidth: '210mm',
                        margin: '0 auto',
                        boxSizing: 'border-box',
                        color: '#000000',
                        boxShadow: '0 10px 25px -5px rgba(0,0,0,0.2)',
                        pointerEvents: isPanning ? 'none' : 'auto'
                    }}>
                        <div className="p-biz-hdr" style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <div>
                                <div className="p-biz-name" style={{ fontFamily: 'Times New Roman, Times, serif', fontSize: '18px', color: '#000000' }}>
                                    {formData.business_name || 'JAYARAMA ASSOCIATES'}
                                </div>
                                <div className="p-biz-addr" style={{ fontFamily: 'Times New Roman, Times, serif', whiteSpace: 'pre-line', fontSize: '11px', color: '#000000' }}>
                                    {getBusinessAddress()}
                                </div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <img 
                                    src={COMPANY_LOGO_URL}
                                    alt="Company Logo" 
                                    className="company-logo-img"
                                    style={{ 
                                        maxWidth: '140px', 
                                        maxHeight: '120px', 
                                        objectFit: 'contain',
                                        marginBottom: '5px',
                                        transform: 'translate(-40px, 10px)'
                                    }}
                                    onError={(e) => {
                                        e.target.onerror = null;
                                        e.target.src = FALLBACK_LOGO;
                                    }}
                                />
                            </div>
                        </div>

                        <div className="p-title-wrap" style={{ marginBottom: '5px'}}>
                            <div className="p-title" style={{ 
                                fontFamily: 'Times New Roman, Times, serif', 
                                fontSize: '20px', 
                                textAlign: 'center', 
                                display: 'inline-block', 
                                marginTop: '-10px', 
                                color: '#00AEEF',
                                borderBottom: 'none',
                                letterSpacing: '0px',
                                textTransform: 'capitalize'
                            }}>
                                tax invoice
                            </div>
                        </div>

                        <div className="p-bill-row" style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'flex-start',
                            gap: '20px'
                        }}>
                            <div style={{ flex: 1 }}>
                                <div className="p-bt-label" style={{ fontFamily: 'Times New Roman, Times, serif', fontSize: '10px', letterSpacing: '0px', color: '#000000', borderBottom: '1px solid #f1f5f9', marginBottom: '0px', marginTop: '0px', display: 'inline-block' }}>
                                    Bill To
                                </div>
                                <div className="p-cname" style={{ fontFamily: 'Times New Roman, Times, serif', fontSize: '14px', marginTop: '5px', color: '#000000' }}>
                                    {formData.client_name}
                                </div>
                                <div className="p-caddr" style={{ fontFamily: 'Times New Roman, Times, serif', fontSize: '12px', color: '#000000', whiteSpace: 'pre-line' }} >
                                    {formData.client_address?.toLowerCase().replace(/\b\w/g, char => char.toUpperCase())}
                                </div>
                                {formData.client_phone && (
                                    <div className="p-caddr" style={{ fontFamily: 'Times New Roman, Times, serif', fontSize: '12px', color: '#000000', marginTop: '3px' }}>
                                        Phone: {formData.client_phone}
                                    </div>
                                )}
                                {formData.client_gst && (
                                    <div className="p-caddr" style={{ fontFamily: 'Times New Roman, Times, serif', fontSize: '12px', color: '#000000' }}>
                                        GSTIN: {formData.client_gst}
                                    </div>
                                )}
                                {formData.client_email && (
                                    <div className="p-caddr" style={{ fontFamily: 'Times New Roman, Times, serif', fontSize: '12px', color: '#000000', marginTop: '3px' }}>
                                        Email: {formData.client_email}
                                    </div>
                                )}
                                <div className="p-caddr" style={{ fontFamily: 'Times New Roman, Times, serif', fontSize: '12px', color: '#000000', marginTop: '3px' }}>
                                    State: {formData.client_state || '36-Telangana'}
                                </div>
                            </div>
                            <div className="p-inv-meta" style={{ textAlign: 'right', marginTop: '30px', color: '#000000' }}>
                                <p className="p-pos" style={{ fontFamily: 'Times New Roman, Times, serif', fontSize: '13px', color: '#000000', margin: '2px 0', fontWeight: 'normal' }}>
                                    <span style={{ fontWeight: 'normal' }}>Place of supply:</span>{' '}
                                    <span style={{ fontWeight: 'normal' }}>{formData.place_of_supply || '36-Telangana'}</span>
                                </p>
                                <p className="p-inv-no" style={{ fontFamily: 'Times New Roman, Times, serif', fontSize: '13px', marginTop: '10px', marginBottom: '5px', color: '#000000' }}>
                                    Invoice No: {formData.invoice_number}
                                </p>
                                <p style={{ fontFamily: 'Times New Roman, Times, serif', fontSize: '12px', marginTop: '5px', color: '#000000' }}>
                                    Date: {formData.date}
                                </p>
                            </div>
                        </div>

                        <table className="ptable" style={{ width: '100%', borderCollapse: 'collapse', marginTop: '20px', fontFamily: 'Times New Roman, Times, serif' }}>
                            <thead>
                                <tr style={{ background: '#00AEEF', backgroundColor: '#00AEEF' }}>
                                    <th style={{ width: '42px', padding: '10px', color: 'white', textAlign: 'center', fontFamily: 'Times New Roman, Times, serif', fontSize: '11px', background: '#00AEEF' }}>S.No.</th>
                                    <th style={{ padding: '10px', color: 'white', textAlign: 'left', fontFamily: 'Times New Roman, Times, serif', fontSize: '11px', background: '#00AEEF' }}>Item Name</th>
                                    <th style={{ width: '80px', padding: '10px', color: 'white', textAlign: 'center', fontFamily: 'Times New Roman, Times, serif', fontSize: '11px', background: '#00AEEF' }}>HSN/SAC</th>
                                    <th className="c" style={{ width: '60px', padding: '10px', color: 'white', textAlign: 'center', fontFamily: 'Times New Roman, Times, serif', fontSize: '11px', background: '#00AEEF' }}>Qty</th>
                                    <th className="r" style={{ width: '110px', padding: '10px', color: 'white', textAlign: 'center', fontFamily: 'Times New Roman, Times, serif', fontSize: '11px', background: '#00AEEF' }}>Price/Unit</th>
                                    <th className="r" style={{ width: '110px', padding: '10px', color: 'white', textAlign: 'left', fontFamily: 'Times New Roman, Times, serif', fontSize: '11px', background: '#00AEEF' }}>Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(formData.items || []).length > 0 ? (
                                    (formData.items || []).map((item, index) => {
                                        const qty = item.quantity !== undefined && item.quantity !== null && item.quantity !== '' ? parseNum(item.quantity) : 1;
                                        const price = getItemPrice(item);
                                        const amount = qty * price;
                                        return (
                                            <tr key={item.id || index}>
                                                <td className="c" style={{ textAlign: 'center', padding: '8px', fontFamily: 'Times New Roman, Times, serif', fontSize: '12px', borderBottom: 'none', color: '#000000', fontWeight: 'normal' }}>{index + 1}.</td>
                                                <td style={{ padding: '8px', fontFamily: 'Times New Roman, Times, serif', fontSize: '12px', textAlign: 'left', borderBottom: 'none', color: '#000000', fontWeight: 'normal' }}>{item.description || 'PROFESSIONAL FEE'}</td>
                                                <td style={{ textAlign: 'center', padding: '8px', fontFamily: 'Times New Roman, Times, serif', fontSize: '12px', borderBottom: 'none', color: '#000000', fontWeight: 'normal' }}>{item.hsn || '998399'}</td>
                                                <td className="c" style={{ textAlign: 'center', padding: '8px', fontFamily: 'Times New Roman, Times, serif', fontSize: '12px', borderBottom: 'none', color: '#000000', fontWeight: 'normal' }}>{qty}</td>
                                                <td className="r" style={{ textAlign: 'center', padding: '8px', fontFamily: 'Times New Roman, Times, serif', fontSize: '12px', borderBottom: 'none', color: '#000000', fontWeight: 'normal' }}>
                                                    ₹ {formatINR(price)}
                                                </td>
                                                <td className="amt" style={{ textAlign: 'left', paddingLeft: '15px', padding: '8px', fontFamily: 'Times New Roman, Times, serif', fontSize: '12px', borderBottom: 'none', color: '#000000', fontWeight: 'normal' }}>
                                                    ₹ {formatINR(amount)}
                                                </td>
                                            </tr>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: '#000000', fontFamily: 'Times New Roman, Times, serif', fontSize: '12px', fontWeight: 'normal' }}>
                                            No items added
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>

                        <div className="p-footer" style={{ display: 'flex', justifyContent: 'space-between', marginTop: '-10px' }}>
                            <div className="p-desc-block" style={{ flex: 1, marginRight: '20px' }}>
                                <div className="p-dl" style={{ fontFamily: 'Times New Roman, Times, serif', letterSpacing: '0px', fontSize: '12px', marginTop: '20px', textTransform: 'capitalize', marginBottom: '5px', color: '#000000' }}>
                                    Description
                                </div>
                                <div className="p-desc-text" style={{ fontFamily: 'Times New Roman, Times, serif', fontSize: '11px', color: '#000000', textTransform: 'uppercase', borderLeft: 'none', paddingLeft: '1px', fontStyle: 'normal', fontWeight: 'normal', width: '100%', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }} >
                                    {formData.description}
                                </div>
                                <div className="p-wl" style={{ fontFamily: 'Times New Roman, Times, serif', fontSize: '12px', letterSpacing: '0px', textTransform: 'capitalize', marginTop: '40px', marginBottom: '5px', color: '#000000' }}>
                                    Invoice Amount in Words
                                </div>
                                <div className="p-words" style={{ fontFamily: 'Times New Roman, Times, serif', fontSize: '12px', color: '#000000', fontStyle: 'normal', fontWeight: 'normal' }}>
                                    {numberToWords(totals.total)}
                                </div>
                            </div>
                            <div className="p-tots" style={{ width: '250px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', fontFamily: 'Times New Roman, Times, serif', fontSize: '12px', fontWeight: 'bold' }} >
                                    <span>Sub Total</span>
                                    <span style={{ textAlign: 'left', minWidth: '100px' }}>₹ {formatINR(totals.subtotal)}</span>
                                </div>
                                {totals.sameState ? (
                                    <>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', fontFamily: 'Times New Roman, Times, serif', fontSize: '12px' }} >
                                            <span>SGST @ 9%</span>
                                            <span style={{ textAlign: 'left', minWidth: '100px' }}>₹ {formatINR(totals.sgst)}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', fontFamily: 'Times New Roman, Times, serif', fontSize: '12px' }} >
                                            <span>CGST @ 9%</span>
                                            <span style={{ textAlign: 'left', minWidth: '100px' }}>₹ {formatINR(totals.cgst)}</span>
                                        </div>
                                    </>
                                ) : (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', fontFamily: 'Times New Roman, Times, serif', fontSize: '12px' }} >
                                        <span>IGST @ 18%</span>
                                        <span style={{ textAlign: 'left', minWidth: '100px' }}>₹ {formatINR(totals.igst)}</span>
                                    </div>
                                )}
                                <div className="p-grand" style={{ background: '#00AEEF', color: 'black', display: 'flex', justifyContent: 'space-between', padding: '10px', borderRadius: '5px', margin: '10px 0', fontFamily: 'Times New Roman, Times, serif', fontSize: '13px' }}>
                                    <span style={{ fontWeight: 'bold' }}>TOTAL</span>
                                    <span style={{ fontWeight: 'bold', textAlign: 'left', minWidth: '100px' }}>₹ {formatINR(totals.total)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', fontFamily: 'Times New Roman, Times, serif', fontSize: '12px' }} >
                                    <span>Received</span>
                                    <span style={{ textAlign: 'left', minWidth: '100px' }}>₹ {formatINR(formData.received)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', fontFamily: 'Times New Roman, Times, serif', fontSize: '12px' }} >
                                    <span style={{ fontWeight: 'bold' }}>Balance Due</span>
                                    <span style={{ fontWeight: 'bold', textAlign: 'left', minWidth: '100px' }}>₹ {formatINR(totals.balance)}</span>
                                </div>
                            </div>
                        </div>

                        <div className="p-terms" style={{ marginTop: '0px' }}>
                            <div className="p-tl" style={{ fontFamily: 'Times New Roman, Times, serif', letterSpacing: '0px', fontSize: '12px', color: '#000000', textTransform: 'capitalize', fontWeight: 'bold' }}>
                                Terms and Conditions
                            </div>
                            <div className="p-tt" style={{ fontFamily: 'Times New Roman, Times, serif', fontSize: '11px', color: '#000000', lineHeight: '1.3', fontWeight: 'normal' }}>
                                Thanks for doing business with us!
                            </div>
                        </div>

                        <div className="p-sign-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: '10px', borderTop: 'none', paddingTop: '5px' }}>
                            <div className="p-bank" style={{ flex: 1 }}>
                                <div className="p-pay-to" style={{ fontFamily: 'Times New Roman, Times, serif', marginBottom: '10px', textDecoration: 'underline', fontSize: '11px', color: '#000000' }}>
                                    Pay To-
                                </div>
                                <div className="p-bank-row" style={{ marginBottom: '5px', fontSize: '11px', fontFamily: 'Times New Roman, Times, serif', color: '#000000' }}>
                                    Bank Name : <b>{formData.bank_name || 'POLA SANDEEP REDDY'}</b>
                                </div>
                                <div className="p-bank-row" style={{ marginBottom: '5px', fontSize: '11px', fontFamily: 'Times New Roman, Times, serif', color: '#000000' }}>
                                    Bank Account No : <b>{formData.bank_account_no || '922020060131840'}</b>
                                </div>
                                <div className="p-bank-row" style={{ marginBottom: '5px', fontSize: '11px', fontFamily: 'Times New Roman, Times, serif', color: '#000000' }}>
                                    Bank IFSC code : <b>{formData.bank_ifsc || 'UTIB0000425'}</b>
                                </div>
                                <div className="p-bank-row" style={{ marginBottom: '5px', fontSize: '11px', fontFamily: 'Times New Roman, Times, serif', color: '#000000' }}>
                                    Account holder's name : <b>{formData.account_holder || 'JAYARAMA ASSOCIATES'}</b>
                                </div>
                            </div>
                            <div className="p-sign" style={{ textAlign: 'center', minWidth: '200px', paddingRight: '20px' }}>
                                <div className="p-for" style={{ fontFamily: 'Times New Roman, Times, serif', fontSize: '12px', marginBottom: '8px', color: '#000000', fontWeight: 'normal', textAlign: 'center' }}>
                                    For : {'JAYARAMA ASSOCIATES'}
                                </div>
                                
                                {hasSignature && signatureSrc ? (
                                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '4px', minHeight: '50px' }}>
                                        <img
                                            src={signatureSrc}
                                            alt="Digital Signature"
                                            style={{
                                                maxWidth: '130px',
                                                maxHeight: '48px',
                                                width: 'auto',
                                                height: 'auto',
                                                objectFit: 'contain',
                                                background: 'transparent',
                                                border: 'none'
                                            }}
                                        />
                                    </div>
                                ) : null}

                                <div className="p-auth" style={{
                                    fontFamily: 'Times New Roman, Times, serif',
                                    fontSize: '12px',
                                    marginTop: hasSignature ? '4px' : '65px',
                                    marginBottom: '0px',
                                    letterSpacing: '1px', 
                                    color: '#000000', 
                                    fontWeight: 'normal', 
                                    textTransform: 'capitalize', 
                                    lineHeight: '1.2',
                                    textAlign: 'center'
                                }}>
                                    Authorized Signatory
                                </div>

                                {formData.signed_at && (
                                    <div style={{ fontSize: '9px', color: '#555', marginTop: '3px', textAlign: 'center' }}>
                                        Signed: {new Date(formData.signed_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {!hideActions && isExportReady && (
                <div style={{
                    position: 'fixed',
                    bottom: '24px',
                    right: '110px',
                    zIndex: 1000,
                    display: 'flex',
                    gap: '12px'
                }}>
                    {/* Print Button */}
                    <button
                        onClick={handlePrint}
                        style={{
                            width: '70px',
                            height: '70px',
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, #4a5568, #2d3748)',
                            border: 'none',
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px',
                            boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
                            transition: 'all 0.3s ease',
                            color: 'white',
                            fontFamily: 'Times New Roman, Times, serif'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'scale(1.1)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'scale(1)';
                        }}
                    >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M6 9V3h12v6" />
                            <path d="M6 21H4a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2" />
                            <path d="M6 15h12" />
                            <path d="M6 18h12" />
                        </svg>
                        <span style={{ fontSize: '9px', fontWeight: 'bold', letterSpacing: '0.5px' }}>
                            PRINT
                        </span>
                    </button>

                    {/* PDF Download Button */}
                    <button
                        onClick={downloadPDF}
                        disabled={isExporting}
                        style={{
                            width: '70px',
                            height: '70px',
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, #00AEEF, #0088cc)',
                            border: 'none',
                            cursor: isExporting ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px',
                            boxShadow: '0 4px 15px rgba(0,174,239,0.4)',
                            transition: 'all 0.3s ease',
                            animation: 'pulseGlow 2s infinite',
                            color: 'white',
                            fontFamily: 'Times New Roman, Times, serif'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'scale(1.1)';
                            e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,174,239,0.6)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'scale(1)';
                            e.currentTarget.style.boxShadow = '0 4px 15px rgba(0,174,239,0.4)';
                        }}
                    >
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        <span style={{ fontSize: '9px', fontWeight: 'bold', letterSpacing: '0.5px' }}>
                            {isExporting ? '...' : 'PDF'}
                        </span>
                    </button>
                </div>
            )}
            {isExporting && <LoadingScreen message="Generating PDF preview..." />}
        </div>
    );
});

export default InvoicePreview;