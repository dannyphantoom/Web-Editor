// File Management Module
class FileManager {
    constructor() {
        this.files = [];
        this.allFiles = [];
        this.currentPath = '';
        this.currentFile = null;
        this.hasUnsavedChanges = false;
        
        this.initializeElements();
        this.setupEventListeners();
    }

    initializeElements() {
        this.fileList = document.getElementById('fileList');
        this.breadcrumb = document.getElementById('breadcrumb');
        this.createFileModal = document.getElementById('createFileModal');
        this.createFileForm = document.getElementById('createFileForm');
        this.createDirectoryModal = document.getElementById('createDirectoryModal');
        this.createDirectoryForm = document.getElementById('createDirectoryForm');
    }

    setupEventListeners() {
        this.createFileForm.addEventListener('submit', this.handleCreateFile.bind(this));
        this.createDirectoryForm.addEventListener('submit', this.handleCreateDirectory.bind(this));
    }

    async loadUserFiles(path = '') {
        this.currentPath = path;
        try {
            const response = await fetch(`/api/files?path=${encodeURIComponent(path)}`, {
                method: 'GET',
                credentials: 'include'
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    this.files = data.files || [];
                    this.allFiles = data.allFiles || [];
                    this.renderFileList();
                    this.updateBreadcrumb();
                } else {
                    showNotification(data.message || 'Failed to load files', 'error');
                }
            }
        } catch (error) {
            console.error('Error loading files:', error);
            showNotification('Failed to load files: Network error', 'error');
        }
    }

    renderFileList() {
        if (this.files.length === 0) {
            this.fileList.innerHTML = `
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

        const fileTree = this.buildFileTree(this.files);
        this.fileList.innerHTML = `<ul class="file-tree">${fileTree.map(item => this.renderFileTreeItem(item)).join('')}</ul>`;
        
        // Add event listeners
        this.fileList.removeEventListener('click', this.handleFileTreeClick.bind(this));
        this.fileList.addEventListener('click', this.handleFileTreeClick.bind(this));
    }

    buildFileTree(files) {
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
            const pathParts = file.path.split('/');
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

    renderFileTreeItem(item) {
        const hasChildren = item.children && item.children.length > 0;
        const isExpanded = hasChildren ? 'expanded' : '';
        const hasChildrenClass = hasChildren ? 'has-children' : '';
        const childrenHtml = hasChildren ? `<ul class='file-tree-children'>${item.children.map(child => this.renderFileTreeItem(child)).join('')}</ul>` : '';
        
        const fileInfo = item.originalFile || {};
        const fileSize = fileInfo.size ? this.formatFileSize(fileInfo.size) : '';
        const fileDate = fileInfo.lastModified ? this.formatDate(fileInfo.lastModified) : '';
        const fileMeta = item.isDirectory ? 'Directory' : `${fileSize} • ${fileDate}`;
        
        return `
            <li class='file-tree-item ${hasChildrenClass} ${isExpanded}'>
                <div class='file-item ${this.currentFile && this.currentFile.name === item.fullPath ? 'active' : ''} ${item.isDirectory ? 'directory' : ''}' data-full-path='${item.fullPath}'>
                    <i class='fas ${item.isDirectory ? 'fa-folder' : 'fa-file-alt'}'></i>
                    <div class='file-info'>
                        <div class='file-name'>${item.name}</div>
                        <div class='file-meta'>${fileMeta}</div>
                    </div>
                </div>
                ${childrenHtml}
            </li>
        `;
    }

    handleFileTreeClick(e) {
        const fileItem = e.target.closest('.file-item');
        if (!fileItem) return;
        
        e.stopPropagation();
        const treeItem = fileItem.closest('.file-tree-item');
        const fullPath = fileItem.dataset.fullPath;
        
        if (fileItem.classList.contains('directory')) {
            // Toggle expansion for directories
            treeItem.classList.toggle('expanded');
            // Navigate to the directory
            this.openDirectory(fullPath);
        } else {
            // Open the file
            this.openFile(fullPath);
        }
    }

    async openFile(path) {
        if (!path) return;
        
        try {
            const response = await fetch(`/api/file?filename=${encodeURIComponent(path)}`, {
                method: 'GET',
                credentials: 'include'
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    this.currentFile = {
                        name: path,
                        content: decodeURIComponent(data.content),
                        originalContent: decodeURIComponent(data.content)
                    };
                    
                    if (window.editorManager) {
                        window.editorManager.loadFile(this.currentFile);
                    }
                    
                    this.renderFileList(); // Update active state
                } else {
                    showNotification(`Failed to open file: ${data.message}`, 'error');
                }
            }
        } catch (error) {
            console.error('Error opening file:', error);
            showNotification('Failed to open file: Network error', 'error');
        }
    }

    async saveCurrentFile() {
        if (!this.currentFile || !this.hasUnsavedChanges) return;
        
        try {
            const response = await fetch('/api/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                credentials: 'include',
                body: `filename=${encodeURIComponent(this.currentFile.name)}&content=${encodeURIComponent(this.currentFile.content)}`
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    this.currentFile.originalContent = this.currentFile.content;
                    this.hasUnsavedChanges = false;
                    
                    if (window.editorManager) {
                        window.editorManager.updateFileStatus();
                    }
                    
                    showNotification('File saved successfully', 'success');
                }
            }
        } catch (error) {
            console.error('Error saving file:', error);
            showNotification('Failed to save file', 'error');
        }
    }

    async deleteCurrentFile() {
        if (!this.currentFile) return;
        
        if (!confirm(`Are you sure you want to delete "${this.currentFile.name}"?`)) {
            return;
        }
        
        try {
            const response = await fetch(`/api/delete?filename=${encodeURIComponent(this.currentFile.name)}`, {
                method: 'DELETE',
                credentials: 'include'
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    showNotification('File deleted successfully', 'success');
                    this.closeCurrentFile();
                    this.loadUserFiles();
                }
            }
        } catch (error) {
            console.error('Error deleting file:', error);
            showNotification('Failed to delete file', 'error');
        }
    }

    closeCurrentFile() {
        this.currentFile = null;
        this.hasUnsavedChanges = false;
        
        if (window.editorManager) {
            window.editorManager.closeCurrentFile();
        }
        
        this.renderFileList();
    }

    clearFiles() {
        this.files = [];
        this.allFiles = [];
        this.currentPath = '';
        this.currentFile = null;
        this.hasUnsavedChanges = false;
        this.renderFileList();
    }

    // File creation methods
    showCreateFileModal() {
        this.createFileModal.classList.add('show');
        document.getElementById('newFileName').focus();
    }

    closeCreateFileModal() {
        this.createFileModal.classList.remove('show');
        this.createFileForm.reset();
    }

    async handleCreateFile(e) {
        e.preventDefault();
        const filename = this.createFileForm.filename.value.trim();
        if (!filename) return;
        
        try {
            const response = await fetch('/api/file', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                credentials: 'include',
                body: `filename=${encodeURIComponent(filename)}&path=${encodeURIComponent(this.currentPath)}`
            });
            
            const data = await response.json();
            if (data.success) {
                showNotification('File created', 'success');
                this.closeCreateFileModal();
                this.loadUserFiles(this.currentPath);
            } else {
                showNotification(data.message, 'error');
            }
        } catch (error) {
            showNotification('Failed to create file', 'error');
        }
    }

    showCreateDirectoryModal() {
        this.createDirectoryModal.classList.add('show');
        document.getElementById('newDirectoryName').focus();
    }

    closeCreateDirectoryModal() {
        this.createDirectoryModal.classList.remove('show');
        this.createDirectoryForm.reset();
    }

    async handleCreateDirectory(e) {
        e.preventDefault();
        const dirname = this.createDirectoryForm.dirname.value.trim();
        if (!dirname) return;
        
        try {
            const response = await fetch('/api/create-dir', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                credentials: 'include',
                body: `dirname=${encodeURIComponent(dirname)}&path=${encodeURIComponent(this.currentPath)}`
            });
            
            const data = await response.json();
            if (data.success) {
                showNotification('Directory created', 'success');
                this.closeCreateDirectoryModal();
                this.loadUserFiles(this.currentPath);
            } else {
                showNotification(data.message, 'error');
            }
        } catch (error) {
            showNotification('Failed to create directory', 'error');
        }
    }

    updateBreadcrumb() {
        const pathParts = this.currentPath.split('/').filter(part => part);
        let breadcrumbHtml = '<span class="breadcrumb-item" onclick="window.fileManager.navigateToRoot()">Home</span>';
        
        let currentPathBuilt = '';
        pathParts.forEach((part, index) => {
            currentPathBuilt += (currentPathBuilt ? '/' : '') + part;
            breadcrumbHtml += `<span class="breadcrumb-item" onclick="window.fileManager.navigateToPath('${currentPathBuilt}')">${part}</span>`;
        });
        
        this.breadcrumb.innerHTML = breadcrumbHtml;
    }

    navigateToRoot() {
        this.loadUserFiles('');
    }

    navigateToPath(path) {
        this.loadUserFiles(path);
    }

    openDirectory(dirname) {
        const newPath = this.currentPath ? `${this.currentPath}/${dirname}` : dirname;
        this.loadUserFiles(newPath);
    }

    // File upload methods
    triggerFileUpload() {
        document.getElementById('fileUploadInput').click();
    }

    triggerFolderUpload() {
        document.getElementById('folderUploadInput').click();
    }

    async handleFileUpload(e) {
        const files = e.target.files;
        if (!files.length) return;
        
        for (const file of files) {
            await this.uploadFileToServer(file, this.currentPath);
        }
        this.loadUserFiles(this.currentPath);
    }

    async handleFolderUpload(e) {
        const files = e.target.files;
        if (!files.length) return;
        
        for (const file of files) {
            await this.uploadFileToServer(file, this.currentPath, file.webkitRelativePath);
        }
        this.loadUserFiles(this.currentPath);
    }

    async uploadFileToServer(file, path, relativePath = null) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('path', path);
        if (relativePath) {
            formData.append('relative_path', relativePath);
        }
        
        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                credentials: 'include',
                body: formData
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    showNotification('File uploaded successfully', 'success');
                    this.loadUserFiles(this.currentPath);
                } else {
                    showNotification(data.message || 'Upload failed', 'error');
                }
            }
        } catch (error) {
            console.error('Upload error:', error);
            showNotification('Upload failed: Network error', 'error');
        }
    }

    // Utility functions
    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    formatDate(timestamp) {
        const date = new Date(timestamp * 1000);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    }
}

// Export for use in other modules
window.FileManager = FileManager; 