// BankAccountManager.js - Fields in order: Bank Name, Branch Name, Account Number, IFSC Code, Account Holder Name
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../config';

const BankAccountManager = ({ userRole, onBankAdded, onBankDeleted }) => {
    const [banks, setBanks] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showAddForm, setShowAddForm] = useState(false);
    const [editingBank, setEditingBank] = useState(null);
    const [formData, setFormData] = useState({
        bank_name: '',           // 1. Bank Name
        branch: '',              // 2. Branch Name
        account_number: '',      // 3. Account Number
        ifsc_code: '',           // 4. IFSC Code
        account_holder: '',      // 5. Account Holder Name
        is_default: false
    });
    const [notification, setNotification] = useState(null);

    // API_URL imported from ../config

    useEffect(() => {
        fetchBanks();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fetchBanks = async () => {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                console.error('No token found');
                return;
            }
            
            const response = await axios.get(`${API_URL}/banks`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            console.log('Fetched banks:', response.data);
            setBanks(response.data);
        } catch (error) {
            console.error('Failed to load banks:', error);
            showNotification('error', 'Failed to load bank accounts: ' + (error.response?.data?.error || error.message));
        }
    };

    const handleInputChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        
        try {
            const token = localStorage.getItem('token');
            const config = {
                headers: { Authorization: `Bearer ${token}` }
            };
            
            if (editingBank) {
                // Update existing bank
                await axios.put(`${API_URL}/banks/${editingBank.id}`, formData, config);
                showNotification('success', 'Bank account updated successfully');
            } else {
                // Create new bank
                await axios.post(`${API_URL}/banks`, formData, config);
                showNotification('success', 'Bank account added successfully');
            }
            
            await fetchBanks();
            resetForm();
            setShowAddForm(false);
            if (onBankAdded) onBankAdded();
            
        } catch (error) {
            console.error('Save error:', error);
            showNotification('error', error.response?.data?.error || 'Failed to save bank account');
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (bank) => {
        setEditingBank(bank);
        setFormData({
            bank_name: bank.bank_name,           // 1. Bank Name
            branch: bank.branch || '',           // 2. Branch Name
            account_number: bank.account_number, // 3. Account Number
            ifsc_code: bank.ifsc_code,           // 4. IFSC Code
            account_holder: bank.account_holder, // 5. Account Holder Name
            is_default: bank.is_default === 1 || bank.is_default === true
        });
        setShowAddForm(true);
    };

    const handleDelete = async (bankId) => {
        if (window.confirm('Are you sure you want to delete this bank account?')) {
            try {
                const token = localStorage.getItem('token');
                await axios.delete(`${API_URL}/banks/${bankId}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                showNotification('success', 'Bank account deleted successfully');
                await fetchBanks();
                if (onBankDeleted) onBankDeleted();
            } catch (error) {
                console.error('Delete error:', error);
                showNotification('error', error.response?.data?.error || 'Failed to delete bank account');
            }
        }
    };

    const handleSetDefault = async (bankId) => {
        try {
            const token = localStorage.getItem('token');
            await axios.patch(`${API_URL}/banks/${bankId}/set-default`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            showNotification('success', 'Default bank account updated');
            await fetchBanks();
        } catch (error) {
            console.error('Set default error:', error);
            showNotification('error', error.response?.data?.error || 'Failed to set default bank');
        }
    };

    const resetForm = () => {
        setEditingBank(null);
        setFormData({
            bank_name: '',      // 1. Bank Name
            branch: '',         // 2. Branch Name
            account_number: '', // 3. Account Number
            ifsc_code: '',      // 4. IFSC Code
            account_holder: '', // 5. Account Holder Name
            is_default: false
        });
    };

    const showNotification = (type, message) => {
        setNotification({ type, message });
        setTimeout(() => setNotification(null), 3000);
    };

    if (userRole !== 'admin') {
        return (
            <div style={{ padding: '2rem', textAlign: 'center' }}>
                <p>⚠️ You don't have permission to manage bank accounts.</p>
            </div>
        );
    }

    return (
        <div className="bank-manager" style={{ padding: '1.5rem' }}>
            <div className="bank-manager-header" style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                marginBottom: '1.5rem', 
                flexWrap: 'wrap', 
                gap: '1rem' 
            }}>
                <h3 style={{ margin: 0 }}>🏦 Manage Bank Accounts</h3>
                {!showAddForm && (
                    <button 
                        onClick={() => setShowAddForm(true)}
                        style={{
                            background: '#3b82f6',
                            color: 'white',
                            border: 'none',
                            padding: '0.5rem 1rem',
                            borderRadius: '0.5rem',
                            cursor: 'pointer',
                            fontWeight: '600'
                        }}
                    >
                        + Add New Bank Account
                    </button>
                )}
            </div>

            {showAddForm && (
                <div style={{ 
                    background: '#f8fafc', 
                    padding: '1.5rem', 
                    borderRadius: '1rem', 
                    marginBottom: '1.5rem',
                    border: '1px solid #e2e8f0'
                }}>
                    <h4 style={{ marginTop: 0, marginBottom: '1rem' }}>
                        {editingBank ? '✏️ Edit Bank Account' : '➕ Add New Bank Account'}
                    </h4>
                    <form onSubmit={handleSubmit}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                            {/* 1. Bank Name */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.25rem', color: '#1e293b' }}>
                                    Bank Name <span style={{ color: '#ef4444' }}>*</span>
                                </label>
                                <input
                                    type="text"
                                    name="bank_name"
                                    value={formData.bank_name}
                                    onChange={handleInputChange}
                                    required
                                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.5rem', fontSize: '0.875rem' }}
                                    placeholder="e.g., AXIS BANK LIMITED"
                                />
                            </div>
                            
                            {/* 2. Branch Name */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.25rem', color: '#1e293b' }}>
                                    Branch Name
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
                            
                            {/* 3. Account Number */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.25rem', color: '#1e293b' }}>
                                    Account Number <span style={{ color: '#ef4444' }}>*</span>
                                </label>
                                <input
                                    type="text"
                                    name="account_number"
                                    value={formData.account_number}
                                    onChange={handleInputChange}
                                    required
                                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.5rem', fontSize: '0.875rem', fontFamily: 'monospace' }}
                                    placeholder="e.g., 922020060131840"
                                />
                            </div>
                            
                            {/* 4. IFSC Code */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.25rem', color: '#1e293b' }}>
                                    IFSC Code <span style={{ color: '#ef4444' }}>*</span>
                                </label>
                                <input
                                    type="text"
                                    name="ifsc_code"
                                    value={formData.ifsc_code}
                                    onChange={handleInputChange}
                                    required
                                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.5rem', fontSize: '0.875rem', fontFamily: 'monospace', textTransform: 'uppercase' }}
                                    placeholder="e.g., UTIB0000425"
                                />
                            </div>
                            
                            {/* 5. Account Holder Name */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.25rem', color: '#1e293b' }}>
                                    Account Holder Name <span style={{ color: '#ef4444' }}>*</span>
                                </label>
                                <input
                                    type="text"
                                    name="account_holder"
                                    value={formData.account_holder}
                                    onChange={handleInputChange}
                                    required
                                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.5rem', fontSize: '0.875rem' }}
                                    placeholder="e.g., JAYARAMA ASSOCIATES"
                                />
                            </div>
                            
                            {/* Set as Default Checkbox */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        name="is_default"
                                        checked={formData.is_default}
                                        onChange={handleInputChange}
                                    />
                                    <span style={{ fontSize: '0.875rem' }}>Set as Default Account</span>
                                </label>
                            </div>
                        </div>
                        
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                            <button
                                type="button"
                                onClick={() => {
                                    resetForm();
                                    setShowAddForm(false);
                                }}
                                style={{ padding: '0.5rem 1rem', background: '#e2e8f0', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.875rem' }}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                style={{ padding: '0.5rem 1rem', background: '#10b981', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.875rem', fontWeight: '600' }}
                            >
                                {loading ? 'Saving...' : (editingBank ? 'Update' : 'Save')}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Bank Accounts List */}
            <div className="banks-list">
                {banks.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                        No bank accounts configured. Click "Add New Bank Account" to get started.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {banks.map(bank => (
                            <div key={bank.id} style={{ 
                                background: 'white', 
                                border: bank.is_default ? '2px solid #10b981' : '1px solid #e2e8f0',
                                borderRadius: '0.75rem',
                                padding: '1rem',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                flexWrap: 'wrap',
                                gap: '1rem'
                            }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                                        <strong style={{ fontSize: '1rem' }}>{bank.bank_name}</strong>
                                        {bank.branch && (
                                            <span style={{ background: '#8b5cf6', color: 'white', padding: '0.2rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.7rem', fontWeight: '600' }}>
                                                📍 {bank.branch}
                                            </span>
                                        )}
                                        {bank.is_default && (
                                            <span style={{ background: '#10b981', color: 'white', padding: '0.2rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.7rem', fontWeight: '600' }}>
                                                DEFAULT
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: '#475569' }}>
                                        <div><span style={{ fontWeight: '500' }}>A/C:</span> <span style={{ fontFamily: 'monospace' }}>{bank.account_number}</span> | <span style={{ fontWeight: '500' }}>IFSC:</span> <span style={{ fontFamily: 'monospace' }}>{bank.ifsc_code}</span></div>
                                        <div><span style={{ fontWeight: '500' }}>Holder:</span> {bank.account_holder}</div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    {!bank.is_default && (
                                        <button
                                            onClick={() => handleSetDefault(bank.id)}
                                            style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '0.4rem 0.8rem', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.7rem' }}
                                        >
                                            Set Default
                                        </button>
                                    )}
                                    <button
                                        onClick={() => handleEdit(bank)}
                                        style={{ background: '#f59e0b', color: 'white', border: 'none', padding: '0.4rem 0.8rem', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.7rem' }}
                                    >
                                        Edit
                                    </button>
                                    <button
                                        onClick={() => handleDelete(bank.id)}
                                        style={{ background: '#ef4444', color: 'white', border: 'none', padding: '0.4rem 0.8rem', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.7rem' }}
                                    >
                                        Delete
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {notification && (
                <div style={{
                    position: 'fixed',
                    bottom: '1rem',
                    right: '1rem',
                    padding: '0.75rem 1rem',
                    borderRadius: '0.5rem',
                    background: notification.type === 'success' ? '#10b981' : '#ef4444',
                    color: 'white',
                    zIndex: 1000,
                    animation: 'slideIn 0.3s ease-out'
                }}>
                    {notification.message}
                </div>
            )}

            <style jsx>{`
                @keyframes slideIn {
                    from {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
            `}</style>
        </div>
    );
};

export default BankAccountManager;