// Chat Management Module
class ChatManager {
    constructor() {
        this.agentMode = false;
        this.attachedFiles = [];
        
        this.initializeElements();
        this.setupEventListeners();
    }

    initializeElements() {
        this.chatPanel = document.getElementById('chatPanel');
        this.chatMessages = document.getElementById('chatMessages');
        this.chatInputForm = document.getElementById('chatInputForm');
        this.chatInput = document.getElementById('chatInput');
        this.chatResizer = document.getElementById('chatResizer');
        this.agentModeBtn = document.getElementById('agentModeBtn');
        this.chatFileInput = document.getElementById('chatFileInput');
        this.chatAttachments = document.getElementById('chatAttachments');
    }

    setupEventListeners() {
        this.chatInputForm.addEventListener('submit', this.sendChatMessage.bind(this));
        this.agentModeBtn.addEventListener('click', this.toggleAgentMode.bind(this));
        this.chatFileInput.addEventListener('change', this.handleFileAttachment.bind(this));
        
        // Chat panel resizer
        this.chatResizer.addEventListener('mousedown', this.startResize.bind(this));
    }

    showChatPanel() {
        this.chatPanel.style.display = 'flex';
        if (window.panelManager) {
            window.panelManager.setTopbarActive('showChatBtn');
        }
    }

    hideChatPanel() {
        this.chatPanel.style.display = 'none';
    }

    toggleAgentMode() {
        this.agentMode = !this.agentMode;
        this.agentModeBtn.classList.toggle('active', this.agentMode);
        this.agentModeBtn.textContent = this.agentMode ? 'Agent Mode (On)' : 'Agent Mode';
    }

    async sendChatMessage(e) {
        e.preventDefault();
        const message = this.chatInput.value.trim();
        if (!message) return;

        this.chatInput.value = '';
        
        if (!window.authManager || !window.authManager.storedApiKey) {
            this.addChatMessage('system', 'Please enter your API key first.');
            if (window.authManager) {
                window.authManager.showApiKeyModal();
            }
            return;
        }
        
        this.addChatMessage('user', message);
        this.addChatMessage('system', 'Thinking...');
        
        let responseText = '';
        try {
            if (window.authManager.storedProvider === 'openai') {
                responseText = await this.callOpenAIChatAPI(message, window.authManager.storedApiKey);
            } else if (window.authManager.storedProvider === 'claude') {
                responseText = await this.callClaudeChatAPI(message, window.authManager.storedApiKey);
            } else {
                responseText = 'Unknown provider.';
            }
        } catch (err) {
            responseText = 'Error: ' + err.message;
        }
        
        this.removeLastSystemMessage();
        this.addChatMessage('assistant', responseText);
    }

    addChatMessage(sender, text) {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'chat-message ' + sender;
        
        // Add timestamp
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const timeSpan = document.createElement('span');
        timeSpan.className = 'message-time';
        timeSpan.textContent = timestamp;
        
        // Parse and format the message content
        const formattedContent = this.parseMessageContent(text);
        msgDiv.innerHTML = formattedContent;
        msgDiv.appendChild(timeSpan);
        
        this.chatMessages.appendChild(msgDiv);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
        
        // Add event listeners for code block buttons
        if (sender === 'assistant') {
            const addButtons = msgDiv.querySelectorAll('.add-to-file-btn');
            addButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    const codeBlock = btn.closest('.code-block');
                    const codeContent = codeBlock.querySelector('pre code').textContent;
                    const fileName = btn.dataset.fileName || 'untitled';
                    if (window.editorManager) {
                        window.editorManager.addCodeToCurrentFile(codeContent, fileName);
                    }
                });
            });
        }
    }

    parseMessageContent(text) {
        // Replace "Thinking..." with typing indicator
        if (text === 'Thinking...') {
            return `
                <div class="typing-indicator">
                    <span>AI is thinking</span>
                    <div class="dots">
                        <div class="dot"></div>
                        <div class="dot"></div>
                        <div class="dot"></div>
                    </div>
                </div>
            `;
        }
        
        // Parse code blocks (```language filename)
        let processedText = text.replace(/```(\w+)?\s*([^\n]*)\n([\s\S]*?)```/g, (match, language, filename, code) => {
            const lang = language || 'text';
            const fileName = filename.trim() || `${lang}.${this.getFileExtension(lang)}`;
            const highlightedCode = this.syntaxHighlight(code, lang);
            const currentFile = window.editorManager ? window.editorManager.getCurrentFile() : null;
            const isCurrentFile = currentFile && currentFile.name === fileName;
            
            return `
                <div class="code-block">
                    <div class="code-header">
                        <span class="file-name">${fileName}</span>
                        <button class="add-to-file-btn" data-file-name="${fileName}" ${!currentFile ? 'disabled' : ''}>
                            ${isCurrentFile ? 'Add to Current File' : 'Add to File'}
                        </button>
                    </div>
                    <pre><code>${highlightedCode}</code></pre>
                </div>
            `;
        });
        
        // Parse inline code (`code`)
        processedText = processedText.replace(/`([^`]+)`/g, '<span class="inline-code">$1</span>');
        
        // Convert line breaks to <br> tags
        processedText = processedText.replace(/\n/g, '<br>');
        
        return processedText;
    }

    getFileExtension(language) {
        const extensions = {
            'javascript': 'js', 'js': 'js',
            'typescript': 'ts', 'ts': 'ts',
            'html': 'html', 'css': 'css',
            'python': 'py', 'py': 'py',
            'java': 'java', 'cpp': 'cpp', 'c': 'c',
            'csharp': 'cs', 'cs': 'cs',
            'php': 'php', 'ruby': 'rb',
            'go': 'go', 'rust': 'rs', 'rs': 'rs',
            'swift': 'swift', 'kotlin': 'kt',
            'scala': 'scala', 'r': 'r', 'sql': 'sql',
            'bash': 'sh', 'shell': 'sh', 'sh': 'sh',
            'yaml': 'yml', 'yml': 'yml',
            'json': 'json', 'xml': 'xml',
            'markdown': 'md', 'md': 'md'
        };
        return extensions[language.toLowerCase()] || 'txt';
    }

    syntaxHighlight(code, language) {
        let highlighted = code;
        
        switch (language.toLowerCase()) {
            case 'javascript':
            case 'js':
                highlighted = this.highlightJavaScript(code);
                break;
            case 'html':
                highlighted = this.highlightHTML(code);
                break;
            case 'css':
                highlighted = this.highlightCSS(code);
                break;
            case 'python':
            case 'py':
                highlighted = this.highlightPython(code);
                break;
            case 'java':
                highlighted = this.highlightJava(code);
                break;
            case 'cpp':
                highlighted = this.highlightCpp(code);
                break;
            case 'c':
                highlighted = this.highlightC(code);
                break;
            default:
                highlighted = this.escapeHtml(code);
        }
        
        return highlighted;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    highlightJavaScript(code) {
        return code
            .replace(/\b(const|let|var|function|return|if|else|for|while|class|import|export|default|async|await|try|catch|finally|throw|new|this|super|extends|static|public|private|protected|interface|type|enum|namespace|module|require|from|as)\b/g, '<span class="keyword">$1</span>')
            .replace(/\b(console|document|window|Math|Date|Array|Object|String|Number|Boolean|Promise|fetch|JSON|localStorage|sessionStorage)\b/g, '<span class="function">$1</span>')
            .replace(/(["'`])((?:\\.|(?!\1)[^\\])*?)\1/g, '<span class="string">$1$2$1</span>')
            .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="number">$1</span>')
            .replace(/(\/\/.*$)/gm, '<span class="comment">$1</span>')
            .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="comment">$1</span>')
            .replace(/([+\-*/%=<>!&|^~?:,;.()[\]{}])/g, '<span class="operator">$1</span>');
    }

    highlightHTML(code) {
        return code
            .replace(/(&lt;\/?)([a-zA-Z][a-zA-Z0-9]*)([^&]*?)(&gt;)/g, '<span class="keyword">$1$2$3$4</span>')
            .replace(/(["'])((?:\\.|(?!\1)[^\\])*?)\1/g, '<span class="string">$1$2$1</span>')
            .replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="comment">$1</span>')
            .replace(/([+\-*/%=<>!&|^~?:,;.()[\]{}])/g, '<span class="operator">$1</span>');
    }

    highlightCSS(code) {
        return code
            .replace(/([a-zA-Z-]+)(?=\s*:)/g, '<span class="function">$1</span>')
            .replace(/(["'])((?:\\.|(?!\1)[^\\])*?)\1/g, '<span class="string">$1$2$1</span>')
            .replace(/\b(\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|deg|rad|turn|s|ms)?)\b/g, '<span class="number">$1</span>')
            .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="comment">$1</span>')
            .replace(/([+\-*/%=<>!&|^~?:,;.()[\]{}])/g, '<span class="operator">$1</span>');
    }

    highlightPython(code) {
        return code
            .replace(/\b(def|class|import|from|as|if|elif|else|for|while|try|except|finally|with|return|yield|pass|break|continue|raise|True|False|None|and|or|not|in|is|lambda|global|nonlocal|del|assert)\b/g, '<span class="keyword">$1</span>')
            .replace(/(["'`])((?:\\.|(?!\1)[^\\])*?)\1/g, '<span class="string">$1$2$1</span>')
            .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="number">$1</span>')
            .replace(/(#.*$)/gm, '<span class="comment">$1</span>')
            .replace(/([+\-*/%=<>!&|^~?:,;.()[\]{}])/g, '<span class="operator">$1</span>');
    }

    highlightJava(code) {
        return code
            .replace(/\b(public|private|protected|static|final|abstract|class|interface|extends|implements|import|package|new|this|super|return|if|else|for|while|do|switch|case|default|try|catch|finally|throw|throws|break|continue|void|int|long|float|double|boolean|char|byte|short|String|Object|null|true|false)\b/g, '<span class="keyword">$1</span>')
            .replace(/(["'`])((?:\\.|(?!\1)[^\\])*?)\1/g, '<span class="string">$1$2$1</span>')
            .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="number">$1</span>')
            .replace(/(\/\/.*$)/gm, '<span class="comment">$1</span>')
            .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="comment">$1</span>')
            .replace(/([+\-*/%=<>!&|^~?:,;.()[\]{}])/g, '<span class="operator">$1</span>');
    }

    highlightCpp(code) {
        return code
            .replace(/\b(auto|break|case|char|const|continue|default|do|double|else|enum|extern|float|for|goto|if|int|long|register|return|short|signed|sizeof|static|struct|switch|typedef|union|unsigned|void|volatile|while|class|namespace|template|typename|virtual|public|private|protected|friend|inline|explicit|mutable|operator|this|new|delete|true|false|nullptr|using|std|cout|cin|endl|string|vector|map|set|list|queue|stack|priority_queue|unique_ptr|shared_ptr|weak_ptr|make_unique|make_shared|move|forward|decltype|constexpr|noexcept|override|final|alignas|alignof|char16_t|char32_t|const_cast|dynamic_cast|reinterpret_cast|static_cast|typeid|type_info|wchar_t)\b/g, '<span class="keyword">$1</span>')
            .replace(/\b(printf|scanf|malloc|free|calloc|realloc|strcpy|strcat|strlen|strcmp|fopen|fclose|fread|fwrite|fprintf|fscanf|getchar|putchar|gets|puts|atoi|atof|itoa|sprintf|sscanf|memcpy|memmove|memset|memcmp|qsort|bsearch|rand|srand|time|clock|exit|abort|assert|setjmp|longjmp|va_start|va_arg|va_end|va_copy)\b/g, '<span class="function">$1</span>')
            .replace(/(["'`])((?:\\.|(?!\1)[^\\])*?)\1/g, '<span class="string">$1$2$1</span>')
            .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="number">$1</span>')
            .replace(/(\/\/.*$)/gm, '<span class="comment">$1</span>')
            .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="comment">$1</span>')
            .replace(/([+\-*/%=<>!&|^~?:,;.()[\]{}])/g, '<span class="operator">$1</span>');
    }

    highlightC(code) {
        return code
            .replace(/\b(auto|break|case|char|const|continue|default|do|double|else|enum|extern|float|for|goto|if|int|long|register|return|short|signed|sizeof|static|struct|switch|typedef|union|unsigned|void|volatile|while|inline|restrict|_Bool|_Complex|_Imaginary)\b/g, '<span class="keyword">$1</span>')
            .replace(/\b(printf|scanf|malloc|free|calloc|realloc|strcpy|strcat|strlen|strcmp|fopen|fclose|fread|fwrite|fprintf|fscanf|getchar|putchar|gets|puts|atoi|atof|itoa|sprintf|sscanf|memcpy|memmove|memset|memcmp|qsort|bsearch|rand|srand|time|clock|exit|abort|assert|setjmp|longjmp|va_start|va_arg|va_end|va_copy)\b/g, '<span class="function">$1</span>')
            .replace(/\b(NULL|true|false|TRUE|FALSE|EOF|BUFSIZ|FILENAME_MAX|FOPEN_MAX|L_tmpnam|TMP_MAX|_IOFBF|_IOLBF|_IONBF|SEEK_CUR|SEEK_END|SEEK_SET|EXIT_FAILURE|EXIT_SUCCESS|RAND_MAX|CLOCKS_PER_SEC)\b/g, '<span class="number">$1</span>')
            .replace(/(["'`])((?:\\.|(?!\1)[^\\])*?)\1/g, '<span class="string">$1$2$1</span>')
            .replace(/\b(\d+(?:\.\d+)?(?:[uU]?[lL]?[lL]?|[uU]?[lL]?[lL]?[uU]?))\b/g, '<span class="number">$1</span>')
            .replace(/\b(0[xX][0-9a-fA-F]+(?:[uU]?[lL]?[lL]?|[uU]?[lL]?[lL]?[uU]?))\b/g, '<span class="number">$1</span>')
            .replace(/(\/\/.*$)/gm, '<span class="comment">$1</span>')
            .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="comment">$1</span>')
            .replace(/([+\-*/%=<>!&|^~?:,;.()[\]{}])/g, '<span class="operator">$1</span>');
    }

    removeLastSystemMessage() {
        const messages = document.querySelectorAll('.chat-message.system');
        if (messages.length > 0) {
            messages[messages.length - 1].remove();
        }
    }

    async callOpenAIChatAPI(message, apiKey) {
        const model = window.authManager.storedModel || 'gpt-3.5-turbo';
        console.log('=== API Call Debug ===');
        console.log('storedModel variable:', window.authManager.storedModel);
        console.log('Using model:', model);
        console.log('Dropdown current value:', document.getElementById('chatModel')?.value);
        
        const endpoint = 'https://api.openai.com/v1/chat/completions';
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        };
        const body = JSON.stringify({
            model,
            messages: [{ role: 'user', content: message }]
        });
        
        console.log('API request body:', body);
        const response = await fetch(endpoint, {
            method: 'POST',
            headers,
            body
        });
        
        if (!response.ok) {
            throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('API response:', data);
        console.log('Response content:', data.choices?.[0]?.message?.content);
        console.log('=== End API Call Debug ===');
        
        return data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content
            ? data.choices[0].message.content.trim()
            : '[OpenAI] No response.';
    }

    async callClaudeChatAPI(message, apiKey) {
        // TODO: Implement real API call
        return '[Claude] This is a placeholder response.';
    }

    handleFileAttachment(e) {
        this.attachedFiles = Array.from(e.target.files);
        this.renderChatAttachments();
    }

    renderChatAttachments() {
        if (this.attachedFiles.length === 0) {
            this.chatAttachments.style.display = 'none';
            this.chatAttachments.innerHTML = '';
            return;
        }
        
        this.chatAttachments.style.display = 'block';
        this.chatAttachments.innerHTML = this.attachedFiles.map(f => 
            `<div class='chat-attachment-item'>${f.name} (${this.formatFileSize(f.size)})</div>`
        ).join('');
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    startResize(e) {
        let isDragging = true;
        let startX = e.clientX;
        let startWidth = this.chatPanel.offsetWidth;
        
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
        
        const handleMouseMove = (e) => {
            if (!isDragging) return;
            const dx = startX - e.clientX;
            let newWidth = startWidth + dx;
            newWidth = Math.max(220, Math.min(window.innerWidth * 0.6, newWidth));
            this.chatPanel.style.width = newWidth + 'px';
        };
        
        const handleMouseUp = () => {
            if (isDragging) {
                isDragging = false;
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            }
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
        
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }
}

// Export for use in other modules
window.ChatManager = ChatManager; 