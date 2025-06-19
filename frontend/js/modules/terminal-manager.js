// Terminal Manager Module
class TerminalManager {
    constructor() {
        this.terminalBody = null;
        this.terminalInput = null;
        this.terminalOutput = null;
        this.commandHistory = [];
        this.historyIndex = -1;
        this.currentDirectory = '';
        this.isConnected = false;
        
        this.initializeElements();
        this.setupEventListeners();
        this.initializeTerminal();
    }

    initializeElements() {
        this.terminalBody = document.getElementById('terminalBody');
        if (!this.terminalBody) {
            console.error('Terminal body element not found');
            return;
        }
        
        // Create terminal interface
        this.createTerminalInterface();
    }

    createTerminalInterface() {
        // Clear existing content
        this.terminalBody.innerHTML = '';
        
        // Create terminal output area
        this.terminalOutput = document.createElement('div');
        this.terminalOutput.className = 'terminal-output';
        this.terminalOutput.id = 'terminalOutput';
        
        // Add elements to terminal body
        this.terminalBody.appendChild(this.terminalOutput);
        
        // Create initial prompt
        this.createNewPrompt();
        
        // Focus on input
        setTimeout(() => {
            this.terminalInput.focus();
        }, 100);
    }

    createNewPrompt() {
        // Remove any existing input lines first
        const existingInputLines = this.terminalBody.querySelectorAll('.terminal-input-line');
        existingInputLines.forEach(line => line.remove());
        
        // Create terminal input line
        const inputLine = document.createElement('div');
        inputLine.className = 'terminal-input-line';
        
        const prompt = document.createElement('span');
        prompt.className = 'terminal-prompt';
        prompt.textContent = this.getPromptText();
        
        this.terminalInput = document.createElement('input');
        this.terminalInput.className = 'terminal-input';
        this.terminalInput.type = 'text';
        this.terminalInput.id = 'terminalInput';
        this.terminalInput.placeholder = 'Enter command...';
        this.terminalInput.autocomplete = 'off';
        this.terminalInput.spellcheck = false;
        
        inputLine.appendChild(prompt);
        inputLine.appendChild(this.terminalInput);
        
        // Add to terminal body
        this.terminalBody.appendChild(inputLine);
        
        // Setup event listeners for the new input
        this.setupInputEventListeners();
        
        // Focus on the new input
        setTimeout(() => {
            this.terminalInput.focus();
        }, 10);
    }

    getPromptText() {
        let displayPath = this.currentDirectory || '~';
        
        // Make the path more user-friendly
        if (displayPath.startsWith('/home/')) {
            const username = displayPath.split('/')[2];
            displayPath = '~' + displayPath.substring(6 + username.length);
        }
        
        // If we're in the home directory, just show ~
        if (displayPath === '~' || displayPath === '/home/' + (this.currentDirectory?.split('/')[2] || '')) {
            displayPath = '~';
        }
        
        // Get username from global currentUser variable
        let username = 'user';
        if (window.currentUser) {
            username = window.currentUser;
        }
        
        return `${username}@server:${displayPath}$ `;
    }

    setupInputEventListeners() {
        if (!this.terminalInput) return;
        
        // Handle command submission
        this.terminalInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.executeCommand();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.navigateHistory('up');
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.navigateHistory('down');
            } else if (e.key === 'Tab') {
                e.preventDefault();
                this.handleTabCompletion();
            }
        });
    }

    setupEventListeners() {
        // Handle terminal focus
        this.terminalBody.addEventListener('click', () => {
            if (this.terminalInput) {
                this.terminalInput.focus();
            }
        });
    }

    initializeTerminal() {
        this.writeOutput('Web Terminal v1.0\n');
        this.writeOutput('Type "help" for available commands.\n');
        this.writeOutput('Connected to server...\n\n');
        
        // Initial prompt is already created in createTerminalInterface
    }

    writeOutput(text, type = 'output') {
        if (!this.terminalOutput) return;
        
        const line = document.createElement('div');
        line.className = `terminal-line ${type}`;
        line.textContent = text;
        
        this.terminalOutput.appendChild(line);
        this.terminalOutput.scrollTop = this.terminalOutput.scrollHeight;
    }

    writeError(text) {
        this.writeOutput(text, 'error');
    }

    writeSuccess(text) {
        this.writeOutput(text, 'success');
    }

    async executeCommand() {
        const command = this.terminalInput.value.trim();
        if (!command) return;
        
        // Add to history
        this.commandHistory.push(command);
        this.historyIndex = this.commandHistory.length;
        
        // Display command
        this.writeOutput(`$ ${command}`, 'command');
        
        // Clear input
        this.terminalInput.value = '';
        
        // Handle built-in commands
        if (command === 'help') {
            this.showHelp();
            this.createNewPrompt();
            return;
        }
        
        if (command === 'clear') {
            this.clear();
            this.createNewPrompt();
            return;
        }
        
        try {
            const response = await fetch('/api/terminal/execute', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    command: command,
                    directory: this.currentDirectory
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                if (data.output) {
                    // Decode URL-encoded output from server
                    const decodedOutput = decodeURIComponent(data.output);
                    this.writeOutput(decodedOutput);
                }
                if (data.error) {
                    // Decode URL-encoded error from server
                    const decodedError = decodeURIComponent(data.error);
                    this.writeError(decodedError);
                }
                if (data.directory) {
                    // Decode URL-encoded directory from server
                    this.currentDirectory = decodeURIComponent(data.directory);
                }
                
                // Auto-refresh file viewer for file system operations
                this.autoRefreshFileViewer(command);
            } else {
                this.writeError(`Error: ${data.message}`);
            }
        } catch (error) {
            this.writeError(`Connection error: ${error.message}`);
        }
        
        // Create new prompt after command execution
        this.createNewPrompt();
    }

    autoRefreshFileViewer(command) {
        // List of commands that modify the file system
        const fileSystemCommands = [
            'mkdir', 'rm', 'rmdir', 'touch', 'cp', 'mv', 'echo', 'cat', '>', '>>'
        ];
        
        // Check if the command modifies the file system
        const isFileSystemCommand = fileSystemCommands.some(cmd => 
            command.includes(cmd) || 
            command.includes('>') || 
            command.includes('>>')
        );
        
        if (isFileSystemCommand) {
            // Refresh the file viewer after a short delay
            setTimeout(() => {
                if (window.fileManager) {
                    window.fileManager.loadUserFiles(window.fileManager.currentPath || '');
                } else if (typeof loadUserFiles === 'function') {
                    // Fallback to global function
                    loadUserFiles(currentPath || '');
                }
            }, 500); // 500ms delay to ensure file system changes are complete
        }
    }

    showHelp() {
        this.writeOutput('Available commands:\n');
        this.writeOutput('  ls, ls -la          - List files and directories\n');
        this.writeOutput('  pwd                 - Show current directory\n');
        this.writeOutput('  cd <directory>      - Change directory\n');
        this.writeOutput('  mkdir <name>        - Create directory\n');
        this.writeOutput('  rm <file>           - Remove file\n');
        this.writeOutput('  cp <src> <dest>     - Copy file\n');
        this.writeOutput('  mv <src> <dest>     - Move/rename file\n');
        this.writeOutput('  cat <file>          - Display file contents\n');
        this.writeOutput('  echo <text>         - Print text\n');
        this.writeOutput('  grep <pattern>      - Search for pattern\n');
        this.writeOutput('  find <path> <name>  - Find files\n');
        this.writeOutput('  whoami              - Show current user\n');
        this.writeOutput('  date                - Show current date/time\n');
        this.writeOutput('  clear               - Clear terminal\n');
        this.writeOutput('  help                - Show this help\n');
        this.writeOutput('\nNote: Some commands may be restricted for security reasons.\n');
    }

    navigateHistory(direction) {
        if (this.commandHistory.length === 0) return;
        
        if (direction === 'up') {
            if (this.historyIndex > 0) {
                this.historyIndex--;
            }
        } else if (direction === 'down') {
            if (this.historyIndex < this.commandHistory.length - 1) {
                this.historyIndex++;
            } else {
                this.historyIndex = this.commandHistory.length;
                this.terminalInput.value = '';
                return;
            }
        }
        
        if (this.historyIndex >= 0 && this.historyIndex < this.commandHistory.length) {
            this.terminalInput.value = this.commandHistory[this.historyIndex];
        }
    }

    handleTabCompletion() {
        // Basic tab completion - could be enhanced with file/directory completion
        const currentInput = this.terminalInput.value;
        const words = currentInput.split(' ');
        const lastWord = words[words.length - 1];
        
        // Common commands that start with the current input
        const commonCommands = ['ls', 'cd', 'pwd', 'mkdir', 'rm', 'cp', 'mv', 'cat', 'echo', 'grep', 'find', 'chmod', 'chown'];
        const matches = commonCommands.filter(cmd => cmd.startsWith(lastWord));
        
        if (matches.length === 1) {
            words[words.length - 1] = matches[0];
            this.terminalInput.value = words.join(' ');
        } else if (matches.length > 1) {
            this.writeOutput(matches.join(' '));
        }
    }

    clear() {
        if (this.terminalOutput) {
            this.terminalOutput.innerHTML = '';
        }
        // Remove any existing input lines
        const inputLines = this.terminalBody.querySelectorAll('.terminal-input-line');
        inputLines.forEach(line => line.remove());
        // Create a new prompt after clearing
        this.createNewPrompt();
    }

    resize() {
        // Handle terminal resize if needed
        if (this.terminalOutput) {
            this.terminalOutput.scrollTop = this.terminalOutput.scrollHeight;
        }
    }
}

// Export for use in other modules
window.TerminalManager = TerminalManager; 