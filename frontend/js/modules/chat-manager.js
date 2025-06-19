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
        
        // Model selection
        const chatModelSelect = document.getElementById('chatModel');
        if (chatModelSelect) {
            chatModelSelect.addEventListener('change', (e) => {
                if (window.authManager) {
                    window.authManager.storedModel = e.target.value;
                }
            });
        }
    }

    showChatPanel() {
        this.chatPanel.style.display = 'flex';
        if (window.panelManager) {
            window.panelManager.setTopbarActive('showChatBtn');
        }
        
        // Sync model dropdown with stored value
        this.syncModelDropdown();
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
            console.log('Found', addButtons.length, 'add-to-file buttons');
            addButtons.forEach((btn, index) => {
                console.log('Setting up event listener for button', index);
                btn.addEventListener('click', (e) => {
                    console.log('Add to file button clicked');
                    e.preventDefault();
                    e.stopPropagation();
                    
                    const codeBlock = btn.closest('.code-block');
                    if (!codeBlock) {
                        console.error('Could not find code block');
                        return;
                    }
                    
                    const codeElement = codeBlock.querySelector('pre code');
                    if (!codeElement) {
                        console.error('Could not find code element');
                        return;
                    }
                    
                    const codeContent = codeElement.textContent;
                    const fileName = btn.dataset.fileName || 'untitled';
                    
                    console.log('Adding code to file:', fileName, 'Content length:', codeContent.length);
                    
                    if (window.editorManager) {
                        try {
                            window.editorManager.addCodeToCurrentFile(codeContent, fileName);
                            console.log('Successfully added code to file');
                        } catch (error) {
                            console.error('Error adding code to file:', error);
                        }
                    } else {
                        console.error('Editor manager not available');
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
                        <button class="add-to-file-btn" data-file-name="${fileName}">
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
                // For default case, just escape HTML to prevent XSS
                highlighted = this.escapeHtml(code);
        }
        
        return highlighted;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    decodeHtmlEntities(text) {
        const div = document.createElement('div');
        div.innerHTML = text;
        return div.textContent || div.innerText || '';
    }

    highlightJavaScript(code) {
        const decodedCode = this.decodeHtmlEntities(code);
        return decodedCode
            .replace(/\b(const|let|var|function|return|if|else|for|while|class|import|export|default|async|await|try|catch|finally|throw|new|this|super|extends|static|public|private|protected|interface|type|enum|namespace|module|require|from|as)\b/g, '<span class="keyword">$1</span>')
            .replace(/\b(console|document|window|Math|Date|Array|Object|String|Number|Boolean|Promise|fetch|JSON|localStorage|sessionStorage)\b/g, '<span class="function">$1</span>')
            .replace(/(["'`])((?:\\.|(?!\1)[^\\])*?)\1/g, '<span class="string">$1$2$1</span>')
            .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="number">$1</span>')
            .replace(/(\/\/.*$)/gm, '<span class="comment">$1</span>')
            .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="comment">$1</span>')
            .replace(/([+\-*/%=<>!&|^~?:,;.()[\]{}])/g, '<span class="operator">$1</span>');
    }

    highlightHTML(code) {
        const decodedCode = this.decodeHtmlEntities(code);
        return decodedCode
            .replace(/(&lt;\/?)([a-zA-Z][a-zA-Z0-9]*)([^&]*?)(&gt;)/g, '<span class="keyword">$1$2$3$4</span>')
            .replace(/(["'])((?:\\.|(?!\1)[^\\])*?)\1/g, '<span class="string">$1$2$1</span>')
            .replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="comment">$1</span>')
            .replace(/([+\-*/%=<>!&|^~?:,;.()[\]{}])/g, '<span class="operator">$1</span>');
    }

    highlightCSS(code) {
        const decodedCode = this.decodeHtmlEntities(code);
        return decodedCode
            .replace(/([a-zA-Z-]+)(?=\s*:)/g, '<span class="function">$1</span>')
            .replace(/(["'])((?:\\.|(?!\1)[^\\])*?)\1/g, '<span class="string">$1$2$1</span>')
            .replace(/\b(\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|deg|rad|turn|s|ms)?)\b/g, '<span class="number">$1</span>')
            .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="comment">$1</span>')
            .replace(/([+\-*/%=<>!&|^~?:,;.()[\]{}])/g, '<span class="operator">$1</span>');
    }

    highlightPython(code) {
        const decodedCode = this.decodeHtmlEntities(code);
        return decodedCode
            .replace(/\b(def|class|import|from|as|if|elif|else|for|while|try|except|finally|with|return|yield|pass|break|continue|raise|True|False|None|and|or|not|in|is|lambda|global|nonlocal|del|assert)\b/g, '<span class="keyword">$1</span>')
            .replace(/(["'`])((?:\\.|(?!\1)[^\\])*?)\1/g, '<span class="string">$1$2$1</span>')
            .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="number">$1</span>')
            .replace(/(#.*$)/gm, '<span class="comment">$1</span>')
            .replace(/([+\-*/%=<>!&|^~?:,;.()[\]{}])/g, '<span class="operator">$1</span>');
    }

    highlightJava(code) {
        const decodedCode = this.decodeHtmlEntities(code);
        return decodedCode
            .replace(/\b(public|private|protected|static|final|abstract|class|interface|extends|implements|import|package|new|this|super|return|if|else|for|while|do|switch|case|default|try|catch|finally|throw|throws|break|continue|void|int|long|float|double|boolean|char|byte|short|String|Object|null|true|false)\b/g, '<span class="keyword">$1</span>')
            .replace(/(["'`])((?:\\.|(?!\1)[^\\])*?)\1/g, '<span class="string">$1$2$1</span>')
            .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="number">$1</span>')
            .replace(/(\/\/.*$)/gm, '<span class="comment">$1</span>')
            .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="comment">$1</span>')
            .replace(/([+\-*/%=<>!&|^~?:,;.()[\]{}])/g, '<span class="operator">$1</span>');
    }

    highlightCpp(code) {
        const decodedCode = this.decodeHtmlEntities(code);
        return decodedCode
            .replace(/\b(auto|break|case|char|const|continue|default|do|double|else|enum|extern|float|for|goto|if|int|long|register|return|short|signed|sizeof|static|struct|switch|typedef|union|unsigned|void|volatile|while|class|namespace|template|typename|virtual|public|private|protected|friend|inline|explicit|mutable|operator|this|new|delete|true|false|nullptr|using|std|cout|cin|endl|string|vector|map|set|list|queue|stack|priority_queue|unique_ptr|shared_ptr|weak_ptr|make_unique|make_shared|move|forward|decltype|constexpr|noexcept|override|final|alignas|alignof|char16_t|char32_t|const_cast|dynamic_cast|reinterpret_cast|static_cast|typeid|type_info|wchar_t)\b/g, '<span class="keyword">$1</span>')
            .replace(/\b(printf|scanf|malloc|free|calloc|realloc|strcpy|strcat|strlen|strcmp|fopen|fclose|fread|fwrite|fprintf|fscanf|getchar|putchar|gets|puts|atoi|atof|itoa|sprintf|sscanf|memcpy|memmove|memset|memcmp|qsort|bsearch|rand|srand|time|clock|exit|abort|assert|setjmp|longjmp|va_start|va_arg|va_end|va_copy)\b/g, '<span class="function">$1</span>')
            .replace(/(["'`])((?:\\.|(?!\1)[^\\])*?)\1/g, '<span class="string">$1$2$1</span>')
            .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="number">$1</span>')
            .replace(/(\/\/.*$)/gm, '<span class="comment">$1</span>')
            .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="comment">$1</span>')
            .replace(/([+\-*/%=<>!&|^~?:,;.()[\]{}])/g, '<span class="operator">$1</span>');
    }

    highlightC(code) {
        // Don't decode HTML entities - work with the raw code
        let highlighted = code;
        
        // Apply syntax highlighting in a very simple way
        // Use word boundaries and careful regex to avoid conflicts
        
        // 1. Comments first
        highlighted = highlighted
            .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="comment">$1</span>')
            .replace(/(\/\/.*$)/gm, '<span class="comment">$1</span>');
        
        // 2. String literals (but not inside comments)
        highlighted = highlighted.replace(/(["'`])((?:\\.|(?!\1)[^\\])*?)\1/g, '<span class="string">$1$2$1</span>');
        
        // 3. Numbers
        highlighted = highlighted
            .replace(/\b(0[xX][0-9a-fA-F]+)\b/g, '<span class="number">$1</span>')
            .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="number">$1</span>');
        
        // 4. C keywords (using word boundaries)
        const keywords = ['auto', 'break', 'case', 'char', 'const', 'continue', 'default', 'do', 
                         'double', 'else', 'enum', 'extern', 'float', 'for', 'goto', 'if', 'int', 
                         'long', 'register', 'return', 'short', 'signed', 'sizeof', 'static', 
                         'struct', 'switch', 'typedef', 'union', 'unsigned', 'void', 'volatile', 'while'];
        
        keywords.forEach(keyword => {
            const regex = new RegExp(`\\b${keyword}\\b`, 'g');
            highlighted = highlighted.replace(regex, `<span class="keyword">${keyword}</span>`);
        });
        
        // 5. C functions
        const functions = ['printf', 'scanf', 'malloc', 'free', 'calloc', 'realloc', 'strcpy', 'strcat',
                          'strlen', 'strcmp', 'fopen', 'fclose', 'fread', 'fwrite', 'fprintf', 'fscanf',
                          'getchar', 'putchar', 'gets', 'puts', 'atoi', 'atof', 'itoa', 'sprintf',
                          'sscanf', 'memcpy', 'memmove', 'memset', 'memcmp', 'qsort', 'bsearch',
                          'rand', 'srand', 'time', 'clock', 'exit', 'abort', 'assert'];
        
        functions.forEach(func => {
            const regex = new RegExp(`\\b${func}\\b`, 'g');
            highlighted = highlighted.replace(regex, `<span class="function">${func}</span>`);
        });
        
        // 6. Operators (simple approach)
        const operators = ['+', '-', '*', '/', '%', '=', '<', '>', '!', '&', '|', '^', '~', '?', ':', ',', ';', '.', '(', ')', '[', ']', '{', '}'];
        operators.forEach(op => {
            const escapedOp = op.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`(?<!<span[^>]*>)(${escapedOp})(?!</span>)`, 'g');
            highlighted = highlighted.replace(regex, `<span class="operator">${op}</span>`);
        });
        
        return highlighted;
    }

    removeLastSystemMessage() {
        const messages = document.querySelectorAll('.chat-message.system');
        if (messages.length > 0) {
            messages[messages.length - 1].remove();
        }
    }

    async callOpenAIChatAPI(message, apiKey) {
        // Get the selected model from the dropdown
        const chatModelSelect = document.getElementById('chatModel');
        const selectedModel = chatModelSelect ? chatModelSelect.value : 'gpt-3.5-turbo';
        
        // Update the stored model to match the selected one
        if (window.authManager) {
            window.authManager.storedModel = selectedModel;
        }
        
        console.log('=== API Call Debug ===');
        console.log('Selected model from dropdown:', selectedModel);
        console.log('storedModel variable:', window.authManager?.storedModel);
        console.log('Using model:', selectedModel);
        
        const endpoint = 'https://api.openai.com/v1/chat/completions';
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        };
        const body = JSON.stringify({
            model: selectedModel,
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

    syncModelDropdown() {
        const chatModelSelect = document.getElementById('chatModel');
        if (chatModelSelect && window.authManager) {
            chatModelSelect.value = window.authManager.storedModel || 'gpt-3.5-turbo';
        }
    }
}

// Export for use in other modules
window.ChatManager = ChatManager; 