# Web-Based Text Editor

A modern, secure web-based text editor built with C++ backend and HTML/CSS/JavaScript frontend. Features user authentication, private file systems, and real-time editing capabilities.

## Features

### 🔐 User Authentication
- Secure user registration and login
- Password hashing with SHA-256 and salt
- Session-based authentication with automatic timeout
- Private user filesystems

### 📁 File Management
- Create, read, update, and delete files
- Private file storage per user
- File size and modification time tracking
- Real-time file status indicators

### ✏️ Text Editor
- Modern, responsive interface
- Real-time editing with auto-save
- Syntax highlighting ready
- Keyboard shortcuts (Ctrl+S to save, Ctrl+N for new file)
- Unsaved changes detection

### 🎨 Modern UI/UX
- Clean, professional design
- Responsive layout for mobile and desktop
- Smooth animations and transitions
- Intuitive file browser sidebar
- Toast notifications for user feedback

## Architecture

### Backend (C++)
- **WebServer Class**: Main server implementation
- **User Management**: Registration, authentication, session handling
- **File System**: Private user directories, file operations
- **HTTP Parser**: Custom HTTP request/response handling
- **Security**: Password hashing, session tokens, input validation

### Frontend (HTML/CSS/JavaScript)
- **Modern UI**: Responsive design with CSS Grid/Flexbox
- **Real-time Updates**: Live file status and auto-save
- **Modal Dialogs**: Authentication and file creation forms
- **File Browser**: Interactive sidebar with file list
- **Keyboard Shortcuts**: Enhanced productivity features

## Prerequisites

- **C++17** compatible compiler (GCC 7+ or Clang 5+)
- **OpenSSL** development libraries
- **Make** build system

## Installation

### 1. Install Dependencies

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install -y g++ make libssl-dev
```

**Fedora/RHEL:**
```bash
sudo dnf install -y gcc-c++ make openssl-devel
```

**macOS:**
```bash
brew install openssl
```

### 2. Build the Project

```bash
# Clone or download the project
cd Server

# Build the server
make

# Or build with debug information
make debug
```

### 3. Run the Server

```bash
# Run the server (defaults to port 8080)
make run

# Or run the executable directly
./build/webserver
```

The server will start on `http://localhost:8080`

## Usage

### First Time Setup

1. **Open your browser** and navigate to `http://localhost:8080`
2. **Register a new account** by clicking "Login" then "Register"
3. **Create your first file** using the "+" button in the sidebar
4. **Start editing** - your files are automatically saved

### Features Guide

#### Authentication
- **Register**: Create a new account with username and password
- **Login**: Access your private file system
- **Logout**: Securely end your session
- **Session Timeout**: Automatic logout after 1 hour of inactivity

#### File Operations
- **Create File**: Click the "+" button or use Ctrl+N
- **Open File**: Click on any file in the sidebar
- **Save File**: Click "Save" button or use Ctrl+S
- **Delete File**: Click "Delete" button (with confirmation)
- **Auto-save**: Files are automatically saved after 2 seconds of inactivity

#### Editor Features
- **Real-time Status**: See "Saved" or "Unsaved" indicators
- **Unsaved Changes Warning**: Browser warns before leaving with unsaved changes
- **Keyboard Shortcuts**:
  - `Ctrl+S` (or `Cmd+S` on Mac): Save current file
  - `Ctrl+N` (or `Cmd+N` on Mac): Create new file
  - `Escape`: Close modals

## Project Structure

```
Server/
├── backend/
│   ├── include/
│   │   └── server.hpp          # Server header with class definitions
│   └── src/
│       ├── main.cpp            # Entry point
│       └── server.cpp          # Server implementation
├── frontend/
│   ├── index.html              # Main HTML file
│   ├── style.css               # Modern CSS styles
│   └── script.js               # Frontend JavaScript
├── data/                       # User data directory (created automatically)
│   ├── users.txt               # User account data
│   └── users/                  # Private user filesystems
├── build/                      # Build output directory
├── Makefile                    # Build configuration
└── README.md                   # This file
```

## API Endpoints

### Authentication
- `POST /api/register` - User registration
- `POST /api/login` - User login
- `POST /api/logout` - User logout

### File Management
- `GET /api/files` - List user's files
- `GET /api/file?filename=<name>` - Get file content
- `POST /api/save` - Save file content
- `POST /api/create` - Create new file
- `DELETE /api/delete?filename=<name>` - Delete file

### Static Files
- `GET /` - Main application page
- `GET /style.css` - CSS styles
- `GET /script.js` - JavaScript code

## Security Features

- **Password Hashing**: SHA-256 with random salt
- **Session Management**: Secure session tokens with timeout
- **Input Validation**: URL encoding/decoding, path sanitization
- **Private Filesystems**: Users can only access their own files
- **HTTP Security**: Proper headers and response codes

## Development

### Building for Development

```bash
# Build with debug information
make debug

# Check OpenSSL installation
make check-openssl

# Clean build files
make clean
```

### Customization

#### Changing the Port
Edit `backend/src/main.cpp`:
```cpp
int main() {
    start_server(8080);  // Change this port number
    return 0;
}
```

#### Modifying Session Timeout
Edit `backend/src/server.cpp` in the `is_session_valid` function:
```cpp
if (now - it->second.last_activity > 3600) { // 1 hour timeout
```

#### Adding File Types
Edit `backend/src/server.cpp` in the `get_mime_type` function:
```cpp
if (ext == ".py") return "text/x-python";
if (ext == ".js") return "application/javascript";
```

## Troubleshooting

### Common Issues

**"OpenSSL not found" error:**
```bash
# Ubuntu/Debian
sudo apt-get install libssl-dev

# Fedora/RHEL
sudo dnf install openssl-devel

# macOS
brew install openssl
```

**"Permission denied" when running:**
```bash
# Make sure the executable has proper permissions
chmod +x build/webserver
```

**Port already in use:**
```bash
# Check what's using the port
sudo netstat -tulpn | grep :8080

# Kill the process or change the port in main.cpp
```

**Files not saving:**
- Check that the `data` directory exists and is writable
- Ensure the server has proper permissions to create user directories

### Debug Mode

Run with debug information:
```bash
make debug
./build/webserver
```

This will provide more detailed error messages and logging.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is open source and available under the MIT License.

## Future Enhancements

- [ ] Syntax highlighting for different file types
- [ ] File sharing between users
- [ ] Collaborative editing
- [ ] File versioning and history
- [ ] Search and replace functionality
- [ ] Multiple themes and customization
- [ ] File upload/download capabilities
- [ ] Database backend for better scalability 