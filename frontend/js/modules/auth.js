// Authentication Module
class AuthManager {
    constructor() {
        this.currentUser = null;
        this.isAuthenticated = false;
        this.isRegisterMode = false;
        this.storedApiKey = null;
        this.storedProvider = 'openai';
        this.storedModel = 'gpt-3.5-turbo';
        
        this.initializeElements();
        this.setupEventListeners();
        this.loadStoredApiKey();
    }

    initializeElements() {
        this.authModal = document.getElementById('authModal');
        this.authForm = document.getElementById('authForm');
        this.authTitle = document.getElementById('authTitle');
        this.authSwitchText = document.getElementById('authSwitchText');
        this.authSwitchLink = document.getElementById('authSwitchLink');
        this.loginBtn = document.getElementById('loginBtn');
        this.userInfo = document.getElementById('userInfo');
        this.usernameDisplay = document.getElementById('usernameDisplay');
    }

    setupEventListeners() {
        this.authForm.addEventListener('submit', this.handleAuthSubmit.bind(this));
    }

    showAuthModal() {
        this.authModal.classList.add('show');
        document.getElementById('username').focus();
    }

    closeAuthModal() {
        this.authModal.classList.remove('show');
        this.authForm.reset();
    }

    toggleAuthMode() {
        this.isRegisterMode = !this.isRegisterMode;
        this.updateAuthUI();
    }

    updateAuthUI() {
        if (this.isRegisterMode) {
            this.authTitle.textContent = 'Register';
            this.authSwitchText.textContent = 'Already have an account?';
            this.authSwitchLink.textContent = 'Login';
        } else {
            this.authTitle.textContent = 'Login';
            this.authSwitchText.textContent = "Don't have an account?";
            this.authSwitchLink.textContent = 'Register';
        }
    }

    async handleAuthSubmit(e) {
        e.preventDefault();
        const formData = new FormData(this.authForm);
        const username = formData.get('username');
        const password = formData.get('password');

        try {
            const response = await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username,
                    password,
                    action: this.isRegisterMode ? 'register' : 'login'
                })
            });

            const data = await response.json();
            if (data.success) {
                this.currentUser = { username };
                this.isAuthenticated = true;
                this.closeAuthModal();
                this.updateUIForAuthenticatedUser();
                showNotification(`Successfully ${this.isRegisterMode ? 'registered' : 'logged in'}!`, 'success');
                
                // Load user files after successful auth
                if (window.fileManager) {
                    window.fileManager.loadUserFiles();
                }
            } else {
                showNotification(data.message || 'Authentication failed', 'error');
            }
        } catch (error) {
            console.error('Auth error:', error);
            showNotification('Authentication failed: Network error', 'error');
        }
    }

    async validateSession(token) {
        try {
            const response = await fetch('/api/validate-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token })
            });

            const data = await response.json();
            if (data.success) {
                this.currentUser = { username: data.username };
                this.isAuthenticated = true;
                this.updateUIForAuthenticatedUser();
                
                // Load user files after session validation
                if (window.fileManager) {
                    window.fileManager.loadUserFiles();
                }
            } else {
                this.updateUIForUnauthenticatedUser();
            }
        } catch (error) {
            console.error('Session validation error:', error);
            this.updateUIForUnauthenticatedUser();
        }
    }

    logout() {
        this.currentUser = null;
        this.isAuthenticated = false;
        
        // Clear session cookie
        document.cookie = 'session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
        
        this.updateUIForUnauthenticatedUser();
        showNotification('Logged out successfully', 'info');
        
        // Clear any loaded files
        if (window.fileManager) {
            window.fileManager.clearFiles();
        }
        if (window.editorManager) {
            window.editorManager.closeCurrentFile();
        }
    }

    updateUIForAuthenticatedUser() {
        this.loginBtn.style.display = 'none';
        this.userInfo.style.display = 'flex';
        this.usernameDisplay.textContent = this.currentUser.username;
    }

    updateUIForUnauthenticatedUser() {
        this.loginBtn.style.display = 'block';
        this.userInfo.style.display = 'none';
    }

    checkAuthentication() {
        const sessionToken = this.getCookie('session');
        if (sessionToken) {
            this.validateSession(sessionToken);
        } else {
            this.updateUIForUnauthenticatedUser();
        }
    }

    getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
    }

    // API Key Management
    async loadStoredApiKey() {
        try {
            const response = await fetch('/api/get-api-key', {
                method: 'GET',
                credentials: 'include'
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    this.storedApiKey = data.api_key || '';
                    this.storedProvider = data.provider || 'openai';
                    this.storedModel = data.model || 'gpt-3.5-turbo';
                    
                    // Update UI if API key modal is open
                    const apiKeyInput = document.getElementById('apiKeyInput');
                    const providerSelect = document.getElementById('apiKeyProvider');
                    const modelSelect = document.getElementById('apiKeyModel');
                    
                    if (apiKeyInput) apiKeyInput.value = this.storedApiKey;
                    if (providerSelect) providerSelect.value = this.storedProvider;
                    if (modelSelect) modelSelect.value = this.storedModel;
                }
            }
        } catch (error) {
            console.error('Error loading API key:', error);
        }
    }

    showApiKeyModal() {
        const modal = document.getElementById('apiKeyModal');
        if (modal) {
            // Load current values
            const apiKeyInput = document.getElementById('apiKeyInput');
            const providerSelect = document.getElementById('apiKeyProvider');
            const modelSelect = document.getElementById('apiKeyModel');
            
            if (apiKeyInput) apiKeyInput.value = this.storedApiKey || '';
            if (providerSelect) providerSelect.value = this.storedProvider || 'openai';
            if (modelSelect) modelSelect.value = this.storedModel || 'gpt-3.5-turbo';
            
            modal.classList.add('show');
        }
    }

    closeApiKeyModal() {
        const modal = document.getElementById('apiKeyModal');
        if (modal) modal.classList.remove('show');
    }

    async saveApiKeyAndClose() {
        console.log('saveApiKeyAndClose called');
        const apiKeyInput = document.getElementById('apiKeyInput');
        const providerSelect = document.getElementById('apiKeyProvider');
        const modelSelect = document.getElementById('apiKeyModel');
        
        console.log('Elements found:', { apiKeyInput, providerSelect, modelSelect });
        
        if (apiKeyInput && providerSelect && modelSelect) {
            const apiKey = apiKeyInput.value.trim();
            const provider = providerSelect.value;
            const model = modelSelect.value;
            
            console.log('Values:', { apiKey: apiKey ? '***' : 'empty', provider, model });
            
            if (!apiKey) {
                showNotification('Please enter a valid API key', 'error');
                return;
            }
            
            try {
                console.log('Sending API key save request...');
                const response = await fetch('/api/save-api-key', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        api_key: apiKey,
                        provider: provider,
                        model: model
                    })
                });
                
                console.log('Response status:', response.status);
                
                if (response.ok) {
                    const data = await response.json();
                    console.log('Response data:', data);
                    if (data.success) {
                        this.storedApiKey = apiKey;
                        this.storedProvider = provider;
                        this.storedModel = model;
                        
                        this.closeApiKeyModal();
                        showNotification('API key saved successfully', 'success');
                    } else {
                        showNotification(data.message || 'Failed to save API key', 'error');
                    }
                } else {
                    showNotification('Failed to save API key', 'error');
                }
            } catch (error) {
                console.error('Error saving API key:', error);
                showNotification('Failed to save API key: Network error', 'error');
            }
        } else {
            console.error('Required elements not found');
            showNotification('Error: Required form elements not found', 'error');
        }
    }
}

// Export for use in other modules
window.AuthManager = AuthManager; 