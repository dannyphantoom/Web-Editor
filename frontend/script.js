// Global state
let currentUser = null;
let currentFile = null;
let files = [];
let isAuthenticated = false;
let isRegisterMode = false;
let hasUnsavedChanges = false;

// DOM elements
const authModal = document.getElementById('authModal');
const authForm = document.getElementById('authForm');
const authTitle = document.getElementById('authTitle');
const authSwitchText = document.getElementById('authSwitchText');
const authSwitchLink = document.getElementById('authSwitchLink');
const loginBtn = document.getElementById('loginBtn');
const userInfo = document.getElementById('userInfo');
const usernameDisplay = document.getElementById('usernameDisplay');
const sidebar = document.getElementById('sidebar');
const fileList = document.getElementById('fileList');
const editor = document.getElementById('editor');
const currentFileName = document.getElementById('currentFileName');
const fileStatus = document.getElementById('fileStatus');
const saveBtn = document.getElementById('saveBtn');
const deleteBtn = document.getElementById('deleteBtn');
const createFileModal = document.getElementById('createFileModal');
const createFileForm = document.getElementById('createFileForm');
const createDirectoryModal = document.getElementById('createDirectoryModal');
const createDirectoryForm = document.getElementById('createDirectoryForm');
const notification = document.getElementById('notification');

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupEventListeners();
    checkAuthentication();
});

function initializeApp() {
    // Check if user is already authenticated
    const sessionToken = getCookie('session');
    if (sessionToken) {
        // Validate session with server
        validateSession(sessionToken);
    }
}

function setupEventListeners() {
    // Auth form submission
    authForm.addEventListener('submit', handleAuthSubmit);
    
    // Create file form submission
    createFileForm.addEventListener('submit', handleCreateFile);
    
    // Create directory form submission
    createDirectoryForm.addEventListener('submit', handleCreateDirectory);
    
    // Editor changes
    editor.addEventListener('input', handleEditorChange);
    
    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboardShortcuts);
    
    // Auto-save functionality
    let autoSaveTimeout;
    editor.addEventListener('input', function() {
        clearTimeout(autoSaveTimeout);
        autoSaveTimeout = setTimeout(autoSave, 2000); // Auto-save after 2 seconds of inactivity
    });
}

// Authentication functions
function showAuthModal() {
    authModal.classList.add('show');
    document.getElementById('username').focus();
}

function closeAuthModal() {
    authModal.classList.remove('show');
    authForm.reset();
    isRegisterMode = false;
    updateAuthUI();
}

function toggleAuthMode() {
    isRegisterMode = !isRegisterMode;
    updateAuthUI();
}

function updateAuthUI() {
    if (isRegisterMode) {
        authTitle.textContent = 'Register';
        authSwitchText.textContent = 'Already have an account?';
        authSwitchLink.textContent = 'Login';
        authForm.querySelector('button[type="submit"]').textContent = 'Register';
    } else {
        authTitle.textContent = 'Login';
        authSwitchText.textContent = "Don't have an account?";
        authSwitchLink.textContent = 'Register';
        authForm.querySelector('button[type="submit"]').textContent = 'Login';
    }
}

async function handleAuthSubmit(e) {
    e.preventDefault();
    
    const formData = new FormData(authForm);
    const username = formData.get('username');
    const password = formData.get('password');
    
    if (!username || !password) {
        showNotification('Please fill in all fields', 'error');
        return;
    }
    
    const endpoint = isRegisterMode ? '/api/register' : '/api/login';
    
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(data.message, 'success');
            closeAuthModal();
            
            if (isRegisterMode) {
                // Switch to login mode after successful registration
                isRegisterMode = false;
                updateAuthUI();
            } else {
                // Login successful
                currentUser = username;
                isAuthenticated = true;
                updateUIForAuthenticatedUser();
                loadUserFiles();
            }
        } else {
            showNotification(data.message, 'error');
        }
    } catch (error) {
        console.error('Auth error:', error);
        showNotification('An error occurred. Please try again.', 'error');
    }
}

async function validateSession(token) {
    try {
        const response = await fetch('/api/files', {
            method: 'GET',
            headers: {
                'Cookie': `session=${token}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                // Session is valid, extract username from response or cookie
                currentUser = extractUsernameFromToken(token); // You might need to implement this
                isAuthenticated = true;
                updateUIForAuthenticatedUser();
                loadUserFiles();
            }
        }
    } catch (error) {
        console.error('Session validation error:', error);
    }
}

function logout() {
    fetch('/api/logout', {
        method: 'POST',
        credentials: 'include'
    }).finally(() => {
        currentUser = null;
        isAuthenticated = false;
        currentFile = null;
        files = [];
        hasUnsavedChanges = false;
        
        // Clear cookies
        document.cookie = 'session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
        
        updateUIForUnauthenticatedUser();
        showNotification('Logged out successfully', 'info');
    });
}

// File management functions
async function loadUserFiles() {
    try {
        const response = await fetch('/api/files', {
            method: 'GET',
            credentials: 'include'
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                files = data.files || [];
                renderFileList();
            }
        }
    } catch (error) {
        console.error('Error loading files:', error);
        showNotification('Failed to load files', 'error');
    }
}

function renderFileList() {
    if (files.length === 0) {
        fileList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-folder-open"></i>
                <p>No files yet</p>
                <div class="empty-state-actions">
                    <button class="btn btn-secondary" onclick="showCreateFileModal()">Create your first file</button>
                    <button class="btn btn-secondary" onclick="showCreateDirectoryModal()">Create a directory</button>
                </div>
            </div>
        `;
        return;
    }
    
    fileList.innerHTML = files.map(file => `
        <div class="file-item ${currentFile && currentFile.name === file.name ? 'active' : ''} ${file.isDirectory ? 'directory' : ''}" 
             onclick="${file.isDirectory ? 'openDirectory' : 'openFile'}('${file.name}')">
            <i class="fas ${file.isDirectory ? 'fa-folder' : 'fa-file-alt'}"></i>
            <div class="file-info">
                <div class="file-name">${file.name}</div>
                <div class="file-meta">${file.isDirectory ? 'Directory' : formatFileSize(file.size)} • ${formatDate(file.lastModified)}</div>
            </div>
        </div>
    `).join('');
}

async function openFile(filename) {
    try {
        const response = await fetch(`/api/file?filename=${encodeURIComponent(filename)}`, {
            method: 'GET',
            credentials: 'include'
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                currentFile = {
                    name: filename,
                    content: decodeURIComponent(data.content),
                    originalContent: decodeURIComponent(data.content)
                };
                
                editor.value = currentFile.content;
                editor.disabled = false;
                currentFileName.textContent = filename;
                fileStatus.textContent = 'Saved';
                fileStatus.className = 'file-status saved';
                saveBtn.disabled = true;
                deleteBtn.disabled = false;
                hasUnsavedChanges = false;
                
                renderFileList(); // Update active state
                editor.focus();
            }
        }
    } catch (error) {
        console.error('Error opening file:', error);
        showNotification('Failed to open file', 'error');
    }
}

function handleEditorChange() {
    if (!currentFile) return;
    
    const currentContent = editor.value;
    hasUnsavedChanges = currentContent !== currentFile.originalContent;
    
    if (hasUnsavedChanges) {
        fileStatus.textContent = 'Unsaved';
        fileStatus.className = 'file-status unsaved';
        saveBtn.disabled = false;
    } else {
        fileStatus.textContent = 'Saved';
        fileStatus.className = 'file-status saved';
        saveBtn.disabled = true;
    }
    
    currentFile.content = currentContent;
}

async function saveCurrentFile() {
    if (!currentFile || !hasUnsavedChanges) return;
    
    try {
        const response = await fetch('/api/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            credentials: 'include',
            body: `filename=${encodeURIComponent(currentFile.name)}&content=${encodeURIComponent(currentFile.content)}`
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                currentFile.originalContent = currentFile.content;
                hasUnsavedChanges = false;
                fileStatus.textContent = 'Saved';
                fileStatus.className = 'file-status saved';
                saveBtn.disabled = true;
                showNotification('File saved successfully', 'success');
            }
        }
    } catch (error) {
        console.error('Error saving file:', error);
        showNotification('Failed to save file', 'error');
    }
}

async function autoSave() {
    if (hasUnsavedChanges && currentFile) {
        await saveCurrentFile();
    }
}

async function deleteCurrentFile() {
    if (!currentFile) return;
    
    if (!confirm(`Are you sure you want to delete "${currentFile.name}"?`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/delete?filename=${encodeURIComponent(currentFile.name)}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                showNotification('File deleted successfully', 'success');
                closeCurrentFile();
                loadUserFiles();
            }
        }
    } catch (error) {
        console.error('Error deleting file:', error);
        showNotification('Failed to delete file', 'error');
    }
}

function closeCurrentFile() {
    currentFile = null;
    editor.value = '';
    editor.disabled = true;
    currentFileName.textContent = 'No file selected';
    fileStatus.textContent = '';
    fileStatus.className = 'file-status';
    saveBtn.disabled = true;
    deleteBtn.disabled = true;
    hasUnsavedChanges = false;
    renderFileList();
}

// Create file functions
function showCreateFileModal() {
    createFileModal.classList.add('show');
    document.getElementById('newFileName').focus();
}

function closeCreateFileModal() {
    createFileModal.classList.remove('show');
    createFileForm.reset();
}

async function handleCreateFile(e) {
    e.preventDefault();
    
    const formData = new FormData(createFileForm);
    const filename = formData.get('filename');
    
    if (!filename) {
        showNotification('Please enter a filename', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            credentials: 'include',
            body: `filename=${encodeURIComponent(filename)}`
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                showNotification('File created successfully', 'success');
                closeCreateFileModal();
                loadUserFiles();
                openFile(filename);
            } else {
                showNotification(data.message, 'error');
            }
        }
    } catch (error) {
        console.error('Error creating file:', error);
        showNotification('Failed to create file', 'error');
    }
}

// Create directory functions
function showCreateDirectoryModal() {
    createDirectoryModal.classList.add('show');
    document.getElementById('newDirectoryName').focus();
}

function closeCreateDirectoryModal() {
    createDirectoryModal.classList.remove('show');
    createDirectoryForm.reset();
}

async function handleCreateDirectory(e) {
    e.preventDefault();
    
    const formData = new FormData(createDirectoryForm);
    const dirname = formData.get('dirname');
    
    if (!dirname) {
        showNotification('Please enter a directory name', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/create-dir', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            credentials: 'include',
            body: `dirname=${encodeURIComponent(dirname)}`
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                showNotification('Directory created successfully', 'success');
                closeCreateDirectoryModal();
                loadUserFiles();
            } else {
                showNotification(data.message, 'error');
            }
        }
    } catch (error) {
        console.error('Error creating directory:', error);
        showNotification('Failed to create directory', 'error');
    }
}

function openDirectory(dirname) {
    // For now, just show a notification that directory navigation is not implemented
    showNotification('Directory navigation not yet implemented', 'info');
    // TODO: Implement directory navigation
}

// UI update functions
function updateUIForAuthenticatedUser() {
    loginBtn.style.display = 'none';
    userInfo.style.display = 'flex';
    usernameDisplay.textContent = currentUser;
    sidebar.style.display = 'flex';
}

function updateUIForUnauthenticatedUser() {
    loginBtn.style.display = 'inline-flex';
    userInfo.style.display = 'none';
    sidebar.style.display = 'none';
    closeCurrentFile();
}

function checkAuthentication() {
    // This could be enhanced to check with the server
    const sessionToken = getCookie('session');
    if (!sessionToken) {
        updateUIForUnauthenticatedUser();
    }
}

// Utility functions
function showNotification(message, type = 'info') {
    notification.textContent = message;
    notification.className = `notification ${type} show`;
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(timestamp) {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
}

function handleKeyboardShortcuts(e) {
    // Ctrl/Cmd + S to save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (!saveBtn.disabled) {
            saveCurrentFile();
        }
    }
    
    // Ctrl/Cmd + N to create new file
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        showCreateFileModal();
    }
    
    // Escape to close modals
    if (e.key === 'Escape') {
        if (authModal.classList.contains('show')) {
            closeAuthModal();
        }
        if (createFileModal.classList.contains('show')) {
            closeCreateFileModal();
        }
        if (createDirectoryModal.classList.contains('show')) {
            closeCreateDirectoryModal();
        }
    }
}

// Close modals when clicking outside
window.addEventListener('click', function(e) {
    if (e.target === authModal) {
        closeAuthModal();
    }
    if (e.target === createFileModal) {
        closeCreateFileModal();
    }
    if (e.target === createDirectoryModal) {
        closeCreateDirectoryModal();
    }
});

// Warn before leaving with unsaved changes
window.addEventListener('beforeunload', function(e) {
    if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
    }
});
