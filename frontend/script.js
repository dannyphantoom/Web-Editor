// Global state
let currentUser = null;
let currentFile = null;
let files = [];
let isAuthenticated = false;
let isRegisterMode = false;
let hasUnsavedChanges = false;
let currentPath = ''; // Current directory path
let allFiles = []; // All files for search functionality
let searchTimeout = null; // For debounced search

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
const breadcrumb = document.getElementById('breadcrumb');
const editor = document.getElementById('editor');
const currentFileName = document.getElementById('currentFileName');
const fileStatus = document.getElementById('fileStatus');
const saveBtn = document.getElementById('saveBtn');
const deleteBtn = document.getElementById('deleteBtn');
const createFileModal = document.getElementById('createFileModal');
const createFileForm = document.getElementById('createFileForm');
const createDirectoryModal = document.getElementById('createDirectoryModal');
const createDirectoryForm = document.getElementById('createDirectoryForm');
const searchModal = document.getElementById('searchModal');
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
const notification = document.getElementById('notification');
const vcsSection = document.getElementById('vcsSection');
const vcsStatus = document.getElementById('vcsStatus');
const vcsBranch = document.getElementById('vcsBranch');
const initRepoBtn = document.getElementById('initRepoBtn');
const commitBtn = document.getElementById('commitBtn');
const branchBtn = document.getElementById('branchBtn');
const logBtn = document.getElementById('logBtn');
const commitModal = document.getElementById('commitModal');
const commitForm = document.getElementById('commitForm');
const commitMessage = document.getElementById('commitMessage');
const branchModal = document.getElementById('branchModal');
const branchForm = document.getElementById('branchForm');
const branchName = document.getElementById('branchName');
const logModal = document.getElementById('logModal');
const logHistory = document.getElementById('logHistory');
const terminalPanel = document.getElementById('terminalPanel');
const terminalResizer = document.getElementById('terminalResizer');
const chatPanel = document.getElementById('chatPanel');
const chatResizer = document.getElementById('chatResizer');
const chatMessages = document.getElementById('chatMessages');
const chatInputForm = document.getElementById('chatInputForm');
const chatInput = document.getElementById('chatInput');
const vcsCurrentPath = document.getElementById('vcsCurrentPath');
const vcsCurrentFile = document.getElementById('vcsCurrentFile');

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupEventListeners();
    checkAuthentication();
});

function initializeApp() {
    console.log('Initializing application...');
    
    // Initialize panels
    initializePanels();
    
    // Check if user is already authenticated
    const sessionToken = getCookie('session');
    if (sessionToken) {
        console.log('Found existing session token, validating...');
        // Validate session with server
        validateSession(sessionToken);
    } else {
        console.log('No session token found');
    }

    // Warn if opened as file://
    if (window.location.protocol === 'file:') {
        alert('Please open this app via http://localhost:8080/ and not as a file:// URL. Authentication will not work otherwise.');
    }
    
    // Ensure editor is properly initialized
    console.log('Editor element:', editor);
    console.log('Editor disabled state:', editor.disabled);
    console.log('Editor value:', editor.value);
}

function setupEventListeners() {
    // Auth form submission
    authForm.addEventListener('submit', handleAuthSubmit);
    
    // Create file form submission
    createFileForm.addEventListener('submit', handleCreateFile);
    
    // Create directory form submission
    createDirectoryForm.addEventListener('submit', handleCreateDirectory);
    
    // Search functionality
    searchInput.addEventListener('input', handleSearchInput);
    searchInput.addEventListener('keydown', handleSearchKeydown);
    
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

    // VCS modals
    commitForm.addEventListener('submit', handleCommitSubmit);
    branchForm.addEventListener('submit', handleBranchSubmit);

    // Terminal panel toggle
    terminalResizer.addEventListener('mousedown', function(e) {
        isDragging = true;
        startY = e.clientY;
        startHeight = terminalPanel.offsetHeight;
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
    });
    window.addEventListener('mousemove', function(e) {
        if (!isDragging) return;
        const dy = startY - e.clientY;
        let newHeight = startHeight + dy;
        newHeight = Math.max(120, Math.min(window.innerHeight * 0.6, newHeight));
        terminalPanel.style.height = newHeight + 'px';
    });
    window.addEventListener('mouseup', function() {
        if (isDragging) {
            isDragging = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    });

    // Chat panel toggle
    chatResizer.addEventListener('mousedown', function(e) {
        isDragging = true;
        startX = e.clientX;
        startWidth = chatPanel.offsetWidth;
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
    });
    window.addEventListener('mousemove', function(e) {
        if (!isDragging) return;
        const dx = startX - e.clientX;
        let newWidth = startWidth + dx;
        newWidth = Math.max(220, Math.min(window.innerWidth * 0.6, newWidth));
        chatPanel.style.width = newWidth + 'px';
    });
    window.addEventListener('mouseup', function() {
        if (isDragging) {
            isDragging = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    });

    // Chat UI logic
    chatInputForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        const message = chatInput.value.trim();
        if (!message) return;
        addChatMessage('user', message);
        chatInput.value = '';
        chatInput.disabled = true;
        // Placeholder: Simulate API call
        setTimeout(() => {
            addChatMessage('bot', 'This is a placeholder response from ChatGPT/Claude.');
            chatInput.disabled = false;
            chatInput.focus();
        }, 1000);
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
            credentials: 'include',
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
                // Clear the form for login
                authForm.reset();
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
            credentials: 'include'
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
async function loadUserFiles(path = '') {
    console.log('loadUserFiles called with path:', path);
    try {
        const url = path ? `/api/files?path=${encodeURIComponent(path)}` : '/api/files';
        console.log('loadUserFiles: Fetching from URL:', url);
        const response = await fetch(url, {
            method: 'GET',
            credentials: 'include'
        });
        
        console.log('loadUserFiles: Response status:', response.status);
        if (response.ok) {
            const data = await response.json();
            console.log('loadUserFiles: Response data:', data);
            if (data.success) {
                files = data.files || [];
                allFiles = data.allFiles || []; // Store all files for search
                currentPath = path;
                console.log('loadUserFiles: Files loaded:', files);
                console.log('loadUserFiles: Current path set to:', currentPath);
                renderFileList();
                updateBreadcrumb();
            } else {
                console.log('loadUserFiles: Backend returned success: false, message:', data.message);
                showNotification(`Failed to load files: ${data.message}`, 'error');
            }
        } else {
            console.log('loadUserFiles: HTTP error, status:', response.status);
            const errorText = await response.text();
            console.log('loadUserFiles: Error response:', errorText);
            showNotification(`Failed to load files: HTTP ${response.status}`, 'error');
        }
    } catch (error) {
        console.error('loadUserFiles: Exception occurred:', error);
        showNotification('Failed to load files: Network error', 'error');
    }
}

function renderFileList() {
    if (files.length === 0) {
        fileList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-folder-open"></i>
                <p>No files in this directory</p>
                <div class="empty-state-actions">
                    <button class="btn btn-secondary" onclick="showCreateFileModal()">Create a file</button>
                    <button class="btn btn-secondary" onclick="showCreateDirectoryModal()">Create a directory</button>
                </div>
            </div>
        `;
        return;
    }
    // Group files by directory structure
    const fileTree = buildFileTree(files);
    fileList.innerHTML = `
        <ul class="file-tree">
            ${fileTree.map(item => renderFileTreeItem(item)).join('')}
        </ul>
    `;
    
    // Use event delegation to handle file/directory clicks
    // Remove any existing event listeners by using a single listener on the fileList container
    fileList.removeEventListener('click', handleFileTreeClick);
    fileList.addEventListener('click', handleFileTreeClick);
}

// Event delegation handler for file tree clicks
function handleFileTreeClick(e) {
    const fileItem = e.target.closest('.file-item');
    if (!fileItem) return;
    
    e.stopPropagation();
    const treeItem = fileItem.closest('.file-tree-item');
    const fullPath = fileItem.dataset.fullPath;
    
    console.log('File tree click:', {
        fullPath: fullPath,
        isDirectory: fileItem.classList.contains('directory'),
        element: fileItem
    });
    
    if (fileItem.classList.contains('directory')) {
        // Toggle expansion for directories
        treeItem.classList.toggle('expanded');
        openDirectory(fullPath);
    } else {
        openFile(fullPath);
    }
}

function buildFileTree(files) {
    const tree = [];
    const fileMap = new Map();
    
    // Sort files: directories first, then by name
    const sortedFiles = files.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) {
            return b.isDirectory ? 1 : -1;
        }
        return a.name.localeCompare(b.name);
    });
    
    sortedFiles.forEach(file => {
        const pathParts = file.name.split('/');
        let currentLevel = tree;
        let currentPath = '';
        
        for (let i = 0; i < pathParts.length; i++) {
            const part = pathParts[i];
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            
            let existingItem = currentLevel.find(item => item.name === part);
            if (!existingItem) {
                const isDirectory = i < pathParts.length - 1 || file.isDirectory;
                existingItem = {
                    name: part,
                    fullPath: currentPath,
                    isDirectory: isDirectory,
                    children: [],
                    originalFile: i === pathParts.length - 1 ? file : null
                };
                currentLevel.push(existingItem);
            }
            
            if (i < pathParts.length - 1) {
                currentLevel = existingItem.children;
            }
        }
    });
    
    return tree;
}

function renderFileTreeItem(item) {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = hasChildren ? 'expanded' : '';
    const hasChildrenClass = hasChildren ? 'has-children' : '';
    const childrenHtml = hasChildren ? `
        <ul class="file-tree-children">
            ${item.children.map(child => renderFileTreeItem(child)).join('')}
        </ul>
    ` : '';
    
    console.log('Rendering file tree item:', {
        name: item.name,
        fullPath: item.fullPath,
        isDirectory: item.isDirectory,
        hasChildren: hasChildren
    });
    
    return `
        <li class="file-tree-item ${hasChildrenClass} ${isExpanded}">
            <div class="file-item ${currentFile && currentFile.name === item.fullPath ? 'active' : ''} ${item.isDirectory ? 'directory' : ''}" 
                 data-full-path="${item.fullPath}">
                <i class="fas ${item.isDirectory ? 'fa-folder' : 'fa-file-alt'}"></i>
                <div class="file-info">
                    <div class="file-name">${item.name}</div>
                    <div class="file-meta">${item.isDirectory ? 'Directory' : formatFileSize(item.originalFile?.size || 0)} • ${formatDate(item.originalFile?.lastModified || Date.now() / 1000)}</div>
                </div>
            </div>
            ${childrenHtml}
        </li>
    `;
}

async function openFile(path) {
    console.log('openFile called with path:', path);
    if (!path) {
        console.log('openFile: No path provided');
        return;
    }
    try {
        console.log('openFile: Fetching file content from:', `/api/file?filename=${encodeURIComponent(path)}`);
        const response = await fetch(`/api/file?filename=${encodeURIComponent(path)}`, {
            method: 'GET',
            credentials: 'include'
        });
        
        console.log('openFile: Response status:', response.status);
        if (response.ok) {
            const data = await response.json();
            console.log('openFile: Response data:', data);
            if (data.success) {
                console.log('openFile: Successfully loaded file, updating editor...');
                currentFile = {
                    name: path,
                    content: decodeURIComponent(data.content),
                    originalContent: decodeURIComponent(data.content)
                };
                
                editor.value = currentFile.content;
                editor.disabled = false;
                currentFileName.textContent = path;
                fileStatus.textContent = 'Saved';
                fileStatus.className = 'file-status saved';
                saveBtn.disabled = true;
                deleteBtn.disabled = false;
                hasUnsavedChanges = false;
                
                console.log('openFile: Editor updated, currentFile:', currentFile);
                renderFileList(); // Update active state
                editor.focus();
            } else {
                console.log('openFile: Backend returned success: false, message:', data.message);
                showNotification(`Failed to open file: ${data.message}`, 'error');
            }
        } else {
            console.log('openFile: HTTP error, status:', response.status);
            const errorText = await response.text();
            console.log('openFile: Error response:', errorText);
            showNotification(`Failed to open file: HTTP ${response.status}`, 'error');
        }
    } catch (error) {
        console.error('openFile: Exception occurred:', error);
        showNotification('Failed to open file: Network error', 'error');
    }
}

function handleEditorChange() {
    console.log('handleEditorChange called, currentFile:', currentFile);
    if (!currentFile) {
        console.log('handleEditorChange: No current file, ignoring change');
        return;
    }
    
    const currentContent = editor.value;
    hasUnsavedChanges = currentContent !== currentFile.originalContent;
    
    console.log('handleEditorChange: Content changed, hasUnsavedChanges:', hasUnsavedChanges);
    
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
    const filename = createFileForm.filename.value.trim();
    if (!filename) return;
    try {
        const response = await fetch('/api/file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            credentials: 'include',
            body: `filename=${encodeURIComponent(filename)}&path=${encodeURIComponent(currentPath)}`
        });
        const data = await response.json();
        if (data.success) {
            showNotification('File created', 'success');
            closeCreateFileModal();
            loadUserFiles(currentPath);
        } else {
            showNotification(data.message, 'error');
        }
    } catch (e) {
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
    const dirname = createDirectoryForm.dirname.value.trim();
    if (!dirname) return;
    try {
        const response = await fetch('/api/create-dir', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            credentials: 'include',
            body: `dirname=${encodeURIComponent(dirname)}&path=${encodeURIComponent(currentPath)}`
        });
        const data = await response.json();
        if (data.success) {
            showNotification('Directory created', 'success');
            closeCreateDirectoryModal();
            loadUserFiles(currentPath);
        } else {
            showNotification(data.message, 'error');
        }
    } catch (e) {
        showNotification('Failed to create directory', 'error');
    }
}

function updateBreadcrumb() {
    const pathParts = currentPath.split('/').filter(part => part);
    let breadcrumbHtml = '<span class="breadcrumb-item" onclick="navigateToRoot()">Home</span>';
    
    let currentPathBuilt = '';
    pathParts.forEach((part, index) => {
        currentPathBuilt += (currentPathBuilt ? '/' : '') + part;
        breadcrumbHtml += `<span class="breadcrumb-item" onclick="navigateToPath('${currentPathBuilt}')">${part}</span>`;
    });
    
    breadcrumb.innerHTML = breadcrumbHtml;
}

function navigateToRoot() {
    loadUserFiles('');
}

function navigateToPath(path) {
    loadUserFiles(path);
}

function openDirectory(dirname) {
    const newPath = currentPath ? `${currentPath}/${dirname}` : dirname;
    loadUserFiles(newPath);
}

// UI update functions
function updateUIForAuthenticatedUser() {
    loginBtn.style.display = 'none';
    userInfo.style.display = 'flex';
    usernameDisplay.textContent = currentUser;
    sidebar.style.display = 'flex';
    showFilesPanel(); // Ensure the files panel is active and visible
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
    // Clear any existing notifications first
    notification.className = 'notification';
    notification.textContent = '';
    
    // Set the new notification
    notification.textContent = message;
    notification.className = `notification ${type}`;
    
    // Force a reflow to ensure the transition works
    notification.offsetHeight;
    
    // Show the notification
    notification.classList.add('show');
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
        hideNotification();
    }, 3000);
}

function hideNotification() {
    notification.classList.remove('show');
    // Clear the content after the transition
    setTimeout(() => {
        notification.textContent = '';
        notification.className = 'notification';
    }, 300);
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
    
    // Ctrl/Cmd + F to search
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        showSearchModal();
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
        if (searchModal.classList.contains('show')) {
            closeSearchModal();
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

// Search functionality
function showSearchModal() {
    const sidebar = document.getElementById('sidebar');
    const filePanel = document.getElementById('filePanel');
    const vcsPanelSidebar = document.getElementById('vcsPanelSidebar');
    const resizer = document.getElementById('panelResizer');
    sidebar.classList.remove('active');
    sidebar.style.width = '';
    filePanel.style.display = 'block';
    vcsPanelSidebar.style.display = 'none';
    resizer.classList.remove('active');
    resizer.style.display = 'none';
    setTopbarActive('showSearchBtn');
    // Only show the search modal popup
    searchModal.classList.add('show');
    searchInput.focus();
    searchInput.value = '';
    searchResults.innerHTML = `
        <div class="empty-search">
            <i class="fas fa-search"></i>
            <p>Start typing to search files and folders</p>
        </div>
    `;
}

function closeSearchModal() {
    searchModal.classList.remove('show');
    searchInput.value = '';
    searchResults.innerHTML = '';
}

function handleSearchInput(e) {
    const query = e.target.value.trim();
    
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        performSearch(query);
    }, 300);
}

function handleSearchKeydown(e) {
    if (e.key === 'Escape') {
        closeSearchModal();
    } else if (e.key === 'Enter') {
        const firstResult = searchResults.querySelector('.search-result-item');
        if (firstResult) {
            firstResult.click();
        }
    }
}

function performSearch(query) {
    if (!query) {
        searchResults.innerHTML = `
            <div class="empty-search">
                <i class="fas fa-search"></i>
                <p>Start typing to search files and folders</p>
            </div>
        `;
        return;
    }
    
    const results = fuzzySearch(allFiles, query);
    
    if (results.length === 0) {
        searchResults.innerHTML = `
            <div class="empty-search">
                <i class="fas fa-search"></i>
                <p>No files found matching "${query}"</p>
            </div>
        `;
        return;
    }
    
    searchResults.innerHTML = results.map(result => `
        <div class="search-result-item" onclick="selectSearchResult('${result.fullPath}', ${result.isDirectory})">
            <i class="fas ${result.isDirectory ? 'fa-folder' : 'fa-file-alt'}"></i>
            <div class="search-result-info">
                <div class="search-result-name">${highlightMatch(result.name, query)}</div>
                <div class="search-result-path">${result.fullPath}</div>
            </div>
        </div>
    `).join('');
}

function fuzzySearch(files, query) {
    const results = [];
    const queryLower = query.toLowerCase();
    
    files.forEach(file => {
        const nameLower = file.name.toLowerCase();
        const pathLower = file.fullPath.toLowerCase();
        
        // Check if query matches file name or path
        if (nameLower.includes(queryLower) || pathLower.includes(queryLower)) {
            const score = calculateSearchScore(file, queryLower);
            results.push({
                ...file,
                score: score
            });
        }
    });
    
    // Sort by relevance score
    return results.sort((a, b) => b.score - a.score).slice(0, 10);
}

function calculateSearchScore(file, query) {
    const nameLower = file.name.toLowerCase();
    const pathLower = file.fullPath.toLowerCase();
    
    let score = 0;
    
    // Exact name match gets highest score
    if (nameLower === query) score += 100;
    // Name starts with query
    else if (nameLower.startsWith(query)) score += 50;
    // Name contains query
    else if (nameLower.includes(query)) score += 25;
    
    // Path contains query
    if (pathLower.includes(query)) score += 10;
    
    // Directories get slight bonus
    if (file.isDirectory) score += 5;
    
    return score;
}

function highlightMatch(text, query) {
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<span class="highlight">$1</span>');
}

function selectSearchResult(path, isDirectory) {
    closeSearchModal();
    
    if (isDirectory) {
        // Navigate to the directory
        const pathParts = path.split('/');
        const dirPath = pathParts.slice(0, -1).join('/');
        loadUserFiles(dirPath);
    } else {
        // Open the file
        openFile(path);
    }
}

function showInitRepoModal() {
    if (confirm('Initialize version control for this folder?')) {
        initRepository();
    }
}

function showCommitModal() {
    commitModal.classList.add('show');
    commitMessage.value = '';
    commitMessage.focus();
}

function closeCommitModal() {
    commitModal.classList.remove('show');
    commitForm.reset();
}

function showBranchModal() {
    branchModal.classList.add('show');
    branchName.value = '';
    branchName.focus();
}

function closeBranchModal() {
    branchModal.classList.remove('show');
    branchForm.reset();
}

function showLogModal() {
    logModal.classList.add('show');
    loadLogHistory();
}

function closeLogModal() {
    logModal.classList.remove('show');
    logHistory.innerHTML = '';
}

// Version Control API and UI
function updateVCSUI(status = {}) {
    if (status.tracked) {
        vcsStatus.textContent = 'Tracked';
        vcsBranch.textContent = status.branch ? `Branch: ${status.branch}` : '';
        commitBtn.disabled = false;
        branchBtn.disabled = false;
        logBtn.disabled = false;
    } else {
        vcsStatus.textContent = 'Not tracked';
        vcsBranch.textContent = '';
        commitBtn.disabled = true;
        branchBtn.disabled = true;
        logBtn.disabled = true;
    }
    vcsCurrentPath.textContent = currentPath || '/';
    vcsCurrentFile.textContent = currentFile ? currentFile.name : 'No file selected';
}

async function initRepository() {
    try {
        const response = await fetch('/api/init-repo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            credentials: 'include',
            body: `path=${encodeURIComponent(currentPath)}`
        });
        const data = await response.json();
        if (data.success) {
            showNotification('Repository initialized', 'success');
            updateVCSUI({ tracked: true, branch: 'main' });
        } else {
            showNotification(data.message, 'error');
        }
    } catch (e) {
        showNotification('Failed to initialize repository', 'error');
    }
}

async function handleCommitSubmit(e) {
    e.preventDefault();
    const message = commitMessage.value.trim();
    if (!message) return;
    try {
        const response = await fetch('/api/commit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            credentials: 'include',
            body: `path=${encodeURIComponent(currentPath)}&message=${encodeURIComponent(message)}`
        });
        const data = await response.json();
        if (data.success) {
            showNotification('Committed changes', 'success');
            closeCommitModal();
        } else {
            showNotification(data.message, 'error');
        }
    } catch (e) {
        showNotification('Failed to commit', 'error');
    }
}

async function handleBranchSubmit(e) {
    e.preventDefault();
    const name = branchName.value.trim();
    if (!name) return;
    try {
        const response = await fetch('/api/create-branch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            credentials: 'include',
            body: `path=${encodeURIComponent(currentPath)}&branch_name=${encodeURIComponent(name)}`
        });
        const data = await response.json();
        if (data.success) {
            showNotification('Branch created', 'success');
            closeBranchModal();
        } else {
            showNotification(data.message, 'error');
        }
    } catch (e) {
        showNotification('Failed to create branch', 'error');
    }
}

async function loadLogHistory() {
    logHistory.innerHTML = '<div>Loading...</div>';
    try {
        const response = await fetch(`/api/history?path=${encodeURIComponent(currentPath)}`, {
            method: 'GET',
            credentials: 'include'
        });
        const data = await response.json();
        if (data.success && data.history.length > 0) {
            logHistory.innerHTML = data.history.map(entry => `
                <div class="log-entry">
                    <div class="log-message">${entry.message}</div>
                    <div class="log-meta">${entry.author} • ${formatDate(entry.timestamp)}</div>
                    <div class="log-files">Changed: ${entry.changed_files.join(', ')}</div>
                    <div class="log-checkout">
                        <button class="btn-log-checkout" onclick="checkoutVersion('${entry.id}')">Checkout</button>
                    </div>
                </div>
            `).join('');
        } else {
            logHistory.innerHTML = '<div>No commits yet.</div>';
        }
    } catch (e) {
        logHistory.innerHTML = '<div>Failed to load history.</div>';
    }
}

async function checkoutVersion(versionId) {
    try {
        const response = await fetch('/api/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            credentials: 'include',
            body: `path=${encodeURIComponent(currentPath)}&version_id=${encodeURIComponent(versionId)}`
        });
        const data = await response.json();
        if (data.success) {
            showNotification('Checked out version', 'success');
            closeLogModal();
            loadUserFiles(currentPath);
        } else {
            showNotification(data.message, 'error');
        }
    } catch (e) {
        showNotification('Failed to checkout version', 'error');
    }
}

// --- Top Bar Button Logic ---
function showFilesPanel() {
    const sidebar = document.getElementById('sidebar');
    const filePanel = document.getElementById('filePanel');
    const vcsPanelSidebar = document.getElementById('vcsPanelSidebar');
    const resizer = document.getElementById('panelResizer');
    // Toggle logic
    if (sidebar.classList.contains('active') && filePanel.style.display !== 'none') {
        sidebar.classList.remove('active');
        sidebar.style.width = '';
        resizer.classList.remove('active');
        resizer.style.display = 'none';
        setTopbarActive(null);
        return;
    }
    sidebar.classList.add('active');
    filePanel.style.display = 'block';
    vcsPanelSidebar.style.display = 'none';
    resizer.classList.add('active');
    resizer.style.display = 'block';
    setTopbarActive('showFilesBtn');
}
function showVCSPanel() {
    const sidebar = document.getElementById('sidebar');
    const filePanel = document.getElementById('filePanel');
    const vcsPanelSidebar = document.getElementById('vcsPanelSidebar');
    const resizer = document.getElementById('panelResizer');
    // Toggle logic
    if (sidebar.classList.contains('active') && vcsPanelSidebar.style.display !== 'none') {
        sidebar.classList.remove('active');
        sidebar.style.width = '';
        resizer.classList.remove('active');
        resizer.style.display = 'none';
        setTopbarActive(null);
        return;
    }
    sidebar.classList.add('active');
    filePanel.style.display = 'none';
    vcsPanelSidebar.style.display = 'block';
    resizer.classList.add('active');
    resizer.style.display = 'block';
    setTopbarActive('showVCSBtn');
    updateVCSUIForCurrentPath();
}
function showSearchModal() {
    const sidebar = document.getElementById('sidebar');
    const filePanel = document.getElementById('filePanel');
    const vcsPanelSidebar = document.getElementById('vcsPanelSidebar');
    const resizer = document.getElementById('panelResizer');
    sidebar.classList.remove('active');
    sidebar.style.width = '';
    filePanel.style.display = 'block';
    vcsPanelSidebar.style.display = 'none';
    resizer.classList.remove('active');
    resizer.style.display = 'none';
    setTopbarActive('showSearchBtn');
    // Only show the search modal popup
    searchModal.classList.add('show');
    searchInput.focus();
    searchInput.value = '';
    searchResults.innerHTML = `
        <div class="empty-search">
            <i class="fas fa-search"></i>
            <p>Start typing to search files and folders</p>
        </div>
    `;
}
function setTopbarActive(btnId) {
    ['showFilesBtn','showVCSBtn','showSearchBtn'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.classList.remove('active');
    });
    if (btnId) {
        document.getElementById(btnId).classList.add('active');
    }
}

// Initialize panels on app startup instead
function initializePanels() {
    const sidebar = document.getElementById('sidebar');
    const filePanel = document.getElementById('filePanel');
    const vcsPanelSidebar = document.getElementById('vcsPanelSidebar');
    const resizer = document.getElementById('panelResizer');
    sidebar.classList.remove('active');
    sidebar.style.width = '';
    filePanel.style.display = 'block';
    vcsPanelSidebar.style.display = 'none';
    resizer.classList.remove('active');
    resizer.style.display = 'none';
    setTopbarActive(null);
}

// --- Resizer Logic ---
(function() {
    const resizer = document.getElementById('panelResizer');
    const sidebar = document.getElementById('sidebar');
    const vcsPanel = document.getElementById('vcsPanel');
    let isDragging = false;
    let startX = 0;
    let startWidth = 0;
    let activePanel = null;

    function getActivePanel() {
        return sidebar.classList.contains('active') ? sidebar : vcsPanel.classList.contains('active') ? vcsPanel : null;
    }

    resizer.addEventListener('mousedown', function(e) {
        isDragging = true;
        startX = e.clientX;
        activePanel = getActivePanel();
        if (activePanel) {
            startWidth = activePanel.offsetWidth;
        }
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
    });
    window.addEventListener('mousemove', function(e) {
        if (!isDragging || !activePanel) return;
        const dx = e.clientX - startX;
        let newWidth = startWidth + dx;
        newWidth = Math.max(120, Math.min(window.innerWidth * 0.5, newWidth));
        activePanel.style.width = newWidth + 'px';
    });
    window.addEventListener('mouseup', function() {
        if (isDragging) {
            isDragging = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    });
})();

// Helper to update VCS UI for the current folder
function updateVCSUIForCurrentPath() {
    // Optionally, fetch and update VCS status for currentPath
    // For now, just call updateVCSUI (could be extended for more context)
    updateVCSUI();
}

// --- Panel Toggle Functions ---
function showTerminalPanel() {
    if (terminalPanel.style.display === 'none' || !terminalPanel.style.display) {
        terminalPanel.style.display = 'flex';
    } else {
        terminalPanel.style.display = 'none';
    }
}
function showChatPanel() {
    if (chatPanel.style.display === 'none' || !chatPanel.style.display) {
        chatPanel.style.display = 'flex';
    } else {
        chatPanel.style.display = 'none';
    }
}

// --- Chat UI Logic ---
function addChatMessage(sender, text) {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-message ' + sender;
    msgDiv.textContent = text;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}
