// Editor Management Module
class EditorManager {
    constructor() {
        this.currentFile = null;
        this.hasUnsavedChanges = false;
        this.autoSaveTimeout = null;
        
        this.initializeElements();
        this.setupEventListeners();
    }

    initializeElements() {
        this.editor = document.getElementById('editor');
        this.currentFileName = document.getElementById('currentFileName');
        this.fileStatus = document.getElementById('fileStatus');
        this.saveBtn = document.getElementById('saveBtn');
        this.deleteBtn = document.getElementById('deleteBtn');
    }

    setupEventListeners() {
        this.editor.addEventListener('input', this.handleEditorChange.bind(this));
        
        // Auto-save functionality
        this.editor.addEventListener('input', () => {
            clearTimeout(this.autoSaveTimeout);
            this.autoSaveTimeout = setTimeout(this.autoSave.bind(this), 2000);
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', this.handleKeyboardShortcuts.bind(this));
    }

    loadFile(file) {
        this.currentFile = file;
        this.editor.value = file.content;
        this.editor.disabled = false;
        this.currentFileName.textContent = file.name;
        this.updateFileStatus();
        this.saveBtn.disabled = true;
        this.deleteBtn.disabled = false;
        this.hasUnsavedChanges = false;
        this.editor.focus();
    }

    closeCurrentFile() {
        this.currentFile = null;
        this.editor.value = '';
        this.editor.disabled = true;
        this.currentFileName.textContent = 'No file selected';
        this.updateFileStatus();
        this.saveBtn.disabled = true;
        this.deleteBtn.disabled = true;
        this.hasUnsavedChanges = false;
    }

    handleEditorChange() {
        if (!this.currentFile) return;
        
        const currentContent = this.editor.value;
        this.hasUnsavedChanges = currentContent !== this.currentFile.originalContent;
        
        this.updateFileStatus();
        this.saveBtn.disabled = !this.hasUnsavedChanges;
        
        this.currentFile.content = currentContent;
    }

    updateFileStatus() {
        if (!this.currentFile) {
            this.fileStatus.textContent = '';
            this.fileStatus.className = 'file-status';
            return;
        }
        
        if (this.hasUnsavedChanges) {
            this.fileStatus.textContent = '● Unsaved';
            this.fileStatus.className = 'file-status unsaved';
        } else {
            this.fileStatus.textContent = '✓ Saved';
            this.fileStatus.className = 'file-status saved';
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
                    this.updateFileStatus();
                    this.saveBtn.disabled = true;
                    showNotification('File saved successfully', 'success');
                }
            }
        } catch (error) {
            console.error('Error saving file:', error);
            showNotification('Failed to save file', 'error');
        }
    }

    async autoSave() {
        if (this.hasUnsavedChanges && this.currentFile) {
            await this.saveCurrentFile();
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
                    if (window.fileManager) {
                        window.fileManager.loadUserFiles();
                    }
                }
            }
        } catch (error) {
            console.error('Error deleting file:', error);
            showNotification('Failed to delete file', 'error');
        }
    }

    handleKeyboardShortcuts(e) {
        // Ctrl/Cmd + S to save
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            this.saveCurrentFile();
        }
        
        // Ctrl/Cmd + N to create new file
        if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
            e.preventDefault();
            if (window.fileManager) {
                window.fileManager.showCreateFileModal();
            }
        }
        
        // Ctrl/Cmd + O to open file (show file browser)
        if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
            e.preventDefault();
            if (window.panelManager) {
                window.panelManager.showFilesPanel();
            }
        }
        
        // Ctrl/Cmd + F to search
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            if (window.searchManager) {
                window.searchManager.showSearchModal();
            }
        }
        
        // Ctrl/Cmd + Shift + F to search in files
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
            e.preventDefault();
            if (window.searchManager) {
                window.searchManager.showSearchModal();
            }
        }
    }

    // Code insertion from chat
    async addCodeToCurrentFile(codeContent, fileName) {
        if (!this.currentFile) {
            showNotification('No file is currently open. Please open a file first.', 'error');
            return;
        }
        
        try {
            // Get current editor content
            const currentContent = this.editor.value;
            
            // Add the code to the end of the current file
            const newContent = currentContent + '\n\n' + codeContent;
            
            // Update the editor
            this.editor.value = newContent;
            
            // Mark as unsaved
            this.hasUnsavedChanges = true;
            this.updateFileStatus();
            
            // Show success notification
            showNotification(`Code from ${fileName} added to current file. Don't forget to save!`, 'success');
            
            // Trigger change event
            this.editor.dispatchEvent(new Event('input'));
            
        } catch (error) {
            showNotification('Failed to add code to file: ' + error.message, 'error');
        }
    }

    // Get current file info
    getCurrentFile() {
        return this.currentFile;
    }

    // Check if there are unsaved changes
    hasUnsavedChanges() {
        return this.hasUnsavedChanges;
    }

    // Get editor content
    getEditorContent() {
        return this.editor.value;
    }

    // Set editor content
    setEditorContent(content) {
        this.editor.value = content;
        if (this.currentFile) {
            this.currentFile.content = content;
            this.hasUnsavedChanges = content !== this.currentFile.originalContent;
            this.updateFileStatus();
        }
    }
}

// Export for use in other modules
window.EditorManager = EditorManager; 