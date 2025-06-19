// Main Application
class WebEditorApp {
    constructor() {
        this.modules = {};
        this.initializeModules();
        this.setupGlobalFunctions();
        this.initializeApp();
    }

    initializeModules() {
        // Initialize all modules
        this.modules.auth = new AuthManager();
        this.modules.fileManager = new FileManager();
        this.modules.editorManager = new EditorManager();
        this.modules.chatManager = new ChatManager();
        this.modules.searchManager = new SearchManager();
        this.modules.panelManager = new PanelManager();
        this.modules.terminalManager = new TerminalManager();
        
        // Make modules globally accessible
        window.authManager = this.modules.auth;
        window.fileManager = this.modules.fileManager;
        window.editorManager = this.modules.editorManager;
        window.chatManager = this.modules.chatManager;
        window.searchManager = this.modules.searchManager;
        window.panelManager = this.modules.panelManager;
        window.terminalManager = this.modules.terminalManager;
    }

    setupGlobalFunctions() {
        // Global utility functions
        window.showNotification = this.showNotification.bind(this);
        window.hideNotification = this.hideNotification.bind(this);
        
        // Global event handlers
        window.showAuthModal = () => this.modules.auth.showAuthModal();
        window.closeAuthModal = () => this.modules.auth.closeAuthModal();
        window.toggleAuthMode = () => this.modules.auth.toggleAuthMode();
        window.logout = () => this.modules.auth.logout();
        
        window.showCreateFileModal = () => this.modules.fileManager.showCreateFileModal();
        window.closeCreateFileModal = () => this.modules.fileManager.closeCreateFileModal();
        window.showCreateDirectoryModal = () => this.modules.fileManager.showCreateDirectoryModal();
        window.closeCreateDirectoryModal = () => this.modules.fileManager.closeCreateDirectoryModal();
        
        window.saveCurrentFile = () => this.modules.editorManager.saveCurrentFile();
        window.deleteCurrentFile = () => this.modules.editorManager.deleteCurrentFile();
        
        window.showChatPanel = () => this.modules.chatManager.showChatPanel();
        window.hideChatPanel = () => this.modules.chatManager.hideChatPanel();
        window.showApiKeyModal = () => this.modules.auth.showApiKeyModal();
        window.closeApiKeyModal = () => this.modules.auth.closeApiKeyModal();
        window.saveApiKeyAndClose = async () => {
            console.log('Global saveApiKeyAndClose called');
            try {
                await this.modules.auth.saveApiKeyAndClose();
            } catch (error) {
                console.error('Error in global saveApiKeyAndClose:', error);
            }
        };
        
        window.showSearchModal = () => this.modules.searchManager.showSearchModal();
        window.closeSearchModal = () => this.modules.searchManager.closeSearchModal();
        
        // Panel management functions
        window.showFilesPanel = () => this.modules.panelManager.showFilesPanel();
        window.showVCSPanel = () => this.modules.panelManager.showVCSPanel();
        window.showTerminalPanel = () => this.modules.panelManager.showTerminalPanel();
        window.showChatPanel = () => this.modules.chatManager.showChatPanel();
        
        // Navigation functions
        window.navigateToRoot = () => this.modules.fileManager.navigateToRoot();
        window.navigateToPath = (path) => this.modules.fileManager.navigateToPath(path);
        
        window.triggerFileUpload = () => this.modules.fileManager.triggerFileUpload();
        window.triggerFolderUpload = () => this.modules.fileManager.triggerFolderUpload();
    }

    initializeApp() {
        console.log('Initializing Web Editor application...');
        
        // Check authentication
        this.modules.auth.checkAuthentication();
        
        // Warn if opened as file://
        if (window.location.protocol === 'file:') {
            alert('Please open this app via http://localhost:8080/ and not as a file:// URL. Authentication will not work otherwise.');
        }
        
        // Setup file upload handlers
        this.setupFileUploadHandlers();
        
        // Setup panel management
        this.setupPanelManagement();
        
        console.log('Web Editor application initialized successfully');
    }

    setupFileUploadHandlers() {
        const fileUploadInput = document.getElementById('fileUploadInput');
        const folderUploadInput = document.getElementById('folderUploadInput');
        
        if (fileUploadInput) {
            fileUploadInput.addEventListener('change', (e) => this.modules.fileManager.handleFileUpload(e));
        }
        
        if (folderUploadInput) {
            folderUploadInput.addEventListener('change', (e) => this.modules.fileManager.handleFolderUpload(e));
        }
    }

    setupPanelManagement() {
        // Panel management is now handled by global functions set up in setupGlobalFunctions()
        // The HTML buttons have onclick handlers that call these global functions
        console.log('Panel management setup complete');
    }

    showPanel(panelName, config) {
        // This method is no longer needed since we use global functions
        console.log('showPanel called for:', panelName);
    }

    hideAllPanels() {
        // This method is no longer needed since we use global functions
        console.log('hideAllPanels called');
    }

    showFilesPanel() {
        this.modules.panelManager.showFilesPanel();
    }

    showVCSPanel() {
        this.modules.panelManager.showVCSPanel();
    }

    showTerminalPanel() {
        this.modules.panelManager.showTerminalPanel();
    }

    showSearchModal() {
        this.modules.searchManager.showSearchModal();
    }

    setTopbarActive(btnId) {
        // Remove active class from all topbar buttons
        document.querySelectorAll('.btn-topbar').forEach(btn => {
            btn.classList.remove('active');
        });
        
        // Add active class to the clicked button
        const activeBtn = document.getElementById(btnId);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.getElementById('notification');
        if (!notification) return;
        
        // Clear any existing timeout
        if (this.notificationTimeout) {
            clearTimeout(this.notificationTimeout);
        }
        
        // Clear any existing notification first
        notification.classList.remove('show');
        notification.textContent = '';
        notification.className = 'notification';
        
        // Force a reflow to ensure the hide animation completes
        notification.offsetHeight;
        
        // Set the new notification
        notification.textContent = message;
        notification.className = `notification ${type}`;
        
        // Force a reflow to ensure the class change is applied
        notification.offsetHeight;
        
        // Show the notification
        notification.classList.add('show');
        
        // Set timeout to hide the notification
        this.notificationTimeout = setTimeout(() => {
            this.hideNotification();
        }, 5000);
    }

    hideNotification() {
        const notification = document.getElementById('notification');
        if (notification) {
            notification.classList.remove('show');
            
            // Clear the timeout
            if (this.notificationTimeout) {
                clearTimeout(this.notificationTimeout);
                this.notificationTimeout = null;
            }
            
            // Clear the content after animation
            setTimeout(() => {
                notification.textContent = '';
                notification.className = 'notification';
            }, 300); // Match the CSS transition duration
        }
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new WebEditorApp();
}); 