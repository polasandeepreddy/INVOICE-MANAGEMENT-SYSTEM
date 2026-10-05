import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Notification from './Notification';
import { API_URL } from '../config';

const ClientManager = ({ userRole, onClientAdded }) => {
    const [clients, setClients] = useState([]);
    const [banks, setBanks] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [editingClient, setEditingClient] = useState(null);
    const [loading, setLoading] = useState(false);
    const [notification, setNotification] = useState(null);
    const [isBankManuallySelected, setIsBankManuallySelected] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        address: '',
        branch: '',
        gst_number: '',
        phone: '',
        email: '',
        pay_to_bank_id: ''
    });

    // API_URL imported from ../config

    useEffect(() => {
        fetchClients();
        fetchBanks();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fetchClients = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await axios.get(`${API_URL}/clients`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setClients(response.data);
        } catch (error) {
            console.error('Failed to load clients:', error);
            showNotification('error', 'Failed to load clients');
        }
    };

    const fetchBanks = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await axios.get(`${API_URL}/banks`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const activeBanks = response.data.filter(b => b.status === 'active');
            setBanks(activeBanks);
        } catch (error) {
            console.error('Failed to load banks in ClientManager:', error);
        }
    };

    // Dynamic Bank Auto-Matching helper based on Bank Master Data
    const autoMatchBank = (clientName, currentBankId, manualOverride) => {
        if (manualOverride || !clientName || !clientName.trim() || !banks || banks.length === 0) {
            return currentBankId;
        }
        const cleanClient = clientName.trim().toLowerCase().replace(/[^a-z0-9]/g, '');

        for (const bank of banks) {
            const bankName = (bank.bank_name || '').toLowerCase();
            const cleanBankName = bankName.replace(/[^a-z0-9]/g, '');

            const tokens = [];
            if (bankName.includes('sbi') || bankName.includes('state bank')) {
                tokens.push('sbi', 'statebank', 'statebankofindia');
            }
            if (bankName.includes('axis')) {
                tokens.push('axis', 'axisbank');
            }
            if (bankName.includes('hdfc')) {
                tokens.push('hdfc', 'hdfcbank');
            }
            if (bankName.includes('icici')) {
                tokens.push('icici', 'icicibank');
            }
            if (bankName.includes('kotak')) {
                tokens.push('kotak', 'kotakmahindra');
            }
            if (bankName.includes('canara')) {
                tokens.push('canara', 'canarabank');
            }
            if (bankName.includes('punjab') || bankName.includes('pnb')) {
                tokens.push('pnb', 'punjabnational', 'punjab');
            }
            if (bankName.includes('baroda') || bankName.includes('bob')) {
                tokens.push('bob', 'bankofbaroda', 'baroda');
            }
            if (bankName.includes('union')) {
                tokens.push('union', 'unionbank');
            }
            if (bankName.includes('indusind')) {
                tokens.push('indusind', 'indusindbank');
            }
            if (bankName.includes('yes')) {
                tokens.push('yes', 'yesbank');
            }
            if (bankName.includes('idfc')) {
                tokens.push('idfc', 'idfcfirst');
            }
            if (bankName.includes('federal')) {
                tokens.push('federal', 'federalbank');
            }
            if (bankName.includes('bandhan')) {
                tokens.push('bandhan', 'bandhanbank');
            }
            if (bankName.includes('dcb')) {
                tokens.push('dcb', 'dcbbank');
            }

            const matchesToken = tokens.some(t => cleanClient.includes(t));
            const matchesDirect = cleanBankName.length > 2 && (cleanClient.includes(cleanBankName) || cleanBankName.includes(cleanClient));

            if (matchesToken || matchesDirect) {
                return bank.id;
            }
        }
        return currentBankId;
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        if (name === 'name') {
            const matchedBankId = !isBankManuallySelected ? autoMatchBank(value, formData.pay_to_bank_id, false) : formData.pay_to_bank_id;
            setFormData(prev => ({
                ...prev,
                name: value,
                pay_to_bank_id: matchedBankId || ''
            }));
        } else if (name === 'pay_to_bank_id') {
            setIsBankManuallySelected(true);
            setFormData(prev => ({
                ...prev,
                pay_to_bank_id: value
            }));
        } else {
            setFormData(prev => ({
                ...prev,
                [name]: value
            }));
        }
    };

    const handleEdit = (client) => {
        setEditingClient(client);
        setIsBankManuallySelected(true);
        setFormData({
            name: client.name || '',
            address: client.address || '',
            branch: client.branch || '',
            gst_number: client.gst_number || '',
            phone: client.phone || '',
            email: client.email || '',
            pay_to_bank_id: client.pay_to_bank_id || ''
        });
        setShowModal(true);
    };

    const handleDelete = async (clientId, clientName) => {
        if (window.confirm(`Are you sure you want to delete "${clientName}"? This action cannot be undone.`)) {
            try {
                const token = localStorage.getItem('token');
                await axios.delete(`${API_URL}/clients/${clientId}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                showNotification('success', 'Client deleted successfully');
                fetchClients();
                if (onClientAdded) onClientAdded();
            } catch (error) {
                console.error('Delete error:', error);
                showNotification('error', error.response?.data?.error || 'Failed to delete client');
            }
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.name || !formData.name.trim()) {
            showNotification('error', 'Client name is required');
            return;
        }

        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const config = {
                headers: { Authorization: `Bearer ${token}` }
            };
            
            const payload = {
                name: formData.name.trim(),
                address: formData.address || null,
                branch: formData.branch || null,
                gst_number: formData.gst_number || null,
                phone: formData.phone || null,
                email: formData.email || null,
                pay_to_bank_id: formData.pay_to_bank_id || null
            };

            if (editingClient) {
                await axios.put(`${API_URL}/clients/${editingClient.id}`, payload, config);
                showNotification('success', 'Client updated successfully');
            } else {
                await axios.post(`${API_URL}/clients`, payload, config);
                showNotification('success', 'Client added successfully');
            }
            
            resetForm();
            setShowModal(false);
            setEditingClient(null);
            fetchClients();
            if (onClientAdded) onClientAdded();
            
        } catch (error) {
            console.error('Save error:', error);
            showNotification('error', error.response?.data?.error || 'Failed to save client');
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setIsBankManuallySelected(false);
        setFormData({
            name: '',
            address: '',
            branch: '',
            gst_number: '',
            phone: '',
            email: '',
            pay_to_bank_id: ''
        });
    };

    const showNotification = (type, message) => {
        setNotification({ type, message });
        setTimeout(() => setNotification(null), 3000);
    };

    if (userRole !== 'admin') {
        return (
            <div style={{ padding: '2rem', textAlign: 'center' }}>
                <p>⚠️ You don't have permission to manage clients.</p>
            </div>
        );
    }

    return (
        <>
            <div className="client-manager" style={{ padding: '1rem' }}>
                <div className="client-header" style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    marginBottom: '1.5rem',
                    flexWrap: 'wrap',
                    gap: '1rem'
                }}>
                    <h3 style={{ margin: 0 }}>📋 Client Management</h3>
                    {userRole === 'admin' && (
                        <button 
                            className="add-client-btn" 
                            onClick={() => {
                                resetForm();
                                setEditingClient(null);
                                setShowModal(true);
                            }}
                            style={{
                                background: '#3b82f6',
                                color: 'white',
                                border: 'none',
                                padding: '0.5rem 1rem',
                                borderRadius: '0.5rem',
                                cursor: 'pointer',
                                fontWeight: '600',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                            }}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="12" y1="5" x2="12" y2="19"/>
                                <line x1="5" y1="12" x2="19" y2="12"/>
                            </svg>
                            Add New Client
                        </button>
                    )}
                </div>

                <div className="clients-list">
                    {clients.length === 0 ? (
                        <p className="no-clients" style={{ textAlign: 'center', color: '#64748b', padding: '2rem' }}>
                            No clients added yet. Click "Add New Client" to get started.
                        </p>
                    ) : (
                        <div className="clients-grid" style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
                            gap: '1rem'
                        }}>
                            {clients.map(client => (
                                <div key={client.id} className="client-card" style={{
                                    background: 'white',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '0.75rem',
                                    padding: '1rem',
                                    position: 'relative',
                                    transition: 'all 0.2s'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                                        <h4 style={{ margin: 0, color: '#1e293b', fontSize: '1rem' }}>{client.name}</h4>
                                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                                            <button
                                                onClick={() => handleEdit(client)}
                                                style={{
                                                    background: '#f59e0b',
                                                    color: 'white',
                                                    border: 'none',
                                                    padding: '0.25rem 0.5rem',
                                                    borderRadius: '0.375rem',
                                                    cursor: 'pointer',
                                                    fontSize: '0.7rem'
                                                }}
                                            >
                                                Edit
                                            </button>
                                            <button
                                                onClick={() => handleDelete(client.id, client.name)}
                                                style={{
                                                    background: '#ef4444',
                                                    color: 'white',
                                                    border: 'none',
                                                    padding: '0.25rem 0.5rem',
                                                    borderRadius: '0.375rem',
                                                    cursor: 'pointer',
                                                    fontSize: '0.7rem'
                                                }}
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                    
                                    {client.branch && (
                                        <div style={{ marginBottom: '0.5rem' }}>
                                            <span style={{
                                                background: '#8b5cf6',
                                                color: 'white',
                                                padding: '0.2rem 0.5rem',
                                                borderRadius: '0.25rem',
                                                fontSize: '0.7rem',
                                                fontWeight: '600',
                                                display: 'inline-block'
                                            }}>
                                                📍 {client.branch}
                                            </span>
                                        </div>
                                    )}
                                    
                                    {client.address && (
                                        <p style={{ margin: '0.25rem 0', fontSize: '0.8rem', color: '#475569' }}>
                                            <strong>Address:</strong> {client.address}
                                        </p>
                                    )}
                                    {client.gst_number && (
                                        <p style={{ margin: '0.25rem 0', fontSize: '0.8rem', color: '#475569' }}>
                                            <strong>GST:</strong> <span style={{ fontFamily: 'monospace' }}>{client.gst_number}</span>
                                        </p>
                                    )}
                                    {client.phone && (
                                        <p style={{ margin: '0.25rem 0', fontSize: '0.8rem', color: '#475569' }}>
                                            <strong>Phone:</strong> {client.phone}
                                        </p>
                                    )}
                                    {client.email && (
                                        <p style={{ margin: '0.25rem 0', fontSize: '0.8rem', color: '#475569' }}>
                                            <strong>Email:</strong> {client.email}
                                        </p>
                                    )}
                                    {client.pay_to_bank_name && (
                                        <div style={{ marginTop: '0.5rem', padding: '0.35rem 0.5rem', background: '#eff6ff', borderRadius: '0.375rem', border: '1px solid #dbeafe' }}>
                                            <span style={{ fontSize: '0.75rem', color: '#1d4ed8', fontWeight: '600' }}>
                                                🏦 Pay To: {client.pay_to_bank_name}
                                            </span>
                                            {client.pay_to_account_number && (
                                                <span style={{ fontSize: '0.7rem', color: '#64748b', marginLeft: '0.5rem' }}>
                                                    (A/C: {client.pay_to_account_number})
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Add/Edit Client Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => {
                    setShowModal(false);
                    setEditingClient(null);
                    resetForm();
                }} style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0,0,0,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000
                }}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{
                        background: 'white',
                        borderRadius: '1rem',
                        padding: '1.5rem',
                        width: '90%',
                        maxWidth: '500px',
                        maxHeight: '90vh',
                        overflow: 'auto'
                    }}>
                        <div className="modal-header" style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '1rem',
                            paddingBottom: '0.5rem',
                            borderBottom: '1px solid #e2e8f0'
                        }}>
                            <h3 style={{ margin: 0 }}>{editingClient ? '✏️ Edit Client' : '➕ Add New Client'}</h3>
                            <button className="modal-close" onClick={() => {
                                setShowModal(false);
                                setEditingClient(null);
                                resetForm();
                            }} style={{
                                background: 'none',
                                border: 'none',
                                fontSize: '1.5rem',
                                cursor: 'pointer',
                                color: '#64748b'
                            }}>×</button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="form-group" style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.25rem', color: '#1e293b' }}>
                                    Client Name <span style={{ color: '#ef4444' }}>*</span>
                                </label>
                                <input
                                    type="text"
                                    name="name"
                                    value={formData.name}
                                    onChange={handleInputChange}
                                    required
                                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.5rem', fontSize: '0.875rem' }}
                                    placeholder="e.g., SBI Bank, Axis Bank, etc."
                                />
                            </div>

                            <div className="form-group" style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.25rem', color: '#1e293b' }}>
                                    GSTIN
                                </label>
                                <input
                                    type="text"
                                    name="gst_number"
                                    value={formData.gst_number}
                                    onChange={handleInputChange}
                                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.5rem', fontSize: '0.875rem', fontFamily: 'monospace', textTransform: 'uppercase' }}
                                    placeholder="e.g., 36AAAAA0000A1Z"
                                />
                            </div>

                            <div className="form-group" style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.25rem', color: '#1e293b' }}>
                                    Email
                                </label>
                                <input
                                    type="email"
                                    name="email"
                                    value={formData.email}
                                    onChange={handleInputChange}
                                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.5rem', fontSize: '0.875rem' }}
                                    placeholder="client@example.com"
                                />
                            </div>

                            <div className="form-group" style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.25rem', color: '#1e293b' }}>
                                    Phone
                                </label>
                                <input
                                    type="tel"
                                    name="phone"
                                    value={formData.phone}
                                    onChange={handleInputChange}
                                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.5rem', fontSize: '0.875rem' }}
                                    placeholder="e.g., 9876543210"
                                />
                            </div>
                            
                            <div className="form-group" style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.25rem', color: '#1e293b' }}>
                                    Branch
                                </label>
                                <input
                                    type="text"
                                    name="branch"
                                    value={formData.branch}
                                    onChange={handleInputChange}
                                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.5rem', fontSize: '0.875rem' }}
                                    placeholder="e.g., Sanath Nagar, Hyderabad"
                                />
                            </div>
                            
                            <div className="form-group" style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.25rem', color: '#1e293b' }}>
                                    Address
                                </label>
                                <textarea
                                    name="address"
                                    value={formData.address}
                                    onChange={handleInputChange}
                                    rows="3"
                                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.5rem', fontSize: '0.875rem', fontFamily: 'inherit' }}
                                    placeholder="Full address"
                                />
                            </div>

                            <div className="form-group" style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.25rem', color: '#1e293b' }}>
                                    Pay To Bank / Bank Settlement Profile
                                </label>
                                <select
                                    name="pay_to_bank_id"
                                    value={formData.pay_to_bank_id || ''}
                                    onChange={handleInputChange}
                                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.5rem', fontSize: '0.875rem', backgroundColor: 'white' }}
                                >
                                    <option value="">-- Select Settlement Bank (Optional) --</option>
                                    {banks.map(bank => (
                                        <option key={bank.id} value={bank.id}>
                                            {bank.bank_name} {bank.branch ? `(${bank.branch})` : ''} - A/C: {bank.account_number}
                                        </option>
                                    ))}
                                </select>
                                <small style={{ display: 'block', marginTop: '4px', fontSize: '0.7rem', color: '#64748b' }}>
                                    🏦 When selected in invoice creation, this bank profile will be automatically loaded as Pay To.
                                </small>
                            </div>
                            
                            <div className="modal-buttons" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                                <button type="button" onClick={() => {
                                    setShowModal(false);
                                    setEditingClient(null);
                                    resetForm();
                                }} style={{
                                    padding: '0.5rem 1rem',
                                    background: '#e2e8f0',
                                    border: 'none',
                                    borderRadius: '0.5rem',
                                    cursor: 'pointer',
                                    fontSize: '0.875rem'
                                }}>
                                    Cancel
                                </button>
                                <button type="submit" disabled={loading} style={{
                                    padding: '0.5rem 1rem',
                                    background: '#10b981',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '0.5rem',
                                    cursor: 'pointer',
                                    fontSize: '0.875rem',
                                    fontWeight: '600'
                                }}>
                                    {loading ? (editingClient ? 'Updating...' : 'Adding...') : (editingClient ? 'Update Client' : 'Add Client')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {notification && <Notification type={notification.type} message={notification.message} />}
        </>
    );
};

export default ClientManager;