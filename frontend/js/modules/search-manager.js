// Search Management Module
class SearchManager {
    constructor() {
        this.searchTimeout = null;
        this.initializeElements();
        this.setupEventListeners();
    }

    initializeElements() {
        this.searchModal = document.getElementById('searchModal');
        this.searchInput = document.getElementById('searchInput');
        this.searchResults = document.getElementById('searchResults');
    }

    setupEventListeners() {
        if (this.searchInput) {
            this.searchInput.addEventListener('input', this.handleSearchInput.bind(this));
            this.searchInput.addEventListener('keydown', this.handleSearchKeydown.bind(this));
        }
    }

    showSearchModal() {
        if (this.searchModal) {
            this.searchModal.classList.add('show');
            if (this.searchInput) {
                this.searchInput.focus();
                this.searchInput.value = '';
            }
            this.searchResults.innerHTML = `
                <div class="empty-search">
                    <i class="fas fa-search"></i>
                    <p>Start typing to search files and folders</p>
                </div>
            `;
        }
    }

    closeSearchModal() {
        if (this.searchModal) {
            this.searchModal.classList.remove('show');
            if (this.searchInput) {
                this.searchInput.value = '';
            }
            this.searchResults.innerHTML = '';
        }
    }

    handleSearchInput(e) {
        const query = e.target.value.trim();
        
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(() => {
            this.performSearch(query);
        }, 300);
    }

    handleSearchKeydown(e) {
        if (e.key === 'Escape') {
            this.closeSearchModal();
        } else if (e.key === 'Enter') {
            const firstResult = this.searchResults.querySelector('.search-result-item');
            if (firstResult) {
                firstResult.click();
            }
        }
    }

    performSearch(query) {
        if (!query) {
            this.searchResults.innerHTML = `
                <div class="empty-search">
                    <i class="fas fa-search"></i>
                    <p>Start typing to search files and folders</p>
                </div>
            `;
            return;
        }
        
        const allFiles = window.fileManager ? window.fileManager.allFiles : [];
        const results = this.fuzzySearch(allFiles, query);
        
        if (results.length === 0) {
            this.searchResults.innerHTML = `
                <div class="empty-search">
                    <i class="fas fa-search"></i>
                    <p>No files found matching "${query}"</p>
                </div>
            `;
            return;
        }
        
        this.searchResults.innerHTML = results.map(result => `
            <div class="search-result-item" onclick="searchManager.selectSearchResult('${result.fullPath}', ${result.isDirectory})">
                <i class="fas ${result.isDirectory ? 'fa-folder' : 'fa-file-alt'}"></i>
                <div class="search-result-info">
                    <div class="search-result-name">${this.highlightMatch(result.name, query)}</div>
                    <div class="search-result-path">${result.fullPath}</div>
                </div>
            </div>
        `).join('');
    }

    fuzzySearch(files, query) {
        const results = [];
        const queryLower = query.toLowerCase();
        
        files.forEach(file => {
            const nameLower = file.name.toLowerCase();
            const pathLower = file.fullPath.toLowerCase();
            
            // Check if query matches file name or path
            if (nameLower.includes(queryLower) || pathLower.includes(queryLower)) {
                const score = this.calculateSearchScore(file, queryLower);
                results.push({
                    ...file,
                    score: score
                });
            }
        });
        
        // Sort by relevance score
        return results.sort((a, b) => b.score - a.score).slice(0, 10);
    }

    calculateSearchScore(file, query) {
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

    highlightMatch(text, query) {
        const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return text.replace(regex, '<span class="highlight">$1</span>');
    }

    selectSearchResult(path, isDirectory) {
        this.closeSearchModal();
        
        if (isDirectory) {
            // Navigate to the directory
            const pathParts = path.split('/');
            const dirPath = pathParts.slice(0, -1).join('/');
            if (window.fileManager) {
                window.fileManager.loadUserFiles(dirPath);
            }
        } else {
            // Open the file
            if (window.fileManager) {
                window.fileManager.openFile(path);
            }
        }
    }
}

// Export for use in other modules
window.SearchManager = SearchManager; 