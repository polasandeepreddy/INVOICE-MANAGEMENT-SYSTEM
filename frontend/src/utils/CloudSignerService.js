// Frontend Integration Example
// Place this in your React components directory

/**
 * CloudSigner Integration Service
 * Handles all interactions with CloudSigner signing API
 */

class CloudSignerService {
  constructor(baseURL = 'http://localhost:5000/api/invoice') {
    this.baseURL = baseURL;
    this.tokenStatus = null;
    this.lastTokenCheck = null;
  }

  /**
   * Generate and sign PDF
   */
  async generateSignedPDF(invoiceData) {
    try {
      const response = await fetch(`${this.baseURL}/generate-signed-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          html: invoiceData.html,
          invoiceId: invoiceData.id,
          signerName: invoiceData.signerName || 'System',
          signatureReason: invoiceData.reason || 'Invoice Approval'
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || 'Failed to sign PDF');
      }

      const result = await response.json();
      console.log('PDF Signed:', result.signed.fileName);
      return result;

    } catch (error) {
      console.error('PDF Signing Error:', error);
      throw error;
    }
  }

  /**
   * Generate unsigned PDF
   */
  async generatePDF(html, invoiceId) {
    try {
      const response = await fetch(`${this.baseURL}/generate-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          html,
          invoiceId
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || 'Failed to generate PDF');
      }

      const result = await response.json();
      return result;

    } catch (error) {
      console.error('PDF Generation Error:', error);
      throw error;
    }
  }

  /**
   * Check CloudSigner token status
   */
  async checkTokenStatus() {
    try {
      const response = await fetch(`${this.baseURL}/cloudsigner/token-status`);
      const data = await response.json();
      
      this.tokenStatus = data.tokenStatus;
      this.lastTokenCheck = new Date();
      
      return data.tokenStatus;

    } catch (error) {
      console.error('Token Status Check Error:', error);
      throw error;
    }
  }

  /**
   * Refresh CloudSigner token
   */
  async refreshToken() {
    try {
      const response = await fetch(`${this.baseURL}/cloudsigner/refresh-token`, {
        method: 'POST'
      });

      const data = await response.json();
      this.tokenStatus = data.tokenStatus;
      console.log('Token Refreshed');
      return data.tokenStatus;

    } catch (error) {
      console.error('Token Refresh Error:', error);
      throw error;
    }
  }

  /**
   * Get storage statistics
   */
  async getStorageStats() {
    try {
      const response = await fetch(`${this.baseURL}/pdf-storage/stats`);
      const data = await response.json();
      return data.statistics;

    } catch (error) {
      console.error('Storage Stats Error:', error);
      throw error;
    }
  }

  /**
   * Get all PDFs for an invoice
   */
  async getInvoicePDFs(invoiceId) {
    try {
      const response = await fetch(`${this.baseURL}/pdf-storage/invoice/${invoiceId}`);
      const data = await response.json();
      return data;

    } catch (error) {
      console.error('Get Invoice PDFs Error:', error);
      throw error;
    }
  }

  /**
   * Verify PDF signature
   */
  async verifySignature(pdfBuffer, invoiceId) {
    try {
      const response = await fetch(`${this.baseURL}/cloudsigner/verify-signature`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pdfBuffer: pdfBuffer.toString('base64'),
          invoiceId
        })
      });

      const data = await response.json();
      return data.verification;

    } catch (error) {
      console.error('Signature Verification Error:', error);
      throw error;
    }
  }

  /**
   * Check if token needs refresh (helper)
   */
  isTokenExpiringSoon() {
    if (!this.tokenStatus) return true;
    return this.tokenStatus.expiresIn < 300; // Less than 5 minutes
  }

  /**
   * Ensure valid token before signing
   */
  async ensureValidToken() {
    const status = await this.checkTokenStatus();
    if (!status.isValid || this.isTokenExpiringSoon()) {
      return await this.refreshToken();
    }
    return status;
  }
}

// Export singleton instance
export const cloudSignerService = new CloudSignerService();

// =============================================================================
// REACT HOOK - Use in your components
// =============================================================================

import { useState, useEffect } from 'react';

export const useCloudSigner = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [tokenStatus, setTokenStatus] = useState(null);

  const signInvoice = async (invoiceData) => {
    setIsLoading(true);
    setError(null);
    try {
      // Ensure token is valid
      await cloudSignerService.ensureValidToken();
      
      // Sign the PDF
      const result = await cloudSignerService.generateSignedPDF(invoiceData);
      setTokenStatus(cloudSignerService.tokenStatus);
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const checkToken = async () => {
    try {
      const status = await cloudSignerService.checkTokenStatus();
      setTokenStatus(status);
      return status;
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    // Check token on mount
    checkToken();
  }, []);

  return {
    signInvoice,
    checkToken,
    isLoading,
    error,
    tokenStatus
  };
};

// =============================================================================
// REACT COMPONENT EXAMPLE
// =============================================================================

// Usage in your Invoice component:
/*
import React from 'react';
import { useCloudSigner } from './cloudSignerService';

export const InvoiceSigningComponent = ({ invoiceData, htmlContent }) => {
  const { signInvoice, checkToken, isLoading, error, tokenStatus } = useCloudSigner();

  const handleSignInvoice = async () => {
    try {
      const result = await signInvoice({
        html: htmlContent,
        id: invoiceData.invoiceNumber,
        signerName: 'Admin',
        reason: 'Invoice Approval'
      });

      console.log('Signed PDF saved:', result.signed.relativePath);
      // Show success message
      alert('Invoice signed successfully!');
      // Refresh invoice list or redirect
    } catch (err) {
      console.error('Signing failed:', err);
      alert('Failed to sign invoice: ' + err.message);
    }
  };

  const handleRefreshToken = async () => {
    try {
      await checkToken();
      alert('Token status checked!');
    } catch (err) {
      alert('Failed to check token: ' + err.message);
    }
  };

  return (
    <div className="invoice-signing">
      {error && <div className="error-banner">{error}</div>}
      
      {tokenStatus && (
        <div className="token-status">
          <p>Token Status: {tokenStatus.isValid ? '✅ Valid' : '❌ Invalid'}</p>
          {tokenStatus.expiresIn && (
            <p>Expires in: {Math.floor(tokenStatus.expiresIn / 60)} minutes</p>
          )}
        </div>
      )}

      <button 
        onClick={handleSignInvoice}
        disabled={isLoading}
      >
        {isLoading ? 'Signing...' : 'Sign Invoice with CloudSigner'}
      </button>

      <button 
        onClick={handleRefreshToken}
        className="secondary"
      >
        Check Token Status
      </button>
    </div>
  );
};
*/

// =============================================================================
// TESTING UTILITIES
// =============================================================================

/**
 * Test CloudSigner Integration
 */
export const testCloudSignerIntegration = async () => {
  const service = new CloudSignerService();

  console.log('🧪 Testing CloudSigner Integration...\n');

  try {
    // Test 1: Check token
    console.log('1️⃣  Checking token status...');
    const tokenStatus = await service.checkTokenStatus();
    console.log('✅ Token Status:', tokenStatus);

    // Test 2: Check storage stats
    console.log('\n2️⃣  Checking storage statistics...');
    const stats = await service.getStorageStats();
    console.log('✅ Storage Stats:', stats);

    console.log('\n✨ All tests passed!');
    return true;

  } catch (error) {
    console.error('❌ Test failed:', error);
    return false;
  }
};

// =============================================================================
// CONFIGURATION EXAMPLES
// =============================================================================

/**
 * Different configurations for different environments
 */
export const CloudSignerConfig = {
  development: {
    baseURL: 'http://localhost:5000/api/invoice',
    autoRefreshToken: true,
    tokenRefreshBuffer: 300000 // 5 minutes
  },
  
  production: {
    baseURL: '/api/invoice', // Use relative path
    autoRefreshToken: true,
    tokenRefreshBuffer: 600000 // 10 minutes
  }
};

// Usage: new CloudSignerService(CloudSignerConfig.production.baseURL)
