const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class CloudSignerIntegration {
  constructor() {
    this.apiUrl = (process.env.CLOUDSIGNER_URL || '').replace(/\/+$/, '');
    this.apiKey = process.env.CLOUDSIGNER_API_KEY;
    this.certificateId = process.env.CLOUDSIGNER_CERTIFICATE_ID;
    this.accessToken = null;
    this.tokenExpiry = null;
    this.tokenRefreshBuffer = 300000; // 5 minutes buffer
  }

  /**
   * Generate and manage access token for CloudSigner API
   * Token is cached and refreshed automatically when approaching expiry
   */
  async getAccessToken() {
    const now = Date.now();

    // Return cached token if still valid
    if (this.accessToken && this.tokenExpiry && now < (this.tokenExpiry - this.tokenRefreshBuffer)) {
      return this.accessToken;
    }

    try {
      const response = await axios.post(`${this.apiUrl}/api/auth/token`, {
        apiKey: this.apiKey,
        certificateId: this.certificateId,
      }, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.data && response.data.token) {
        this.accessToken = response.data.token;
        // Set expiry based on response or default to 1 hour
        const expiresIn = (response.data.expiresIn || 3600) * 1000;
        this.tokenExpiry = Date.now() + expiresIn;

        console.log('[CloudSigner] Access token acquired successfully');
        return this.accessToken;
      } else {
        throw new Error('No token in response');
      }
    } catch (error) {
      console.error('[CloudSigner] Token generation failed:', error.message);
      throw new Error(`CloudSigner token generation failed: ${error.message}`);
    }
  }

  /**
   * Sign a PDF document
   * @param {Buffer} pdfBuffer - PDF file buffer
   * @param {string} signatureReason - Reason for signing
   * @param {string} signerName - Name of the signer
   * @returns {Promise<Buffer>} - Signed PDF buffer
   */
  async signPDF(pdfBuffer, signatureReason = 'Invoice Approval', signerName = 'System') {
    try {
      const token = await this.getAccessToken();

      // Convert PDF buffer to base64
      const pdfBase64 = pdfBuffer.toString('base64');

      const signRequest = {
        document: pdfBase64,
        documentFormat: 'PDF',
        signatureReason: signatureReason,
        signerName: signerName,
        certificateId: this.certificateId,
        signatureType: 'SIGNATURE',
        location: 'Digital',
      };

      const response = await axios.post(
        `${this.apiUrl}/api/sign/document`,
        signRequest,
        {
          timeout: 30000,
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.data && response.data.signedDocument) {
        const signedPdfBuffer = Buffer.from(response.data.signedDocument, 'base64');
        console.log('[CloudSigner] PDF signed successfully');
        return signedPdfBuffer;
      } else {
        throw new Error('No signed document in response');
      }
    } catch (error) {
      console.error('[CloudSigner] PDF signing failed:', error.message);
      throw new Error(`PDF signing failed: ${error.message}`);
    }
  }

  /**
   * Verify signature status of a PDF
   * @param {Buffer} pdfBuffer - PDF file buffer
   * @returns {Promise<Object>} - Signature verification details
   */
  async verifySignature(pdfBuffer) {
    try {
      const token = await this.getAccessToken();
      const pdfBase64 = pdfBuffer.toString('base64');

      const response = await axios.post(
        `${this.apiUrl}/api/verify/signature`,
        {
          document: pdfBase64,
          documentFormat: 'PDF',
        },
        {
          timeout: 15000,
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      console.log('[CloudSigner] Signature verification completed');
      return {
        isValid: response.data?.isValid || false,
        signatureDetails: response.data?.details || {},
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('[CloudSigner] Signature verification failed:', error.message);
      throw new Error(`Signature verification failed: ${error.message}`);
    }
  }

  /**
   * Check if CloudSigner service is available
   * @returns {Promise<boolean>}
   */
  async isServiceAvailable() {
    try {
      const response = await axios.get(
        `${this.apiUrl}/api/health`,
        { timeout: 5000 }
      );
      return response.status === 200;
    } catch (error) {
      console.warn('[CloudSigner] Service health check failed:', error.message);
      return false;
    }
  }

  /**
   * Refresh access token immediately
   */
  async refreshToken() {
    this.accessToken = null;
    this.tokenExpiry = null;
    return await this.getAccessToken();
  }

  /**
   * Get current token status
   */
  getTokenStatus() {
    const now = Date.now();
    return {
      hasToken: !!this.accessToken,
      isValid: this.tokenExpiry ? now < this.tokenExpiry : false,
      expiresIn: this.tokenExpiry ? Math.round((this.tokenExpiry - now) / 1000) : null,
      expiryTime: this.tokenExpiry ? new Date(this.tokenExpiry).toISOString() : null,
    };
  }
}

module.exports = new CloudSignerIntegration();
