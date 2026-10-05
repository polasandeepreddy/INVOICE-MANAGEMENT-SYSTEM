import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { PDFDocument } from 'pdf-lib';
import InvoicePreview from './InvoicePreview';
import Notification from './Notification';
import ClientManager from './ClientManager';
import BankAccountManager from './BankAccountManager';
import LoadingScreen from './LoadingScreen';
import { API_URL } from '../config';
import { renderInvoicePDFDoc } from '../utils/generateSignedPDF';

const InvoiceEditor = ({ invoice, onSave, onCancel, user }) => {
    // Helper function to get today's date in yyyy-mm-dd format (for date picker)
    const getTodayDateForPicker = () => {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    // Helper function to get today's date in dd-mm-yyyy format (for display)
    const getTodayDateForDisplay = () => {
        const today = new Date();
        const day = String(today.getDate()).padStart(2, '0');
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const year = today.getFullYear();
        return `${day}-${month}-${year}`;
    };

    // Helper function to convert dd-mm-yyyy to yyyy-mm-dd for API and date picker
    const convertToDisplayFormat = (dateString) => {
        if (!dateString) return '';

        const date = new Date(dateString);

        if (isNaN(date.getTime())) return '';

        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();

        return `${day}-${month}-${year}`;
    };

    // Helper function to extract state from GST number (first two digits)
    const getStateFromGST = (gstNumber) => {
        if (!gstNumber || gstNumber.length < 2) return '';
        const stateCode = gstNumber.substring(0, 2);

        // Find state name from mapping
        const stateMapping = stateCodeMapping.find(mapping => mapping.code === stateCode);
        return stateMapping ? `${stateCode}-${stateMapping.name}` : stateCode;
    };

    // Helper to format numbers with commas (en-IN locale) while entering
    const formatNumberWithCommas = (val) => {
        if (val === null || val === undefined || val === '') return '';
        const str = String(val);
        const cleaned = str.replace(/[^0-9.]/g, '');
        if (!cleaned) return '';
        const parts = cleaned.split('.');
        let integerPart = parts[0];
        if (integerPart.length > 1 && integerPart.startsWith('0')) {
            integerPart = integerPart.replace(/^0+/, '') || '0';
        }
        const formattedInteger = integerPart !== '' ? Number(integerPart).toLocaleString('en-IN') : (parts.length > 1 ? '0' : '');
        if (parts.length > 1) {
            return `${formattedInteger}.${parts[1]}`;
        }
        return formattedInteger;
    };

    // Helper to parse formatted numbers with commas back to float
    const parseFormattedNumber = (val) => {
        if (val === null || val === undefined || val === '') return 0;
        const cleanStr = String(val).replace(/,/g, '');
        const num = parseFloat(cleanStr);
        return isNaN(num) ? 0 : num;
    };

    const [formData, setFormData] = useState({
        id: null,
        invoice_number: '',
        date: getTodayDateForDisplay(),
        datePickerValue: getTodayDateForPicker(),
        business_name: 'JAYARAMA ASSOCIATES',
        business_address: 'Plot No: 12, Road No: 1A, CZECH COLONY,\nSANATH NAGAR, HYDERABAD - 500018\nPhone no. : 9866669777\nEmail : jayaramassociates@yahoo.com\nGSTIN : 36AMIPM2958D1ZY\nState: 36-Telangana',
        client_id: '',
        client_name: '',
        client_address: '',
        client_gst: '',
        client_phone: '',
        client_email: '',
        client_state: '',
        place_of_supply: '36-Telangana',
        items: [],
        description: '',
        received: '',
        bank_account_id: '',
        bank_name: '',
        bank_account_no: '',
        bank_ifsc: '',
        account_holder: ''
    });

    const [clients, setClients] = useState([]);
    const [bankAccounts, setBankAccounts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isDataReady, setIsDataReady] = useState(false);
    const [notification, setNotification] = useState(null);
    const [showClientManager, setShowClientManager] = useState(false);
    const [showBankAccountManager, setShowBankAccountManager] = useState(false);
    const [userRole, setUserRole] = useState('user');
    const [invoiceNumberInfo, setInvoiceNumberInfo] = useState({
        nextNumber: '',
        previousNumber: '',
        loading: true
    });
    const [stateCodeMapping, setStateCodeMapping] = useState([
        { code: '36', name: 'Telangana' },
        { code: '37', name: 'Andhra Pradesh' }
    ]);
    const [showStateMappingManager, setShowStateMappingManager] = useState(false);
    const [isLoadingDropdowns, setIsLoadingDropdowns] = useState(true);

    // Attached PDFs & Live Merged Preview state
    const [attachedPDFs, setAttachedPDFs] = useState([]);
    const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
    const [mergedPdfPreviewUrl, setMergedPdfPreviewUrl] = useState(null);
    const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
    const [isDraggingAttachments, setIsDraggingAttachments] = useState(false);
    const [isDraggingManual, setIsDraggingManual] = useState(false);
    const [selectedManualFile, setSelectedManualFile] = useState(null);

    const processPdfFiles = async (files) => {
        if (!files || !files.length) return;
        const pdfFiles = Array.from(files).filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
        if (pdfFiles.length < files.length) {
            showNotification('warning', 'Only PDF format is allowed. Non-PDF files were ignored.');
        }

        const newAttachments = [];
        for (const file of pdfFiles) {
            try {
                const arrayBuffer = await file.arrayBuffer();
                const pdfDoc = await PDFDocument.load(arrayBuffer);
                const pageCount = pdfDoc.getPageCount();

                const base64Data = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.readAsDataURL(file);
                });

                newAttachments.push({
                    id: 'att_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
                    name: file.name,
                    size: file.size,
                    pageCount: pageCount,
                    data: base64Data,
                    arrayBuffer: arrayBuffer
                });
            } catch (err) {
                console.error('PDF file error:', file.name, err);
                showNotification('error', `Failed to load ${file.name}: ${err.message}`);
            }
        }

        if (newAttachments.length > 0) {
            setAttachedPDFs(prev => [...prev, ...newAttachments]);
            showNotification('success', `Attached ${newAttachments.length} PDF file(s).`);
        }
    };

    // Manual Signature Workflow state
    // eslint-disable-next-line no-unused-vars
    const [manualSignatureStatus, setManualSignatureStatus] = useState('Not Required');
    const [manualSignedFileId, setManualSignedFileId] = useState(null);
    const [manualSignedFileName, setManualSignedFileName] = useState(null);
    // eslint-disable-next-line no-unused-vars
    const [manualSignedFileUrl, setManualSignedFileUrl] = useState(null);
    const [manualSignedUploadedAt, setManualSignedUploadedAt] = useState(null);
    const [isUploadingManualSigned, setIsUploadingManualSigned] = useState(false);
    // eslint-disable-next-line no-unused-vars
    const [isDownloadingUnsigned, setIsDownloadingUnsigned] = useState(false);
    const [isViewingManualSigned, setIsViewingManualSigned] = useState(false);
    const [manualSignedPreviewModalOpen, setManualSignedPreviewModalOpen] = useState(false);
    const [manualSignedPreviewUrl, setManualSignedPreviewUrl] = useState(null);
    const [isManualConfirmed, setIsManualConfirmed] = useState(false);

    // Section visibility toggles for bottom buttons
    const [showAddDocsSection, setShowAddDocsSection] = useState(false);
    const [showManualSignSection, setShowManualSignSection] = useState(false);

    // Compute whether this invoice is digitally signed (via eSign) or manually signed
    const isDigitallySigned = Boolean(
        (invoice && (
            invoice.approval_status === 'final_approved' ||
            (invoice.google_drive_file_id && !invoice.manual_signed_file_id && invoice.manual_signature_status !== 'Manually Signed') ||
            (invoice.signature_data && invoice.signature_data !== 'Manual_Signature')
        )) ||
        (formData && formData.id && (
            formData.approval_status === 'final_approved' ||
            (formData.google_drive_file_id && !formData.manual_signed_file_id && formData.manual_signature_status !== 'Manually Signed') ||
            (formData.signature_data && formData.signature_data !== 'Manual_Signature')
        ))
    );

    const isManuallySigned = Boolean(
        (invoice && (
            invoice.manual_signature_status === 'Manually Signed' ||
            !!invoice.manual_signed_file_id
        )) ||
        manualSignatureStatus === 'Manually Signed' ||
        !!manualSignedFileId ||
        (formData && (
            formData.manual_signature_status === 'Manually Signed' ||
            !!formData.manual_signed_file_id
        ))
    );

    const isInvoiceSigned = isDigitallySigned || isManuallySigned;

    // Load initial data
    useEffect(() => {
        const loadInitialData = async () => {
            setIsDataReady(false);
            setIsLoadingDropdowns(true);
            await Promise.all([
                fetchClients(),
                fetchBankAccounts(),
                fetchUserRole(),
                fetchStateMapping()
            ]);
            setIsLoadingDropdowns(false);
            setIsDataReady(true);
        };
        loadInitialData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Handle invoice data when it changes (for editing)
    useEffect(() => {
        if (isDataReady && invoice && invoice.id) {
            console.log('Loading invoice for editing:', invoice);
            console.log('Available bank accounts:', bankAccounts);

            const dbBase = parseFormattedNumber(invoice.base_amount);
            const dbTotal = parseFormattedNumber(invoice.total_amount);
            const dbSgst = parseFormattedNumber(invoice.sgst);
            const dbCgst = parseFormattedNumber(invoice.cgst);
            const dbIgst = parseFormattedNumber(invoice.igst);
            const effectiveBase = dbBase > 0 ? dbBase : (dbTotal > 0 ? (dbSgst || dbCgst || dbIgst ? dbTotal - (dbSgst + dbCgst + dbIgst) : dbTotal / 1.18) : 0);

            const formattedItems = invoice.items && invoice.items.length > 0
                ? invoice.items.map((item, index) => {
                    const qtyNum = item.quantity !== undefined && item.quantity !== null && item.quantity !== '' ? parseFormattedNumber(item.quantity) || 1 : 1;
                    const priceNum = item.price !== undefined && item.price !== null && item.price !== '' ? parseFormattedNumber(item.price) : 0;
                    const finalPrice = priceNum > 0 ? priceNum : (effectiveBase > 0 ? effectiveBase / qtyNum : '');
                    return {
                        id: item.id || `item_${Date.now()}_${index}`,
                        description: item.description || '',
                        hsn: item.hsn || '',
                        quantity: item.quantity !== undefined && item.quantity !== null && item.quantity !== '' ? formatNumberWithCommas(item.quantity) : '1',
                        price: finalPrice !== '' && finalPrice !== 0 ? formatNumberWithCommas(finalPrice) : ''
                    };
                })
                : [{ id: '1', description: 'PROFESSIONAL FEE', hsn: '998399', quantity: '1', price: effectiveBase > 0 ? formatNumberWithCommas(effectiveBase) : '' }];

            let displayDate;
            let pickerDate;

            if (invoice && invoice.date) {
                displayDate = convertToDisplayFormat(invoice.date);
                pickerDate = new Date(invoice.date).toISOString().split('T')[0];
            } else {
                displayDate = getTodayDateForDisplay();
                pickerDate = getTodayDateForPicker();
            }

            // Find matching bank account from the banks list
            let matchedBankId = '';
            if (bankAccounts.length > 0 && invoice.bank_name) {
                // Try to match by bank_name first
                const matchedBank = bankAccounts.find(bank =>
                    bank.bank_name === invoice.bank_name ||
                    bank.account_number === invoice.bank_account_no
                );
                if (matchedBank) {
                    matchedBankId = matchedBank.id;
                    console.log('Matched bank account:', matchedBank);
                }
            }

            setFormData({
                id: invoice.id,
                invoice_number: invoice.invoice_number || '',
                date: displayDate,
                datePickerValue: pickerDate,
                business_name: invoice.business_name || 'JAYARAMA ASSOCIATES',
                business_address: invoice.business_address || 'Plot No: 12, Road No: 1A, CZECH COLONY,\nSANATH NAGAR, HYDERABAD - 500018\nPhone no. : 9866669777\nEmail : jayaramassociates@yahoo.com\nGSTIN : 36AMIPM2958D1ZY\nState: 36-Telangana',
                client_id: invoice.client_id || '',
                client_name: invoice.client_name || '',
                client_address: invoice.client_address || '',
                client_gst: invoice.client_gst || '',
                client_phone: invoice.client_phone || '',
                client_email: invoice.client_email || '',
                client_state: invoice.client_state || getStateFromGST(invoice.client_gst),
                place_of_supply: invoice.place_of_supply || '36-Telangana',
                items: formattedItems,
                description: invoice.description || '',
                received: invoice.received ? formatNumberWithCommas(invoice.received) : '',
                bank_account_id: matchedBankId,
                bank_name: invoice.bank_name || '',
                bank_account_no: invoice.bank_account_no || '',
                bank_ifsc: invoice.bank_ifsc || '',
                account_holder: invoice.account_holder || ''
            });

            setInvoiceNumberInfo({
                nextNumber: invoice.invoice_number,
                previousNumber: 'Editing existing invoice',
                loading: false
            });

            // Load existing attached PDFs if available
            if (invoice.attached_pdfs) {
                let attList = [];
                try {
                    attList = typeof invoice.attached_pdfs === 'string' ? JSON.parse(invoice.attached_pdfs) : invoice.attached_pdfs;
                } catch (e) { attList = []; }
                const validList = Array.isArray(attList) ? attList : [];
                setAttachedPDFs(validList);
                if (validList.length > 0) setShowAddDocsSection(true);
            }

            // Load manual signature details
            const isMS = invoice.manual_signature_status === 'Manually Signed' || !!invoice.manual_signed_file_id;
            setManualSignatureStatus(invoice.manual_signature_status || (invoice.manual_signed_file_id ? 'Manually Signed' : 'Not Required'));
            setManualSignedFileId(invoice.manual_signed_file_id || null);
            setManualSignedFileName(invoice.manual_signed_file_name || null);
            setManualSignedFileUrl(invoice.manual_signed_file_url || null);
            setManualSignedUploadedAt(invoice.manual_signed_uploaded_at || null);
            if (isMS) setShowManualSignSection(true);
        } else if (isDataReady && !invoice) {
            fetchNextInvoiceNumber();
            setFormData(prev => ({
                ...prev,
                id: null,
                date: getTodayDateForDisplay(),
                datePickerValue: getTodayDateForPicker(),
                items: [{ id: '1', description: 'PROFESSIONAL FEE', hsn: '998399', quantity: '1', price: '' }]
            }));
            setAttachedPDFs([]);
            setManualSignatureStatus('Not Required');
            setManualSignedFileId(null);
            setManualSignedFileName(null);
            setManualSignedFileUrl(null);
            setManualSignedUploadedAt(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [invoice, isDataReady, clients, bankAccounts]);

    // Auto-select bank account when bankAccounts are loaded (only for new invoices)
    useEffect(() => {
        if (isDataReady && bankAccounts.length > 0 && !formData.bank_account_id && !invoice) {
            const activeAccounts = bankAccounts.filter(acc => acc.status === 'active');
            const defaultAccount = activeAccounts.find(acc => acc.is_default === 1);
            const accountToSelect = defaultAccount || activeAccounts[0];
            if (accountToSelect) {
                handleBankAccountSelect(accountToSelect.id);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bankAccounts, isDataReady, invoice]);

    const fetchUserRole = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await axios.get(`${API_URL}/auth/me`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setUserRole(response.data.role);
        } catch (error) {
            console.error('Failed to fetch user role:', error);
        }
    };

    const fetchStateMapping = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await axios.get(`${API_URL}/state-mapping`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.data && response.data.length > 0) {
                setStateCodeMapping(response.data);
            }
        } catch (error) {
            console.error('Failed to fetch state mapping:', error);
        }
    };

    const fetchClients = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await axios.get(`${API_URL}/clients`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setClients(response.data);
            console.log('Clients loaded in editor:', response.data);
        } catch (error) {
            console.error('Failed to load clients:', error);
            showNotification('error', 'Failed to load clients');
        }
    };

    const fetchBankAccounts = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await axios.get(`${API_URL}/banks`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const activeAccounts = response.data.filter(acc => acc.status === 'active');
            setBankAccounts(activeAccounts);
            console.log('Bank accounts loaded in editor:', activeAccounts);
        } catch (error) {
            console.error('Failed to load bank accounts:', error);
            showNotification('error', 'Failed to load bank accounts');
        }
    };

    const fetchNextInvoiceNumber = async (selectedDate) => {
        try {
            setInvoiceNumberInfo(prev => ({ ...prev, loading: true }));
            const token = localStorage.getItem('token');
            const url = selectedDate
                ? `${API_URL}/invoices/next-number?date=${encodeURIComponent(selectedDate)}`
                : `${API_URL}/invoices/next-number`;
            const response = await axios.get(url, {
                headers: { Authorization: `Bearer ${token}` }
            });

            setInvoiceNumberInfo({
                nextNumber: response.data.invoiceNumber,
                previousNumber: response.data.previousNumber,
                loading: false
            });

            setFormData(prev => ({
                ...prev,
                invoice_number: response.data.invoiceNumber
            }));
        } catch (error) {
            console.error('Failed to fetch next invoice number:', error);
            setInvoiceNumberInfo({
                nextNumber: 'JA/26-27/001',
                previousNumber: 'Error loading',
                loading: false
            });
            showNotification('error', 'Failed to generate invoice number');
        }
    };

    const handleClientSelect = (clientId) => {
        const selectedClient = clients.find(c => String(c.id) === String(clientId));
        if (selectedClient) {
            const clientState = getStateFromGST(selectedClient.gst_number);

            // Auto-select Pay To Bank from client's mapped bank if configured
            let bankDetails = {};
            if (selectedClient.pay_to_bank_id) {
                const matchedAccount = bankAccounts.find(acc => String(acc.id) === String(selectedClient.pay_to_bank_id));
                if (matchedAccount) {
                    bankDetails = {
                        bank_account_id: matchedAccount.id,
                        bank_name: matchedAccount.bank_name || '',
                        bank_account_no: matchedAccount.account_number || '',
                        bank_ifsc: matchedAccount.ifsc_code || '',
                        account_holder: matchedAccount.account_holder || ''
                    };
                }
            }

            setFormData(prev => ({
                ...prev,
                client_id: selectedClient.id,
                client_name: selectedClient.name,
                client_address: selectedClient.address || '',
                client_gst: selectedClient.gst_number || '',
                client_phone: selectedClient.phone || '',
                client_email: selectedClient.email || '',
                client_state: clientState,
                ...(Object.keys(bankDetails).length > 0 ? bankDetails : {})
            }));
        } else {
            setFormData(prev => ({
                ...prev,
                client_id: '',
                client_name: '',
                client_address: '',
                client_gst: '',
                client_phone: '',
                client_email: '',
                client_state: ''
            }));
        }
    };

    // eslint-disable-next-line no-unused-vars
    const handleGSTChange = (gstNumber) => {
        const clientState = getStateFromGST(gstNumber);
        setFormData(prev => ({
            ...prev,
            client_gst: gstNumber,
            client_state: clientState
        }));
    };

    const handleBankAccountSelect = (accountId) => {
        if (!accountId) {
            setFormData(prev => ({
                ...prev,
                bank_account_id: '',
                bank_name: '',
                bank_account_no: '',
                bank_ifsc: '',
                account_holder: ''
            }));
            return;
        }

        const selectedAccount = bankAccounts.find(acc => String(acc.id) === String(accountId));

        if (selectedAccount) {
            setFormData(prev => ({
                ...prev,
                bank_account_id: selectedAccount.id,
                bank_name: selectedAccount.bank_name || '',
                bank_account_no: selectedAccount.account_number || '',
                bank_ifsc: selectedAccount.ifsc_code || '',
                account_holder: selectedAccount.account_holder || ''
            }));
        }
    };

    const updateFormData = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const updateItem = (id, field, value) => {
        setFormData(prev => ({
            ...prev,
            items: prev.items.map(item =>
                item.id === id ? { ...item, [field]: value } : item
            )
        }));
    };

    const addItem = () => {
        setFormData(prev => ({
            ...prev,
            items: [...prev.items, { id: Date.now().toString(), description: '', hsn: '', quantity: '1', price: '' }]
        }));
    };

    const removeItem = (id) => {
        setFormData(prev => ({
            ...prev,
            items: prev.items.filter(item => item.id !== id)
        }));
    };

    const handleDatePickerChange = (e) => {
        const pickerValue = e.target.value;
        if (pickerValue) {
            const [year, month, day] = pickerValue.split('-');
            const displayDate = `${day}-${month}-${year}`;
            setFormData(prev => ({
                ...prev,
                datePickerValue: pickerValue,
                date: displayDate
            }));
            if (!invoice || !invoice.id) {
                fetchNextInvoiceNumber(pickerValue);
            }
        }
    };

    // eslint-disable-next-line no-unused-vars
    const handleDateManualChange = (value) => {
        let formattedValue = value.replace(/[^\d-]/g, '');

        if (formattedValue.length === 2 && !formattedValue.includes('-')) {
            formattedValue += '-';
        } else if (formattedValue.length === 5 && formattedValue.split('-').length === 2 && !formattedValue.endsWith('-')) {
            const parts = formattedValue.split('-');
            if (parts[0].length === 2 && parts[1].length === 2) {
                formattedValue += '-';
            }
        }

        if (formattedValue.length <= 10) {
            setFormData(prev => ({
                ...prev,
                date: formattedValue
            }));

            if (formattedValue.match(/^\d{2}-\d{2}-\d{4}$/)) {
                const [day, month, year] = formattedValue.split('-');
                const pickerValue = `${year}-${month}-${day}`;
                setFormData(prev => ({
                    ...prev,
                    datePickerValue: pickerValue
                }));
            }
        }
    };

    const validateAndFormatDate = (dateString) => {
        const datePattern = /^(\d{2})-(\d{2})-(\d{4})$/;
        if (datePattern.test(dateString)) {
            const day = parseInt(dateString.split('-')[0], 10);
            const month = parseInt(dateString.split('-')[1], 10);
            const year = parseInt(dateString.split('-')[2], 10);

            if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900 && year <= 2100) {
                const testDate = new Date(year, month - 1, day);
                if (testDate.getDate() === day && testDate.getMonth() === month - 1 && testDate.getFullYear() === year) {
                    return dateString;
                }
            }
        }
        return null;
    };

    // eslint-disable-next-line no-unused-vars
    const handleDateBlur = () => {
        let dateValue = formData.date;

        if (!dateValue) {
            const todayDisplay = getTodayDateForDisplay();
            const todayPicker = getTodayDateForPicker();
            setFormData(prev => ({
                ...prev,
                date: todayDisplay,
                datePickerValue: todayPicker
            }));
            return;
        }

        const parts = dateValue.split('-');
        if (parts.length === 1 && parts[0].length === 2) {
            dateValue = `${parts[0]}-${new Date().getMonth() + 1}-${new Date().getFullYear()}`;
        } else if (parts.length === 2 && parts[0].length === 2 && parts[1].length === 2) {
            dateValue = `${parts[0]}-${parts[1]}-${new Date().getFullYear()}`;
        }

        const validDate = validateAndFormatDate(dateValue);
        if (validDate) {
            const [day, month, year] = validDate.split('-');
            const pickerValue = `${year}-${month}-${day}`;
            setFormData(prev => ({
                ...prev,
                date: validDate,
                datePickerValue: pickerValue
            }));
        } else {
            showNotification('warning', 'Invalid date format. Using today\'s date.');
            const todayDisplay = getTodayDateForDisplay();
            const todayPicker = getTodayDateForPicker();
            setFormData(prev => ({
                ...prev,
                date: todayDisplay,
                datePickerValue: todayPicker
            }));
        }
    };

    const handleSave = async () => {
        if (!formData.client_id) {
            showNotification('error', 'Please select a client');
            return;
        }
        if (!formData.bank_account_id) {
            showNotification('error', 'Please select a bank account');
            return;
        }
        if (formData.items.length === 0 || (parseFormattedNumber(formData.items[0].price) === 0 && formData.items.length === 1 && !formData.items[0].description)) {
            showNotification('error', 'Please add at least one item with amount');
            return;
        }
        if (!formData.description || !formData.description.trim()) {
            showNotification('error', 'Please enter Extended Summary');
            return;
        }

        const validDate = validateAndFormatDate(formData.date);
        if (!validDate) {
            showNotification('error', 'Please enter a valid date in DD-MM-YYYY format');
            return;
        }

        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const url = `${API_URL}/invoices`;
            const apiData = {
                id: formData.id || undefined,
                invoice_number: formData.invoice_number,
                date: formData.date
                    ? (() => {
                        const parts = formData.date.split('-');
                        if (parts[0].length === 4) {
                            return formData.date;
                        }
                        if (parts.length === 3) {
                            const [day, month, year] = parts;
                            return `${year}-${month}-${day}`;
                        }
                        return '';
                    })()
                    : '',
                business_name: formData.business_name,
                business_address: formData.business_address,
                client_id: formData.client_id,
                client_name: formData.client_name,
                client_address: formData.client_address,
                client_gst: formData.client_gst,
                client_phone: formData.client_phone,
                client_email: formData.client_email,
                client_state: formData.client_state,
                place_of_supply: formData.place_of_supply,
                items: formData.items.map(item => ({
                    description: item.description,
                    hsn: item.hsn,
                    quantity: parseFormattedNumber(item.quantity) || 1,
                    price: parseFormattedNumber(item.price)
                })),
                description: formData.description,
                received: parseFormattedNumber(formData.received),
                bank_account_id: formData.bank_account_id,
                bank_name: formData.bank_name,
                bank_account_no: formData.bank_account_no,
                bank_ifsc: formData.bank_ifsc,
                account_holder: formData.account_holder,
                manual_signature_status: (isManualConfirmed || manualSignatureStatus === 'Manually Signed') ? 'Manually Signed' : (manualSignatureStatus || 'Not Required'),
                attached_pdfs: attachedPDFs.map(att => ({
                    name: att.name,
                    size: att.size,
                    pageCount: att.pageCount,
                    data: att.data
                }))
            };

            const res = await axios.post(url, apiData, {
                headers: { Authorization: `Bearer ${token}` }
            });

            // If newly created invoice, sync id to local state
            if (!formData.id && res.data && res.data.invoice?.id) {
                setFormData(prev => ({ ...prev, id: res.data.invoice.id }));
            }

            showNotification('success', formData.id ? 'Invoice updated successfully!' : 'Invoice created successfully!');
            setTimeout(() => {
                onSave();
            }, 1500);
        } catch (error) {
            console.error('Failed to save invoice:', error);
            showNotification('error', error.response?.data?.error || 'Failed to save invoice');
        } finally {
            setLoading(false);
        }
    };

    // ==========================================
    // MANUAL SIGNATURE WORKFLOW HANDLERS
    // ==========================================

    // eslint-disable-next-line no-unused-vars
    const handleDownloadUnsignedForManualSign = async () => {
        setIsDownloadingUnsigned(true);
        try {
            const token = localStorage.getItem('token');
            const safeNum = (formData.invoice_number || `INV-${formData.id || Date.now()}`).replace(/[/\\?%*:|"<>]/g, '_');

            if (formData.id) {
                // Try backend download first
                try {
                    const res = await axios.get(`${API_URL}/invoices/${formData.id}/manual-signature/download-unsigned`, {
                        headers: { Authorization: `Bearer ${token}` },
                        responseType: 'blob'
                    });
                    if (res.data && res.data.size > 200) {
                        const blob = new Blob([res.data], { type: 'application/pdf' });
                        const url = window.URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = url;
                        link.setAttribute('download', `${safeNum}_Unsigned.pdf`);
                        document.body.appendChild(link);
                        link.click();
                        link.remove();
                        window.URL.revokeObjectURL(url);
                        showNotification('success', 'Unsigned invoice downloaded successfully for manual signature!');
                        setIsDownloadingUnsigned(false);
                        return;
                    }
                } catch (apiErr) {
                    console.warn('Backend unsigned PDF download fallback to client generation:', apiErr);
                }
            }

            // Client-side fallback generation
            const invoicePdfDoc = await renderInvoicePDFDoc(formData);
            const invoicePdfBytes = invoicePdfDoc.output('arraybuffer');
            let finalBytes = invoicePdfBytes;

            if (attachedPDFs.length > 0) {
                const mergedDoc = await PDFDocument.create();
                const mainDoc = await PDFDocument.load(invoicePdfBytes);
                const mainPages = await mergedDoc.copyPages(mainDoc, mainDoc.getPageIndices());
                mainPages.forEach(p => mergedDoc.addPage(p));

                for (let i = 0; i < attachedPDFs.length; i++) {
                    const att = attachedPDFs[i];
                    let bytes = att.arrayBuffer;
                    if (!bytes && att.data) {
                        const base64Str = att.data.replace(/^data:application\/pdf;base64,/, '');
                        const binaryStr = window.atob(base64Str);
                        const len = binaryStr.length;
                        bytes = new Uint8Array(len);
                        for (let j = 0; j < len; j++) {
                            bytes[j] = binaryStr.charCodeAt(j);
                        }
                    }
                    if (bytes) {
                        const attDoc = await PDFDocument.load(bytes);
                        const pages = await mergedDoc.copyPages(attDoc, attDoc.getPageIndices());
                        pages.forEach(p => mergedDoc.addPage(p));
                    }
                }
                const mergedBytes = await mergedDoc.save();
                finalBytes = mergedBytes;
            }

            const blob = new Blob([finalBytes], { type: 'application/pdf' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `${safeNum}_Unsigned.pdf`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            showNotification('success', 'Unsigned invoice downloaded successfully for manual signature!');
        } catch (err) {
            console.error('Download unsigned PDF error:', err);
            showNotification('error', 'Failed to generate unsigned invoice PDF: ' + err.message);
        } finally {
            setIsDownloadingUnsigned(false);
        }
    };

    const handleManualSignatureUpload = async (fileToUpload = selectedManualFile, isReplace = false) => {
        const file = fileToUpload || selectedManualFile;
        if (!file) {
            showNotification('warning', 'Please select a signed PDF file first.');
            return;
        }

        if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
            showNotification('error', 'Only PDF files are allowed for signed invoice upload.');
            return;
        }

        if (!formData.id) {
            showNotification('warning', 'Please save the invoice first before uploading a manually signed PDF.');
            return;
        }

        setIsUploadingManualSigned(true);
        try {
            const token = localStorage.getItem('token');
            const uploadFormData = new FormData();
            uploadFormData.append('signed_pdf', file);

            const endpoint = isReplace
                ? `${API_URL}/invoices/${formData.id}/manual-signature/replace`
                : `${API_URL}/invoices/${formData.id}/manual-signature/upload`;

            const res = await axios.post(endpoint, uploadFormData, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'multipart/form-data'
                }
            });

            if (res.data && res.data.success) {
                setManualSignatureStatus('Manually Signed');
                setManualSignedFileId(res.data.manual_signed_file_id);
                setManualSignedFileName(res.data.manual_signed_file_name || file.name);
                setManualSignedFileUrl(res.data.manual_signed_file_url || null);
                setManualSignedUploadedAt(res.data.manual_signed_uploaded_at || new Date().toISOString());
                setSelectedManualFile(null);
                setManualSignedPreviewModalOpen(false);
                showNotification('success', isReplace ? 'Manually signed invoice replaced and saved to Google Drive!' : 'Manually signed invoice finalized and saved to Google Drive!');
            } else {
                throw new Error(res.data?.error || 'Upload failed');
            }
        } catch (err) {
            console.error('Manual signature upload error:', err);
            showNotification('error', 'Failed to upload manually signed invoice: ' + (err.response?.data?.error || err.message));
        } finally {
            setIsUploadingManualSigned(false);
        }
    };

    const handlePreviewSelectedManualFile = () => {
        if (!selectedManualFile) return;
        const blobUrl = URL.createObjectURL(selectedManualFile);
        if (manualSignedPreviewUrl) URL.revokeObjectURL(manualSignedPreviewUrl);
        setManualSignedPreviewUrl(blobUrl);
        setManualSignedPreviewModalOpen(true);
    };

    const handleViewManualSignedInvoice = async () => {
        if (!formData.id || !manualSignedFileId) return;

        setIsViewingManualSigned(true);
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get(`${API_URL}/invoices/${formData.id}/manual-signature/view`, {
                headers: { Authorization: `Bearer ${token}` },
                responseType: 'blob'
            });

            if (res.data) {
                const blob = new Blob([res.data], { type: 'application/pdf' });
                const blobUrl = URL.createObjectURL(blob);
                if (manualSignedPreviewUrl) URL.revokeObjectURL(manualSignedPreviewUrl);
                setManualSignedPreviewUrl(blobUrl);
                setManualSignedPreviewModalOpen(true);
            }
        } catch (err) {
            console.error('View manual signed PDF error:', err);
            showNotification('error', 'Failed to view manually signed PDF: ' + (err.response?.data?.error || err.message));
        } finally {
            setIsViewingManualSigned(false);
        }
    };

    const handleDownloadManualSignedInvoice = async () => {
        if (!formData.id || !manualSignedFileId) return;

        try {
            const token = localStorage.getItem('token');
            const res = await axios.get(`${API_URL}/invoices/${formData.id}/manual-signature/download`, {
                headers: { Authorization: `Bearer ${token}` },
                responseType: 'blob'
            });

            const safeNum = (formData.invoice_number || `INV-${formData.id}`).replace(/[/\\?%*:|"<>]/g, '_');
            const fileName = manualSignedFileName || `${safeNum}_Manually_Signed.pdf`;

            const blob = new Blob([res.data], { type: 'application/pdf' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', fileName);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            showNotification('success', 'Manually signed invoice downloaded successfully!');
        } catch (err) {
            console.error('Download manual signed invoice error:', err);
            showNotification('error', 'Failed to download manually signed invoice: ' + (err.response?.data?.error || err.message));
        }
    };

    // eslint-disable-next-line no-unused-vars
    const handleRegenerateNumber = () => {
        fetchNextInvoiceNumber();
        showNotification('info', 'Generating next invoice number...');
    };

    const showNotification = (type, message) => {
        setNotification({ type, message });
        setTimeout(() => setNotification(null), 3000);
    };

    const isFormValid = () => {
        return (
            formData.client_id &&
            formData.bank_account_id &&
            formData.items.length > 0 &&
            formData.items.some(item => parseFormattedNumber(item.price) > 0 && item.description) &&
            formData.invoice_number &&
            formData.date &&
            formData.place_of_supply
        );
    };

    // Show loading state while dropdown data is being fetched
    if (!isDataReady || isLoadingDropdowns || loading) {
        return <LoadingScreen message={loading ? "Saving invoice..." : "Loading invoice editor..."} />;
    }

    return (
        <div style={{
            display: 'flex',
            width: '100vw',
            height: '100vh',
            overflow: 'hidden',
            backgroundColor: '#f8fafc',
            fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
        }}>
            {/* LEFT PANEL: EDITOR FORM - 50% WIDTH */}
            <div style={{
                width: '50%',
                height: '100vh',
                overflow: 'hidden',
                backgroundColor: '#ffffff',
                borderRight: '1px solid #e2e8f0',
                boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
                display: 'flex',
                flexDirection: 'column'
            }}>
                <div className="editor-panel" style={{
                    padding: '1rem',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden'
                }}>
                    <div className="editor-top" style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '1rem',
                        gap: '1rem',
                        flexShrink: 0
                    }}>
                        <button className="back-btn" onClick={onCancel} style={{
                            padding: '0.5rem 1rem',
                            background: '#f1f5f9',
                            border: '1px solid #cbd5e1',
                            borderRadius: '0.5rem',
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                            fontWeight: '500',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                        }}>
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="15 18 9 12 15 6" />
                            </svg>
                            Exit Editor
                        </button>
                        <button className="save-btn" onClick={handleSave} disabled={loading} style={{
                            padding: '0.5rem 1.5rem',
                            background: '#1e3a8a',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.5rem',
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                            fontWeight: '600',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                        }}>
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                                <polyline points="17 21 17 13 7 13 7 21" />
                                <polyline points="7 3 7 8 15 8" />
                            </svg>
                            {loading ? 'SAVING...' : 'SAVE INVOICE'}
                        </button>
                    </div>

                    {/* Scrollable content area */}
                    {/* Scrollable content area */}
                    <div style={{
                        flex: 1,
                        overflowY: 'auto',
                        paddingRight: '0.5rem'
                    }}>
                        {/* SIGNED INVOICE LOCK BANNER */}
                        {isInvoiceSigned && (
                            <div style={{
                                background: '#f0fdf4',
                                border: '1.5px solid #86efac',
                                borderRadius: '0.6rem',
                                padding: '0.8rem 1rem',
                                marginBottom: '1rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem',
                                color: '#15803d',
                                boxShadow: '0 1px 3px rgba(22, 163, 74, 0.1)'
                            }}>
                                <span style={{ fontSize: '1.35rem' }}>🔒</span>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: '700', fontSize: '0.86rem' }}>
                                        Invoice is Signed & Locked {invoice?.approval_status === 'final_approved' ? '(Digitally Signed)' : '(Manually Signed)'}
                                    </div>
                                    <div style={{ fontSize: '0.74rem', color: '#166534', marginTop: '2px', lineHeight: '1.3' }}>
                                        All core invoice details are disabled and cannot be modified. You can add, reorder, or merge supporting PDF documents below.
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* BILLING TO SECTION */}
                        <div className="esection" style={{ marginBottom: '1rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                <span style={{ fontWeight: '600', fontSize: '0.875rem', color: '#1e293b' }}>
                                    Billing To (Client) {isInvoiceSigned && <span style={{ fontSize: '0.7rem', color: '#64748b' }}>(🔒 Locked)</span>}
                                </span>
                                {userRole === 'admin' && !isInvoiceSigned && (
                                    <button
                                        type="button"
                                        onClick={() => setShowClientManager(true)}
                                        style={{
                                            padding: '0.25rem 0.6rem',
                                            background: '#f1f5f9',
                                            border: '1.5px solid #e2e8f0',
                                            borderRadius: '0.5rem',
                                            cursor: 'pointer',
                                            fontSize: '0.7rem',
                                            fontWeight: '600'
                                        }}
                                    >
                                        📋 Manage Clients
                                    </button>
                                )}
                            </div>

                            <div className="client-selector">
                                <select
                                    className="fi"
                                    value={formData.client_id || ""}
                                    onChange={(e) => handleClientSelect(e.target.value)}
                                    disabled={isInvoiceSigned}
                                    style={{
                                        fontWeight: '500',
                                        width: '250px',
                                        padding: '0.5rem',
                                        borderRadius: '0.5rem',
                                        border: '1px solid #cbd5e1',
                                        backgroundColor: isInvoiceSigned ? '#f1f5f9' : 'white',
                                        color: isInvoiceSigned ? '#64748b' : '#1e293b',
                                        cursor: isInvoiceSigned ? 'not-allowed' : 'pointer',
                                        fontSize: '0.875rem',
                                        marginBottom: '0.75rem'
                                    }}
                                >
                                    <option value="">-- Select Client --</option>
                                    {clients.map(client => (
                                        <option key={client.id} value={client.id}>
                                            {client.name} {client.gst_number ? `(GST: ${client.gst_number})` : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {clients.length === 0 && (
                                <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: '#fef3c7', borderRadius: '0.5rem', fontSize: '0.7rem', color: '#92400e' }}>
                                    ⚠️ No clients configured. Please add clients.
                                </div>
                            )}
                        </div>

                        {/* INVOICE DETAILS SECTION */}
                        <div className="esection" style={{ marginBottom: '1rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.375rem', display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#475569' }}>
                                        Invoice No. <span style={{ fontSize: '0.7rem', color: '#64748b' }}>(🔒 Locked)</span>
                                    </label>
                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                        <input
                                            className="fi"
                                            value={formData.invoice_number || (invoiceNumberInfo.loading ? 'Generating...' : '')}
                                            readOnly
                                            disabled={isInvoiceSigned}
                                            style={{
                                                flex: 1,
                                                fontFamily: 'monospace',
                                                fontWeight: 'bold',
                                                padding: '0.5rem 0.75rem',
                                                borderRadius: '0.5rem',
                                                border: '1px solid #cbd5e1',
                                                fontSize: '0.875rem',
                                                backgroundColor: '#f1f5f9',
                                                color: '#334155',
                                                cursor: 'not-allowed'
                                            }}
                                            placeholder="JA/25-26/001"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.375rem', display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#475569' }}>
                                        Invoice Date {isInvoiceSigned ? <span style={{ fontSize: '0.7rem', color: '#64748b' }}>(🔒 Locked)</span> : userRole === 'super_admin' ? <span style={{ fontSize: '0.7rem', color: '#0284c7', fontWeight: 'bold' }}>(📅 Select Date)</span> : <span style={{ fontSize: '0.7rem', color: '#64748b' }}>(🔒 Locked to Today)</span>}
                                    </label>
                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                        {userRole === 'super_admin' && !isInvoiceSigned ? (
                                            <input
                                                type="date"
                                                className="fi"
                                                min="2010-01-01"
                                                max={`${new Date().getFullYear() + 1}-12-31`}
                                                value={formData.datePickerValue}
                                                onChange={handleDatePickerChange}
                                                style={{
                                                    flex: 1,
                                                    padding: '0.5rem 0.75rem',
                                                    borderRadius: '0.5rem',
                                                    border: '1.5px solid #0284c7',
                                                    fontSize: '0.875rem',
                                                    fontFamily: 'monospace',
                                                    fontWeight: '600',
                                                    backgroundColor: '#ffffff',
                                                    color: '#0f172a',
                                                    cursor: 'pointer'
                                                }}
                                            />
                                        ) : (
                                            <input
                                                type="text"
                                                className="fi"
                                                value={formData.date || getTodayDateForDisplay()}
                                                readOnly
                                                disabled={isInvoiceSigned}
                                                style={{
                                                    flex: 1,
                                                    padding: '0.5rem 0.75rem',
                                                    borderRadius: '0.5rem',
                                                    border: '1px solid #cbd5e1',
                                                    fontSize: '0.875rem',
                                                    fontFamily: 'monospace',
                                                    fontWeight: '600',
                                                    backgroundColor: '#f1f5f9',
                                                    color: '#334155',
                                                    cursor: 'not-allowed'
                                                }}
                                            />
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Place of Supply Section */}
                            <div style={{ marginTop: '0.5rem' }}>
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    marginBottom: '0.5rem'
                                }}>
                                    <span style={{ fontWeight: '600', fontSize: '0.875rem', color: '#1e293b' }}>
                                        Place of Supply {isInvoiceSigned && <span style={{ fontSize: '0.7rem', color: '#64748b' }}>(🔒 Locked)</span>}
                                    </span>
                                    {userRole === 'admin' && !isInvoiceSigned && (
                                        <button
                                            type="button"
                                            onClick={() => setShowStateMappingManager(true)}
                                            style={{
                                                padding: '0.25rem 0.75rem',
                                                background: '#f1f5f9',
                                                border: '1px solid #e2e8f0',
                                                borderRadius: '0.5rem',
                                                cursor: 'pointer',
                                                fontSize: '0.7rem',
                                                fontWeight: '500'
                                            }}
                                        >
                                            ⚙️ Manage States
                                        </button>
                                    )}
                                </div>
                                <select
                                    className="fi"
                                    value={formData.place_of_supply}
                                    onChange={(e) => updateFormData('place_of_supply', e.target.value)}
                                    disabled={isInvoiceSigned}
                                    style={{
                                        fontWeight: '500',
                                        width: '100%',
                                        padding: '0.5rem 0.75rem',
                                        borderRadius: '0.5rem',
                                        border: '1px solid #cbd5e1',
                                        backgroundColor: isInvoiceSigned ? '#f1f5f9' : 'white',
                                        color: isInvoiceSigned ? '#64748b' : '#1e293b',
                                        cursor: isInvoiceSigned ? 'not-allowed' : 'pointer',
                                        fontSize: '0.875rem'
                                    }}
                                >
                                    <option value="">-- Select State --</option>
                                    {stateCodeMapping.map(state => (
                                        <option key={state.code} value={`${state.code}-${state.name}`}>
                                            {state.code} - {state.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* LINE ITEMS SECTION */}
                        <div className="esection" style={{ marginBottom: '1rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                <span style={{ fontWeight: '600', fontSize: '0.875rem' }}>
                                    Line Items {isInvoiceSigned && <span style={{ fontSize: '0.7rem', color: '#64748b' }}>(🔒 Locked)</span>}
                                </span>
                                {!isInvoiceSigned && (
                                    <button className="add-item-btn" onClick={addItem} style={{
                                        padding: '0.25rem 0.7rem',
                                        background: '#2563eb',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '0.5rem',
                                        cursor: 'pointer',
                                        fontSize: '0.7rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.25rem'
                                    }}>
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                            <line x1="12" y1="5" x2="12" y2="19" />
                                            <line x1="5" y1="12" x2="19" y2="12" />
                                        </svg>
                                        ADD ITEM
                                    </button>
                                )}
                            </div>
                            <div id="items-con" style={{ maxHeight: '250px', overflowY: 'auto' }}>
                                {formData.items.map((item, index) => (
                                    <div className="item-row" key={item.id} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                                        <div style={{ width: '30px', textAlign: 'center', fontWeight: 'bold', fontSize: '0.8rem', color: isInvoiceSigned ? '#64748b' : 'inherit' }}>{index + 1}</div>
                                        <div style={{ flex: 2 }}>
                                            <input
                                                className="fi"
                                                placeholder="Service/Item Name"
                                                value={item.description}
                                                disabled={isInvoiceSigned}
                                                onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                                                style={{
                                                    width: '100%',
                                                    padding: '0.4rem',
                                                    borderRadius: '0.4rem',
                                                    border: '1px solid #cbd5e1',
                                                    fontSize: '0.8rem',
                                                    backgroundColor: isInvoiceSigned ? '#f1f5f9' : 'white',
                                                    color: isInvoiceSigned ? '#64748b' : 'inherit',
                                                    cursor: isInvoiceSigned ? 'not-allowed' : 'text'
                                                }}
                                            />
                                        </div>
                                        <div style={{ width: '70px' }}>
                                            <input
                                                className="fi"
                                                placeholder="HSN"
                                                value={item.hsn}
                                                disabled={isInvoiceSigned}
                                                onChange={(e) => updateItem(item.id, 'hsn', e.target.value)}
                                                style={{
                                                    width: '100%',
                                                    padding: '0.4rem',
                                                    textAlign: 'center',
                                                    borderRadius: '0.4rem',
                                                    border: '1px solid #cbd5e1',
                                                    fontSize: '0.8rem',
                                                    backgroundColor: isInvoiceSigned ? '#f1f5f9' : 'white',
                                                    color: isInvoiceSigned ? '#64748b' : 'inherit',
                                                    cursor: isInvoiceSigned ? 'not-allowed' : 'text'
                                                }}
                                            />
                                        </div>
                                        <div style={{ width: '60px' }}>
                                            <input
                                                type="text"
                                                inputMode="numeric"
                                                className="fi"
                                                placeholder="1"
                                                value={item.quantity}
                                                disabled={isInvoiceSigned}
                                                onChange={(e) => updateItem(item.id, 'quantity', formatNumberWithCommas(e.target.value))}
                                                style={{
                                                    width: '100%',
                                                    padding: '0.4rem',
                                                    textAlign: 'center',
                                                    borderRadius: '0.4rem',
                                                    border: '1px solid #cbd5e1',
                                                    fontSize: '0.8rem',
                                                    backgroundColor: isInvoiceSigned ? '#f1f5f9' : 'white',
                                                    color: isInvoiceSigned ? '#64748b' : 'inherit',
                                                    cursor: isInvoiceSigned ? 'not-allowed' : 'text'
                                                }}
                                            />
                                        </div>
                                        <div style={{ width: '90px' }}>
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                className="fi fmono"
                                                placeholder="0.00"
                                                value={item.price}
                                                disabled={isInvoiceSigned}
                                                onChange={(e) => updateItem(item.id, 'price', formatNumberWithCommas(e.target.value))}
                                                style={{
                                                    width: '100%',
                                                    padding: '0.4rem',
                                                    textAlign: 'right',
                                                    borderRadius: '0.4rem',
                                                    border: '1px solid #cbd5e1',
                                                    fontSize: '0.8rem',
                                                    backgroundColor: isInvoiceSigned ? '#f1f5f9' : 'white',
                                                    color: isInvoiceSigned ? '#64748b' : 'inherit',
                                                    cursor: isInvoiceSigned ? 'not-allowed' : 'text'
                                                }}
                                            />
                                        </div>
                                        {!isInvoiceSigned && (
                                            <button className="item-remove" onClick={() => removeItem(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '0.4rem' }}>
                                                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* EXTENDED SUMMARY SECTION */}
                        <div className="esection" style={{ marginBottom: '1rem' }}>
                            <div>
                                <label style={{ fontSize: '0.75rem', fontWeight: '500', color: '#0f172a' }}>
                                    Extended Summary <span style={{ color: '#dc2626' }}>*</span> {isInvoiceSigned && <span style={{ fontSize: '0.7rem', color: '#64748b' }}>(🔒 Locked)</span>}
                                </label>
                                <textarea
                                    className="fta"
                                    rows="3"
                                    placeholder="Mention report types, month, or location..."
                                    value={formData.description}
                                    disabled={isInvoiceSigned}
                                    onChange={(e) => updateFormData('description', e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '0.5rem',
                                        borderRadius: '0.5rem',
                                        border: '1px solid #cbd5e1',
                                        marginTop: '0.25rem',
                                        fontSize: '0.8rem',
                                        backgroundColor: isInvoiceSigned ? '#f1f5f9' : 'white',
                                        color: isInvoiceSigned ? '#64748b' : 'inherit',
                                        cursor: isInvoiceSigned ? 'not-allowed' : 'text'
                                    }}
                                />
                            </div>
                        </div>

                        {/* PAY TO BANK SECTION */}
                        <div className="esection">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                <span style={{ fontWeight: '600', fontSize: '0.875rem' }}>
                                    Pay To (Bank Settlement Profile) {isInvoiceSigned && <span style={{ fontSize: '0.7rem', color: '#64748b' }}>(🔒 Locked)</span>}
                                </span>
                                {userRole === 'admin' && !isInvoiceSigned && (
                                    <button
                                        type="button"
                                        onClick={() => setShowBankAccountManager(true)}
                                        style={{
                                            padding: '0.25rem 0.6rem',
                                            background: '#f1f5f9',
                                            border: '1.5px solid #e2e8f0',
                                            borderRadius: '0.5rem',
                                            cursor: 'pointer',
                                            fontSize: '0.7rem',
                                            fontWeight: '600'
                                        }}
                                    >
                                        🏦 Manage Bank Accounts
                                    </button>
                                )}
                            </div>

                            <div className="bank-selector">
                                <select
                                    className="fi"
                                    value={formData.bank_account_id || ""}
                                    onChange={(e) => handleBankAccountSelect(e.target.value)}
                                    disabled={isInvoiceSigned}
                                    style={{
                                        width: '100%',
                                        padding: '0.5rem',
                                        borderRadius: '0.5rem',
                                        border: '1px solid #cbd5e1',
                                        backgroundColor: isInvoiceSigned ? '#f1f5f9' : 'white',
                                        color: isInvoiceSigned ? '#64748b' : 'inherit',
                                        cursor: isInvoiceSigned ? 'not-allowed' : 'pointer',
                                        fontSize: '0.875rem',
                                        marginBottom: '0.75rem'
                                    }}
                                >
                                    <option value="">-- Select Bank Account --</option>
                                    {bankAccounts.map(account => (
                                        <option key={account.id} value={account.id}>
                                            {account.bank_name} {account.branch ? `- ${account.branch}` : ''} - {account.account_number}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {bankAccounts.length === 0 && (
                                <div style={{
                                    marginTop: '0.5rem',
                                    padding: '0.5rem',
                                    background: '#fef3c7',
                                    borderRadius: '0.5rem',
                                    fontSize: '0.7rem',
                                    color: '#92400e'
                                }}>
                                    ⚠️ No active bank accounts. Please add bank accounts.
                                </div>
                            )}
                        </div>

                        {/* BOTTOM ACTION BUTTONS: "Add Documents" & "Manual Sign" */}
                        <div style={{
                            display: 'flex',
                            gap: '0.75rem',
                            marginTop: '1.5rem',
                            marginBottom: (showAddDocsSection || showManualSignSection) ? '1rem' : '0.5rem',
                            flexWrap: 'wrap',
                            alignItems: 'center',
                            padding: '0.75rem 1rem',
                            background: '#f8fafc',
                            borderRadius: '0.75rem',
                            border: '1px solid #e2e8f0'
                        }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginRight: '0.25rem' }}>
                                Additional Actions:
                            </span>

                            <button
                                type="button"
                                onClick={() => setShowAddDocsSection(!showAddDocsSection)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    background: showAddDocsSection ? '#2563eb' : '#ffffff',
                                    color: showAddDocsSection ? '#ffffff' : '#1e293b',
                                    border: showAddDocsSection ? '1px solid #1d4ed8' : '1px solid #cbd5e1',
                                    padding: '0.5rem 1rem',
                                    borderRadius: '0.5rem',
                                    fontSize: '0.82rem',
                                    fontWeight: '700',
                                    cursor: 'pointer',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                📎 Add / Merge PDFs
                                {attachedPDFs.length > 0 && (
                                    <span style={{
                                        background: showAddDocsSection ? '#ffffff' : '#eff6ff',
                                        color: showAddDocsSection ? '#1d4ed8' : '#2563eb',
                                        padding: '1px 6px',
                                        borderRadius: '9999px',
                                        fontSize: '0.7rem',
                                        fontWeight: '800'
                                    }}>
                                        {attachedPDFs.length}
                                    </span>
                                )}
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    if (isDigitallySigned) return;
                                    setShowManualSignSection(!showManualSignSection);
                                }}
                                disabled={isDigitallySigned}
                                title={isDigitallySigned ? "Manual sign option is disabled because this invoice is already digitally signed with eSign." : isManuallySigned ? "View, download, or replace manually signed copy" : "Upload scanned copy with physical signature"}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    background: isDigitallySigned ? '#f1f5f9' : showManualSignSection ? '#16a34a' : '#ffffff',
                                    color: isDigitallySigned ? '#94a3b8' : showManualSignSection ? '#ffffff' : isManuallySigned ? '#166534' : '#1e293b',
                                    border: isDigitallySigned ? '1px solid #e2e8f0' : showManualSignSection ? '1px solid #15803d' : isManuallySigned ? '1px solid #86efac' : '1px solid #cbd5e1',
                                    padding: '0.5rem 1rem',
                                    borderRadius: '0.5rem',
                                    fontSize: '0.82rem',
                                    fontWeight: '700',
                                    cursor: isDigitallySigned ? 'not-allowed' : 'pointer',
                                    boxShadow: isDigitallySigned ? 'none' : '0 1px 2px rgba(0,0,0,0.05)',
                                    transition: 'all 0.15s ease',
                                    opacity: isDigitallySigned ? 0.6 : 1
                                }}
                            >
                                ✍️ Manual Sign {isDigitallySigned ? '(Disabled - eSigned)' : ''}
                                {isManuallySigned && (
                                    <span style={{
                                        background: showManualSignSection ? '#ffffff' : '#ecfdf5',
                                        color: '#15803d',
                                        padding: '1px 6px',
                                        borderRadius: '9999px',
                                        fontSize: '0.7rem',
                                        fontWeight: '800'
                                    }}>
                                        ✓ Signed
                                    </span>
                                )}
                            </button>
                        </div>

                        {/* CONDITIONAL PANELS FOR ADD DOCUMENTS & MANUAL SIGN */}
                        {(showAddDocsSection || (showManualSignSection && !isDigitallySigned)) && (
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: (showAddDocsSection && showManualSignSection && !isInvoiceSigned) ? 'repeat(auto-fit, minmax(320px, 1fr))' : '1fr',
                                gap: '1.25rem',
                                marginTop: '0.5rem'
                            }}>
                                {showAddDocsSection && (
                                    /* LEFT SIDE: ATTACHED PDFS & REORDERING SECTION */
                                    <div className="esection" style={{
                                        margin: 0,
                                        padding: '1rem',
                                        background: '#ffffff',
                                        borderRadius: '0.75rem',
                                        border: '1px solid #e2e8f0',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '8px' }}>
                                            <div>
                                                <span style={{ fontWeight: '700', fontSize: '0.88rem', color: '#0f172a' }}>
                                                    📎 Attach Supporting PDFs
                                                </span>
                                                <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: '#64748b' }}>
                                                    Upload extra PDFs to merge after <strong>Page 1</strong> (Tax Invoice).
                                                </p>
                                            </div>
                                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                                <input
                                                    type="file"
                                                    id="ja-pdf-attachment-input"
                                                    accept="application/pdf"
                                                    multiple
                                                    onChange={(e) => {
                                                        if (e.target.files?.length) {
                                                            processPdfFiles(e.target.files);
                                                        }
                                                        e.target.value = '';
                                                    }}
                                                    style={{ display: 'none' }}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => document.getElementById('ja-pdf-attachment-input')?.click()}
                                                    style={{ background: '#0072bc', color: '#ffffff', border: 'none', padding: '0.35rem 0.7rem', fontSize: '0.75rem', fontWeight: '600', borderRadius: '0.4rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                >
                                                    ➕ Add PDFs
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={async () => {
                                                        setIsGeneratingPreview(true);
                                                        try {
                                                            let invoicePdfBytes = null;
                                                            const token = localStorage.getItem('token');

                                                            if (isInvoiceSigned && formData.id) {
                                                                try {
                                                                    if (formData.manual_signed_file_id || manualSignatureStatus === 'Manually Signed') {
                                                                        const res = await axios.get(`${API_URL}/invoices/${formData.id}/manual-signature/view`, {
                                                                            headers: { Authorization: `Bearer ${token}` },
                                                                            responseType: 'arraybuffer'
                                                                        });
                                                                        invoicePdfBytes = res.data;
                                                                    } else {
                                                                        const res = await axios.get(`${API_URL}/invoices/${formData.id}/signed-pdf`, {
                                                                            headers: { Authorization: `Bearer ${token}` },
                                                                            responseType: 'arraybuffer'
                                                                        });
                                                                        invoicePdfBytes = res.data;
                                                                    }
                                                                } catch (fetchSignedErr) {
                                                                    console.warn('Could not fetch signed PDF from backend, falling back to local render:', fetchSignedErr);
                                                                }
                                                            }

                                                            if (!invoicePdfBytes) {
                                                                const invoicePdfDoc = await renderInvoicePDFDoc(formData);
                                                                invoicePdfBytes = invoicePdfDoc.output('arraybuffer');
                                                            }

                                                            const mergedDoc = await PDFDocument.create();
                                                            const mainDoc = await PDFDocument.load(invoicePdfBytes);

                                                            // Copy Page 1 (signed primary invoice)
                                                            const mainPages = await mergedDoc.copyPages(mainDoc, [0]);
                                                            mainPages.forEach(p => mergedDoc.addPage(p));

                                                            for (let i = 0; i < attachedPDFs.length; i++) {
                                                                const att = attachedPDFs[i];
                                                                let bytes = att.arrayBuffer;
                                                                if (!bytes && att.data) {
                                                                    const base64Str = att.data.replace(/^data:application\/pdf;base64,/, '');
                                                                    const binaryStr = window.atob(base64Str);
                                                                    const len = binaryStr.length;
                                                                    bytes = new Uint8Array(len);
                                                                    for (let j = 0; j < len; j++) {
                                                                        bytes[j] = binaryStr.charCodeAt(j);
                                                                    }
                                                                }

                                                                if (bytes) {
                                                                    const attDoc = await PDFDocument.load(bytes);
                                                                    const pageIndices = attDoc.getPageIndices();
                                                                    const copiedPages = await mergedDoc.copyPages(attDoc, pageIndices);

                                                                    copiedPages.forEach((page) => {
                                                                        mergedDoc.addPage(page);
                                                                    });
                                                                }
                                                            }

                                                            const mergedPdfBytes = await mergedDoc.save();
                                                            const blob = new Blob([mergedPdfBytes], { type: 'application/pdf' });
                                                            const blobUrl = URL.createObjectURL(blob);

                                                            if (mergedPdfPreviewUrl) URL.revokeObjectURL(mergedPdfPreviewUrl);
                                                            setMergedPdfPreviewUrl(blobUrl);
                                                            setIsPreviewModalOpen(true);
                                                        } catch (err) {
                                                            console.error('Merged preview error:', err);
                                                            showNotification('error', 'Failed to generate preview: ' + err.message);
                                                        } finally {
                                                            setIsGeneratingPreview(false);
                                                        }
                                                    }}
                                                    disabled={isGeneratingPreview}
                                                    style={{ background: '#059669', color: '#ffffff', border: 'none', padding: '0.35rem 0.7rem', fontSize: '0.75rem', fontWeight: '600', borderRadius: '0.4rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                >
                                                    {isGeneratingPreview ? '⏳...' : '👁️ Preview Merged'}
                                                </button>
                                            </div>
                                        </div>

                                        {/* Documents list */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flex: 1 }}>
                                            {/* Fixed Page 1 Main Invoice */}
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.45rem 0.7rem', background: '#eff6ff', borderRadius: '0.4rem', border: '1px solid #bfdbfe' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <span style={{ fontSize: '0.95rem' }}>📄</span>
                                                    <div>
                                                        <div style={{ fontWeight: '700', fontSize: '0.76rem', color: '#1e40af' }}>
                                                            Page 1: Tax Invoice
                                                        </div>
                                                        <div style={{ fontSize: '0.68rem', color: '#3b82f6' }}>
                                                            Primary Document
                                                        </div>
                                                    </div>
                                                </div>
                                                <span style={{ fontSize: '0.65rem', fontWeight: '700', background: '#dbeafe', color: '#1e40af', padding: '2px 6px', borderRadius: '9999px' }}>
                                                    Primary
                                                </span>
                                            </div>

                                            {attachedPDFs.length === 0 ? (
                                                <div
                                                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingAttachments(true); }}
                                                    onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingAttachments(false); }}
                                                    onDrop={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        setIsDraggingAttachments(false);
                                                        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                                                            processPdfFiles(e.dataTransfer.files);
                                                        }
                                                    }}
                                                    onClick={() => document.getElementById('ja-pdf-attachment-input')?.click()}
                                                    style={{
                                                        textAlign: 'center',
                                                        padding: '1.1rem 0.75rem',
                                                        background: isDraggingAttachments ? '#eff6ff' : '#f8fafc',
                                                        borderRadius: '0.4rem',
                                                        border: isDraggingAttachments ? '2px dashed #2563eb' : '1px dashed #cbd5e1',
                                                        color: isDraggingAttachments ? '#1d4ed8' : '#64748b',
                                                        fontSize: '0.74rem',
                                                        flex: 1,
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.15s ease'
                                                    }}
                                                >
                                                    <div style={{ fontSize: '1.2rem', marginBottom: '3px' }}>📥 📄</div>
                                                    <div><strong>Drag & drop PDFs here</strong> or click to select files</div>
                                                </div>
                                            ) : (
                                                attachedPDFs.map((att, idx) => (
                                                    <div key={att.id || idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.45rem 0.7rem', background: '#f8fafc', borderRadius: '0.4rem', border: '1px solid #e2e8f0' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                            <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#64748b' }}>#{idx + 2}</span>
                                                            <div>
                                                                <div style={{ fontWeight: '600', fontSize: '0.76rem', color: '#0f172a' }}>
                                                                    {att.name}
                                                                </div>
                                                                <div style={{ fontSize: '0.65rem', color: '#64748b' }}>
                                                                    {att.pageCount ? `${att.pageCount} Page(s)` : 'PDF'} • {(att.size ? (att.size / 1024).toFixed(1) + ' KB' : '')}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    if (idx <= 0) return;
                                                                    setAttachedPDFs(prev => {
                                                                        const copy = [...prev];
                                                                        const temp = copy[idx - 1];
                                                                        copy[idx - 1] = copy[idx];
                                                                        copy[idx] = temp;
                                                                        return copy;
                                                                    });
                                                                }}
                                                                disabled={idx === 0}
                                                                style={{ background: idx === 0 ? '#f1f5f9' : '#ffffff', color: idx === 0 ? '#94a3b8' : '#334155', border: '1px solid #cbd5e1', borderRadius: '0.25rem', padding: '2px 5px', fontSize: '0.65rem', cursor: idx === 0 ? 'not-allowed' : 'pointer' }}
                                                            >
                                                                ↑
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    if (idx >= attachedPDFs.length - 1) return;
                                                                    setAttachedPDFs(prev => {
                                                                        const copy = [...prev];
                                                                        const temp = copy[idx + 1];
                                                                        copy[idx + 1] = copy[idx];
                                                                        copy[idx] = temp;
                                                                        return copy;
                                                                    });
                                                                }}
                                                                disabled={idx === attachedPDFs.length - 1}
                                                                style={{ background: idx === attachedPDFs.length - 1 ? '#f1f5f9' : '#ffffff', color: idx === attachedPDFs.length - 1 ? '#94a3b8' : '#334155', border: '1px solid #cbd5e1', borderRadius: '0.25rem', padding: '2px 5px', fontSize: '0.65rem', cursor: idx === attachedPDFs.length - 1 ? 'not-allowed' : 'pointer' }}
                                                            >
                                                                ↓
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setAttachedPDFs(prev => prev.filter(item => (item.id || item.name) !== (att.id || att.name)))}
                                                                style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '0.25rem', padding: '2px 5px', fontSize: '0.65rem', fontWeight: '600', cursor: 'pointer' }}
                                                            >
                                                                🗑
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                )}

                                {showManualSignSection && !isDigitallySigned && (
                                    <div style={{
                                        margin: 0,
                                        padding: '1rem',
                                        background: '#ffffff',
                                        borderRadius: '0.75rem',
                                        border: '1px solid #e2e8f0',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)'
                                    }}>
                                        {/* Section Header */}
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.6rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <span style={{ fontSize: '1.1rem' }}>✍️</span>
                                                <div>
                                                    <h4 style={{ margin: 0, fontSize: '0.88rem', fontWeight: '700', color: '#0f172a' }}>
                                                        Manual Signature
                                                    </h4>
                                                    <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '1px' }}>
                                                        Upload scanned copy with physical signature
                                                    </div>
                                                </div>
                                            </div>
                                            {manualSignedFileId || manualSignatureStatus === 'Manually Signed' ? (
                                                <span style={{
                                                    background: '#ecfdf5',
                                                    color: '#065f46',
                                                    border: '1px solid #a7f3d0',
                                                    padding: '3px 8px',
                                                    borderRadius: '9999px',
                                                    fontSize: '0.7rem',
                                                    fontWeight: '700',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '4px'
                                                }}>
                                                    ✓ Signed (Google Drive)
                                                </span>
                                            ) : selectedManualFile ? (
                                                <span style={{
                                                    background: '#fef3c7',
                                                    color: '#92400e',
                                                    border: '1px solid #fde68a',
                                                    padding: '3px 8px',
                                                    borderRadius: '9999px',
                                                    fontSize: '0.7rem',
                                                    fontWeight: '700'
                                                }}>
                                                    ⏳ Ready to Finalize
                                                </span>
                                            ) : (
                                                <span style={{
                                                    background: '#f8fafc',
                                                    color: '#64748b',
                                                    border: '1px solid #e2e8f0',
                                                    padding: '3px 8px',
                                                    borderRadius: '9999px',
                                                    fontSize: '0.7rem',
                                                    fontWeight: '600'
                                                }}>
                                                    Optional
                                                </span>
                                            )}
                                        </div>

                                        {selectedManualFile ? (
                                            /* STAGED FILE SELECTED - PREVIEW, REPLACE, FINALIZE */
                                            <div style={{
                                                background: '#fefce8',
                                                border: '1px solid #fde68a',
                                                borderRadius: '0.6rem',
                                                padding: '1rem',
                                                flex: 1,
                                                display: 'flex',
                                                flexDirection: 'column',
                                                justifyContent: 'space-between'
                                            }}>
                                                <div>
                                                    <div style={{
                                                        fontWeight: '700',
                                                        fontSize: '0.82rem',
                                                        color: '#854d0e',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '6px'
                                                    }}>
                                                        📄 Scanned Signed PDF Attached
                                                        <span style={{
                                                            fontSize: '0.65rem',
                                                            background: '#fef3c7',
                                                            color: '#b45309',
                                                            padding: '2px 6px',
                                                            borderRadius: '4px',
                                                            border: '1px solid #fde68a',
                                                            fontWeight: '700'
                                                        }}>
                                                            Pending Finalization
                                                        </span>
                                                    </div>
                                                    <div style={{
                                                        fontSize: '0.76rem',
                                                        color: '#713f12',
                                                        marginTop: '5px',
                                                        fontWeight: '600',
                                                        wordBreak: 'break-all'
                                                    }}>
                                                        📎 {selectedManualFile.name} ({(selectedManualFile.size / 1024).toFixed(1)} KB)
                                                    </div>
                                                    <div style={{
                                                        fontSize: '0.7rem',
                                                        color: '#a16207',
                                                        marginTop: '4px',
                                                        lineHeight: '1.4'
                                                    }}>
                                                        Preview the document to verify the physical signature. When satisfied, click <strong>"Finalize Manual Signature"</strong> to automatically upload it to Google Drive and update the invoice.
                                                    </div>
                                                </div>

                                                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                                    <button
                                                        type="button"
                                                        onClick={handlePreviewSelectedManualFile}
                                                        style={{
                                                            background: '#ffffff',
                                                            color: '#15803d',
                                                            border: '1px solid #86efac',
                                                            padding: '0.45rem 0.85rem',
                                                            borderRadius: '0.4rem',
                                                            fontSize: '0.75rem',
                                                            fontWeight: '700',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '4px',
                                                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                                        }}
                                                    >
                                                        👁️ Preview
                                                    </button>

                                                    <input
                                                        type="file"
                                                        id="ja-manual-sign-replace-selected-input"
                                                        accept=".pdf,application/pdf"
                                                        onChange={(e) => {
                                                            const file = e.target.files?.[0];
                                                            if (file) {
                                                                setSelectedManualFile(file);
                                                                setIsManualConfirmed(false);
                                                            }
                                                            e.target.value = '';
                                                        }}
                                                        style={{ display: 'none' }}
                                                    />

                                                    <button
                                                        type="button"
                                                        onClick={() => document.getElementById('ja-manual-sign-replace-selected-input')?.click()}
                                                        disabled={isUploadingManualSigned}
                                                        style={{
                                                            background: '#ffffff',
                                                            color: '#475569',
                                                            border: '1px solid #cbd5e1',
                                                            padding: '0.45rem 0.8rem',
                                                            borderRadius: '0.4rem',
                                                            fontSize: '0.75rem',
                                                            fontWeight: '600',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '4px'
                                                        }}
                                                    >
                                                        🔄 Replace
                                                    </button>

                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setSelectedManualFile(null);
                                                            setIsManualConfirmed(false);
                                                            if (!manualSignedFileId) setManualSignatureStatus('Not Required');
                                                        }}
                                                        disabled={isUploadingManualSigned}
                                                        style={{
                                                            background: '#ffffff',
                                                            color: '#dc2626',
                                                            border: '1px solid #fecaca',
                                                            padding: '0.45rem 0.8rem',
                                                            borderRadius: '0.4rem',
                                                            fontSize: '0.75rem',
                                                            fontWeight: '600',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        ❌ Cancel
                                                    </button>

                                                    <button
                                                        type="button"
                                                        onClick={() => handleManualSignatureUpload(selectedManualFile, !!manualSignedFileId)}
                                                        disabled={isUploadingManualSigned}
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '5px',
                                                            background: isUploadingManualSigned ? '#94a3b8' : '#16a34a',
                                                            color: '#ffffff',
                                                            border: 'none',
                                                            padding: '0.45rem 1.1rem',
                                                            borderRadius: '0.4rem',
                                                            fontSize: '0.76rem',
                                                            fontWeight: '700',
                                                            cursor: isUploadingManualSigned ? 'not-allowed' : 'pointer',
                                                            boxShadow: '0 2px 4px rgba(22, 163, 74, 0.25)',
                                                            marginLeft: 'auto'
                                                        }}
                                                    >
                                                        {isUploadingManualSigned ? '⏳ Finalizing & Uploading to Drive...' : '✓ Finalize Manual Signature'}
                                                    </button>
                                                </div>
                                            </div>
                                        ) : !manualSignedFileId ? (
                                            /* BEFORE FILE SELECTION STATE */
                                            <div
                                                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingManual(true); }}
                                                onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingManual(false); }}
                                                onDrop={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    setIsDraggingManual(false);
                                                    const file = e.dataTransfer.files?.[0];
                                                    if (file) {
                                                        if (!formData.id) {
                                                            showNotification('warning', 'Please save the invoice first before selecting a manually signed copy.');
                                                            return;
                                                        }
                                                        if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
                                                            showNotification('error', 'Only PDF files are allowed for manual signature upload.');
                                                            return;
                                                        }
                                                        setSelectedManualFile(file);
                                                    }
                                                }}
                                                onClick={() => {
                                                    if (!formData.id) {
                                                        showNotification('warning', 'Please save the invoice first before selecting a manually signed copy.');
                                                        return;
                                                    }
                                                    document.getElementById('ja-manual-sign-upload-input')?.click();
                                                }}
                                                style={{
                                                    background: isDraggingManual ? '#eff6ff' : '#f8fafc',
                                                    border: isDraggingManual ? '2px dashed #2563eb' : '1px dashed #cbd5e1',
                                                    borderRadius: '0.6rem',
                                                    padding: '1rem',
                                                    flex: 1,
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    justifyContent: 'space-between',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.15s ease'
                                                }}
                                            >
                                                <div>
                                                    <div style={{ fontWeight: '700', fontSize: '0.82rem', color: isDraggingManual ? '#1d4ed8' : '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        📥 Upload Manually Signed Document
                                                    </div>
                                                    <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '3px', lineHeight: '1.4' }}>
                                                        Select or drag & drop the scanned PDF with physical signature. After previewing, finalize it to automatically upload to Google Drive.
                                                    </div>
                                                </div>

                                                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                                    <input
                                                        type="file"
                                                        id="ja-manual-sign-upload-input"
                                                        accept=".pdf,application/pdf"
                                                        onChange={(e) => {
                                                            const file = e.target.files?.[0];
                                                            if (file) {
                                                                setSelectedManualFile(file);
                                                                setIsManualConfirmed(false);
                                                            }
                                                            e.target.value = '';
                                                        }}
                                                        style={{ display: 'none' }}
                                                    />

                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (!formData.id) {
                                                                showNotification('warning', 'Please save the invoice first before selecting a manually signed copy.');
                                                                return;
                                                            }
                                                            document.getElementById('ja-manual-sign-upload-input')?.click();
                                                        }}
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '5px',
                                                            background: '#2563eb',
                                                            color: '#ffffff',
                                                            border: 'none',
                                                            padding: '0.45rem 0.85rem',
                                                            borderRadius: '0.4rem',
                                                            fontSize: '0.75rem',
                                                            fontWeight: '600',
                                                            cursor: 'pointer',
                                                            boxShadow: '0 1px 2px rgba(37, 99, 235, 0.2)'
                                                        }}
                                                    >
                                                        📁 Select Signed PDF
                                                    </button>

                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDownloadUnsignedForManualSign();
                                                        }}
                                                        disabled={isDownloadingUnsigned}
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '4px',
                                                            background: '#ffffff',
                                                            color: '#475569',
                                                            border: '1px solid #cbd5e1',
                                                            padding: '0.45rem 0.75rem',
                                                            borderRadius: '0.4rem',
                                                            fontSize: '0.72rem',
                                                            fontWeight: '600',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        {isDownloadingUnsigned ? '⏳ Generating...' : '📄 Download Unsigned Template'}
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            /* AFTER UPLOAD / FINALIZED STATE */
                                            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '0.6rem', padding: '1rem', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                                <div>
                                                    <div style={{ fontWeight: '700', fontSize: '0.82rem', color: '#14532d', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        ✓ Manually Signed Document
                                                        <span style={{ fontSize: '0.65rem', background: '#dcfce7', color: '#15803d', padding: '2px 6px', borderRadius: '4px', border: '1px solid #86efac', fontWeight: '700' }}>
                                                            Google Drive ✓
                                                        </span>
                                                    </div>
                                                    <div style={{ fontSize: '0.74rem', color: '#166534', marginTop: '4px', fontWeight: '600', wordBreak: 'break-all' }}>
                                                        📎 {manualSignedFileName || `${(formData.invoice_number || 'JA').replace(/[/\\?%*:|"<>]/g, '_')}_Manually_Signed.pdf`}
                                                    </div>
                                                    <div style={{ fontSize: '0.68rem', color: '#4b7c59', marginTop: '2px' }}>
                                                        {manualSignedUploadedAt ? new Date(manualSignedUploadedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : 'Saved'}
                                                    </div>
                                                </div>

                                                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.85rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                                    <button
                                                        type="button"
                                                        onClick={handleViewManualSignedInvoice}
                                                        disabled={isViewingManualSigned}
                                                        style={{
                                                            background: '#ffffff',
                                                            color: '#15803d',
                                                            border: '1px solid #86efac',
                                                            padding: '0.45rem 0.85rem',
                                                            borderRadius: '0.4rem',
                                                            fontSize: '0.75rem',
                                                            fontWeight: '700',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '4px',
                                                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                                        }}
                                                    >
                                                        👁️ View / Preview
                                                    </button>

                                                    <button
                                                        type="button"
                                                        onClick={handleDownloadManualSignedInvoice}
                                                        style={{
                                                            background: '#16a34a',
                                                            color: '#ffffff',
                                                            border: 'none',
                                                            padding: '0.45rem 0.85rem',
                                                            borderRadius: '0.4rem',
                                                            fontSize: '0.75rem',
                                                            fontWeight: '700',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '4px',
                                                            boxShadow: '0 2px 4px rgba(22, 163, 74, 0.2)'
                                                        }}
                                                    >
                                                        ⬇️ Download PDF
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* LIVE MERGED PDF PREVIEW MODAL */}
            {isPreviewModalOpen && (
                <div className="modal-overlay" onClick={() => setIsPreviewModalOpen(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ background: '#ffffff', borderRadius: '1rem', width: '92%', maxWidth: '900px', maxHeight: '92vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
                        <div style={{ background: '#0f172a', color: '#ffffff', padding: '1rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#ffffff', fontWeight: 600 }}>
                                    👁️ Merged PDF Bundle Preview (Invoice + {attachedPDFs.length} Attachment{attachedPDFs.length === 1 ? '' : 's'})
                                </h3>
                                <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 2 }}>
                                    Verify document order and eSign placement on each PDF's last page
                                </div>
                            </div>
                            <button onClick={() => setIsPreviewModalOpen(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
                        </div>

                        <div style={{ flex: 1, padding: '0.75rem', background: '#f1f5f9', overflow: 'auto' }}>
                            {mergedPdfPreviewUrl ? (
                                <iframe
                                    src={mergedPdfPreviewUrl}
                                    style={{ width: '100%', height: '600px', border: 'none', borderRadius: '0.5rem' }}
                                    title="Merged PDF Preview"
                                />
                            ) : (
                                <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>No preview available</div>
                            )}
                        </div>

                        <div style={{ padding: '0.75rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ffffff', borderTop: '1px solid #e2e8f0' }}>
                            <button
                                type="button"
                                onClick={() => setIsPreviewModalOpen(false)}
                                style={{ padding: '0.5rem 1rem', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                            >
                                Close & Edit
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setIsPreviewModalOpen(false);
                                    handleSave();
                                }}
                                style={{ padding: '0.5rem 1.25rem', background: '#059669', color: '#ffffff', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700 }}
                            >
                                ✓ Looks Perfect - Save Invoice
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MANUALLY SIGNED PDF PREVIEW MODAL */}
            {manualSignedPreviewModalOpen && (
                <div className="modal-overlay" onClick={() => setManualSignedPreviewModalOpen(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ background: '#ffffff', borderRadius: '1rem', width: '92%', maxWidth: '900px', maxHeight: '92vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
                        <div style={{ background: '#14532d', color: '#ffffff', padding: '1rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#ffffff', fontWeight: 600 }}>
                                    📄 {selectedManualFile ? 'Preview Manually Signed Document' : 'Manually Signed Invoice Document'}
                                </h3>
                                <div style={{ fontSize: '0.75rem', color: '#bbf7d0', marginTop: 2 }}>
                                    {selectedManualFile ? `${selectedManualFile.name} — Review before finalizing` : (manualSignedFileName || `Invoice #${formData.invoice_number}`)}
                                </div>
                            </div>
                            <button onClick={() => setManualSignedPreviewModalOpen(false)} style={{ background: 'none', border: 'none', color: '#bbf7d0', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
                        </div>

                        <div style={{ flex: 1, padding: '0.75rem', background: '#f1f5f9', overflow: 'auto' }}>
                            {manualSignedPreviewUrl ? (
                                <iframe
                                    src={manualSignedPreviewUrl}
                                    style={{ width: '100%', height: '600px', border: 'none', borderRadius: '0.5rem' }}
                                    title="Manually Signed PDF Preview"
                                />
                            ) : (
                                <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>No preview available</div>
                            )}
                        </div>

                        <div style={{ padding: '0.75rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ffffff', borderTop: '1px solid #e2e8f0', gap: '8px', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                onClick={() => setManualSignedPreviewModalOpen(false)}
                                style={{ padding: '0.5rem 1rem', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                            >
                                Close Preview
                            </button>

                            {selectedManualFile ? (
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setManualSignedPreviewModalOpen(false);
                                            document.getElementById('ja-manual-sign-replace-selected-input')?.click();
                                        }}
                                        disabled={isUploadingManualSigned}
                                        style={{ padding: '0.5rem 0.9rem', background: '#ffffff', color: '#475569', border: '1px solid #cbd5e1', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                                    >
                                        🔄 Replace File
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleManualSignatureUpload(selectedManualFile, !!manualSignedFileId)}
                                        disabled={isUploadingManualSigned}
                                        style={{ padding: '0.5rem 1.35rem', background: '#16a34a', color: '#ffffff', border: 'none', borderRadius: '0.5rem', cursor: isUploadingManualSigned ? 'not-allowed' : 'pointer', fontSize: '0.82rem', fontWeight: 700, boxShadow: '0 2px 4px rgba(22, 163, 74, 0.25)' }}
                                    >
                                        {isUploadingManualSigned ? '⏳ Finalizing & Uploading...' : '✓ Looks Perfect — Finalize Manual Signature'}
                                    </button>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={handleDownloadManualSignedInvoice}
                                    style={{ padding: '0.5rem 1.25rem', background: '#16a34a', color: '#ffffff', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700 }}
                                >
                                    ⬇️ Download PDF
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* RIGHT PANEL: INVOICE PREVIEW */}
            <div style={{
                width: '50%',
                height: '100vh',
                overflow: 'hidden',
                backgroundColor: '#f1f5f9',
                padding: '1rem',
                position: 'relative'
            }}>
                <InvoicePreview formData={formData} isFormValid={isFormValid()} />
            </div>

            {/* MODALS */}
            {showClientManager && (
                <div className="modal-overlay" onClick={() => setShowClientManager(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div className="modal-content large" onClick={(e) => e.stopPropagation()} style={{ background: 'white', borderRadius: '1rem', padding: '1.5rem', maxWidth: '90vw', maxHeight: '90vh', overflow: 'auto' }}>
                        <ClientManager userRole={userRole} onClientAdded={() => { fetchClients(); setShowClientManager(false); }} />
                        <button className="close-modal" onClick={() => setShowClientManager(false)} style={{ marginTop: '1rem', padding: '0.5rem 1rem', background: '#e2e8f0', border: 'none', borderRadius: '0.5rem', cursor: 'pointer' }}>Close</button>
                    </div>
                </div>
            )}

            {showBankAccountManager && (
                <div className="modal-overlay" onClick={() => setShowBankAccountManager(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div className="modal-content large" onClick={(e) => e.stopPropagation()} style={{ background: 'white', borderRadius: '1rem', padding: '1.5rem', maxWidth: '90vw', maxHeight: '90vh', overflow: 'auto' }}>
                        <BankAccountManager userRole={userRole} onBankAdded={() => { fetchBankAccounts(); setShowBankAccountManager(false); }} onBankDeleted={() => { fetchBankAccounts(); }} />
                        <button className="close-modal" onClick={() => setShowBankAccountManager(false)} style={{ marginTop: '1rem', padding: '0.5rem 1rem', background: '#e2e8f0', border: 'none', borderRadius: '0.5rem', cursor: 'pointer' }}>Close</button>
                    </div>
                </div>
            )}

            {showStateMappingManager && (
                <div className="modal-overlay" onClick={() => setShowStateMappingManager(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ background: 'white', borderRadius: '1rem', padding: '1.5rem', maxWidth: '500px', width: '90%' }}>
                        <h3 style={{ marginBottom: '1rem' }}>Manage State Code Mapping</h3>
                        <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                            {stateCodeMapping.map((state, index) => (
                                <div key={state.code} style={{ marginBottom: '0.75rem', padding: '0.5rem', border: '1px solid #e2e8f0', borderRadius: '0.5rem' }}>
                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                        <input
                                            type="text"
                                            value={state.code}
                                            onChange={(e) => {
                                                const newMapping = [...stateCodeMapping];
                                                newMapping[index].code = e.target.value;
                                                setStateCodeMapping(newMapping);
                                            }}
                                            style={{ width: '60px', padding: '0.25rem', border: '1px solid #cbd5e1', borderRadius: '0.25rem' }}
                                            placeholder="Code"
                                        />
                                        <input
                                            type="text"
                                            value={state.name}
                                            onChange={(e) => {
                                                const newMapping = [...stateCodeMapping];
                                                newMapping[index].name = e.target.value;
                                                setStateCodeMapping(newMapping);
                                            }}
                                            style={{ flex: 1, padding: '0.25rem', border: '1px solid #cbd5e1', borderRadius: '0.25rem' }}
                                            placeholder="State Name"
                                        />
                                        <button
                                            onClick={() => {
                                                const newMapping = stateCodeMapping.filter((_, i) => i !== index);
                                                setStateCodeMapping(newMapping);
                                            }}
                                            style={{ padding: '0.25rem 0.5rem', background: '#ef4444', color: 'white', border: 'none', borderRadius: '0.25rem', cursor: 'pointer' }}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <button
                            onClick={() => {
                                setStateCodeMapping([...stateCodeMapping, { code: '', name: '' }]);
                            }}
                            style={{ marginTop: '0.75rem', padding: '0.5rem', background: '#2563eb', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', width: '100%' }}
                        >
                            + Add State Code
                        </button>
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                            <button
                                onClick={async () => {
                                    try {
                                        const token = localStorage.getItem('token');
                                        await axios.post(`${API_URL}/state-mapping`, stateCodeMapping, {
                                            headers: { Authorization: `Bearer ${token}` }
                                        });
                                        showNotification('success', 'State mapping saved successfully');
                                        setShowStateMappingManager(false);
                                    } catch (error) {
                                        console.error('Failed to save state mapping:', error);
                                        showNotification('error', 'Failed to save state mapping');
                                    }
                                }}
                                style={{ flex: 1, padding: '0.5rem', background: '#10b981', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer' }}
                            >
                                Save Mapping
                            </button>
                            <button
                                onClick={() => setShowStateMappingManager(false)}
                                style={{ flex: 1, padding: '0.5rem', background: '#6b7280', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer' }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {loading && <LoadingScreen message="Saving invoice..." />}
            {notification && <Notification type={notification.type} message={notification.message} />}
        </div>
    );
};

export default InvoiceEditor;

