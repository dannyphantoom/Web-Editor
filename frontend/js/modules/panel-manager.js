// Panel Management Module
class PanelManager {
    constructor() {
        this.isDragging = false;
        this.startX = 0;
        this.startY = 0;
        this.startWidth = 0;
        this.startHeight = 0;
        this.activePanel = null;
        
        this.initializeElements();
        this.setupEventListeners();
    }

    initializeElements() {
        this.sidebar = document.getElementById('sidebar');
        this.vcsPanel = document.getElementById('vcsPanel');
        this.vcsPanelSidebar = document.getElementById('vcsPanelSidebar');
        this.filePanel = document.getElementById('filePanel');
        this.terminalPanel = document.getElementById('terminalPanel');
        this.chatPanel = document.getElementById('chatPanel');
        this.panelResizer = document.getElementById('panelResizer');
        this.terminalResizer = document.getElementById('terminalResizer');
        this.chatResizer = document.getElementById('chatResizer');
    }

    setupEventListeners() {
        // Panel resizer
        if (this.panelResizer) {
            this.panelResizer.addEventListener('mousedown', this.handlePanelResizerMouseDown.bind(this));
        }
        
        // Terminal resizer
        if (this.terminalResizer) {
            this.terminalResizer.addEventListener('mousedown', this.handleTerminalResizerMouseDown.bind(this));
        }
        
        // Chat resizer
        if (this.chatResizer) {
            this.chatResizer.addEventListener('mousedown', this.handleChatResizerMouseDown.bind(this));
        }
        
        // Global mouse events
        window.addEventListener('mousemove', this.handleMouseMove.bind(this));
        window.addEventListener('mouseup', this.handleMouseUp.bind(this));
    }

    handlePanelResizerMouseDown(e) {
        this.isDragging = true;
        this.startX = e.clientX;
        this.activePanel = this.getActivePanel();
        if (this.activePanel) {
            this.startWidth = this.activePanel.offsetWidth;
        }
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
    }

    handleTerminalResizerMouseDown(e) {
        this.isDragging = true;
        this.startY = e.clientY;
        this.startHeight = this.terminalPanel.offsetHeight;
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
    }

    handleChatResizerMouseDown(e) {
        this.isDragging = true;
        this.startX = e.clientX;
        this.startWidth = this.chatPanel.offsetWidth;
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
    }

    handleMouseMove(e) {
        if (!this.isDragging) return;
        
        if (this.activePanel && this.startWidth > 0) {
            // Panel resizing
            const dx = e.clientX - this.startX;
            let newWidth = this.startWidth + dx;
            newWidth = Math.max(120, Math.min(window.innerWidth * 0.5, newWidth));
            this.activePanel.style.width = newWidth + 'px';
        } else if (this.terminalPanel && this.startHeight > 0) {
            // Terminal resizing
            const dy = this.startY - e.clientY;
            let newHeight = this.startHeight + dy;
            newHeight = Math.max(120, Math.min(window.innerHeight * 0.6, newHeight));
            this.terminalPanel.style.height = newHeight + 'px';
        } else if (this.chatPanel && this.startWidth > 0) {
            // Chat resizing
            const dx = this.startX - e.clientX;
            let newWidth = this.startWidth + dx;
            newWidth = Math.max(220, Math.min(window.innerWidth * 0.6, newWidth));
            this.chatPanel.style.width = newWidth + 'px';
        }
    }

    handleMouseUp() {
        if (this.isDragging) {
            this.isDragging = false;
            this.startX = 0;
            this.startY = 0;
            this.startWidth = 0;
            this.startHeight = 0;
            this.activePanel = null;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    }

    getActivePanel() {
        if (this.sidebar && this.sidebar.classList.contains('active')) {
            return this.sidebar;
        } else if (this.vcsPanel && this.vcsPanel.classList.contains('active')) {
            return this.vcsPanel;
        }
        return null;
    }

    showFilesPanel() {
        if (this.sidebar) {
            this.sidebar.classList.add('active');
            this.sidebar.style.display = 'flex';
        }
        if (this.filePanel) {
            this.filePanel.style.display = 'block';
        }
        if (this.vcsPanelSidebar) {
            this.vcsPanelSidebar.style.display = 'none';
        }
        if (this.panelResizer) {
            this.panelResizer.classList.add('active');
            this.panelResizer.style.display = 'block';
        }
    }

    showVCSPanel() {
        if (this.sidebar) {
            this.sidebar.classList.add('active');
            this.sidebar.style.display = 'flex';
        }
        if (this.filePanel) {
            this.filePanel.style.display = 'none';
        }
        if (this.vcsPanelSidebar) {
            this.vcsPanelSidebar.style.display = 'block';
        }
        if (this.panelResizer) {
            this.panelResizer.classList.add('active');
            this.panelResizer.style.display = 'block';
        }
    }

    hideAllPanels() {
        if (this.sidebar) {
            this.sidebar.classList.remove('active');
            this.sidebar.style.display = 'none';
        }
        if (this.panelResizer) {
            this.panelResizer.classList.remove('active');
            this.panelResizer.style.display = 'none';
        }
    }

    showTerminalPanel() {
        if (this.terminalPanel) {
            if (this.terminalPanel.style.display === 'none' || !this.terminalPanel.style.display) {
                this.terminalPanel.style.display = 'flex';
            } else {
                this.terminalPanel.style.display = 'none';
            }
        }
    }

    hideTerminalPanel() {
        if (this.terminalPanel) {
            this.terminalPanel.style.display = 'none';
        }
    }

    showChatPanel() {
        if (this.chatPanel) {
            this.chatPanel.style.display = 'flex';
        }
    }

    hideChatPanel() {
        if (this.chatPanel) {
            this.chatPanel.style.display = 'none';
        }
    }
}

// Export for use in other modules
window.PanelManager = PanelManager; 