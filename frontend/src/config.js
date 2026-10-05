// frontend/src/config.js

const getApiBaseUrl = () => {
    if (process.env.REACT_APP_API_URL) {
        return process.env.REACT_APP_API_URL;
    }

    const hostname = window.location.hostname || 'localhost';

    // Production: IIS HTTPS → reverse proxy → Node.js HTTP :5000
    if (window.location.protocol === 'https:') {
        return `https://${hostname}`;
    }

    // Local development
    return `http://${hostname}:5000`;
};

export const API_BASE_URL = getApiBaseUrl();
export const API_URL = `${API_BASE_URL}/api`;

export default API_BASE_URL;