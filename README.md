# Web Text Editor

A modern web-based text editor with user authentication, private file systems, and real-time editing capabilities.

## Features

### ✅ Core Functionality
- **User Authentication**: Secure registration and login system with password hashing
- **Session Management**: Persistent sessions with automatic timeout
- **Private File Systems**: Each user has their own isolated file storage
- **File Operations**: Create, read, update, and delete files
- **Directory Support**: Create and navigate directories
- **Real-time Editing**: Auto-save functionality with visual indicators
- **Modern UI**: Clean, responsive interface with smooth animations

### ✅ Recent Fixes & Improvements
- **Fixed Form Data Parsing**: Corrected issue where username and password were being mixed in file paths
- **Enhanced User Persistence**: Added debug output and improved user data saving/loading
- **Notification System**: Fixed persistent notifications and added proper auto-hide functionality
- **UI Animations**: Added smooth transitions, hover effects, and micro-interactions
- **Better Error Handling**: Improved error messages and user feedback
- **Username Uniqueness**: Prevents duplicate usernames during registration

### 🎨 UI/UX Features
- **Smooth Animations**: Fade-in, slide, bounce, and pulse animations throughout the interface
- **Hover Effects**: Interactive elements with scale, shadow, and color transitions
- **Loading States**: Visual feedback during operations with spinning indicators
- **Responsive Design**: Works on desktop and mobile devices
- **Modern Styling**: Clean, professional appearance with consistent spacing and typography
- **Keyboard Shortcuts**: Ctrl+S for save, Ctrl+N for new file, etc.

## Architecture

### Backend (C++)
- **WebServer Class**: Main server implementation with HTTP request/response handling
- **User Management**: Registration, login, session management, and user data persistence
- **File System**: Private user directories with file and directory operations
- **Security**: Password hashing with SHA-256 and salted passwords
- **HTTP Parser**: Custom HTTP request parsing and response building

### Frontend (HTML/CSS/JavaScript)
- **Modal System**: Login/register modals with smooth transitions
- **File Browser**: Sidebar with file/directory listing and creation
- **Text Editor**: Full-featured editor with syntax highlighting support
- **Notification System**: Toast notifications with auto-hide and different types
- **Responsive Layout**: Adaptive design for different screen sizes

## API Endpoints

### Authentication
- `POST /api/register` - User registration
- `POST /api/login` - User login
- `POST /api/logout` - User logout

### File Operations
- `GET /api/files` - List user files and directories
- `GET /api/file?filename=<name>` - Get file content
- `POST /api/save` - Save file content
- `POST /api/create` - Create new file
- `POST /api/create-dir` - Create new directory
- `DELETE /api/delete?filename=<name>` - Delete file or directory

## Installation & Setup

### Prerequisites
- C++17 compiler (GCC 7+ or Clang 5+)
- OpenSSL development libraries
- Make

### Build Instructions
```bash
# Clone the repository
git clone <repository-url>
cd Server

# Build the project
make

# Run the server
make run
# or
./build/webserver
```

### Dependencies Installation

#### Ubuntu/Debian
```bash
sudo apt update
sudo apt install build-essential libssl-dev
```

#### macOS
```bash
brew install openssl
```

#### Windows (WSL)
```bash
sudo apt update
sudo apt install build-essential libssl-dev
```

## Usage

1. **Start the Server**: Run `./build/webserver` to start the server on port 8080
2. **Access the Application**: Open `http://localhost:8080` in your browser
3. **Register/Login**: Create an account or log in with existing credentials
4. **Create Files**: Use the "New File" button or Ctrl+N to create files
5. **Create Directories**: Use the "New Directory" button to create folders
6. **Edit Files**: Click on files to open them in the editor
7. **Save Changes**: Use Ctrl+S or the auto-save feature

## File Structure

```
Server/
├── backend/
│   ├── include/
│   │   └── server.hpp          # Server class definition
│   └── src/
│       ├── main.cpp            # Entry point
│       └── server.cpp          # Server implementation
├── frontend/
│   ├── index.html              # Main HTML file
│   ├── style.css               # Styles and animations
│   └── script.js               # Frontend JavaScript
├── build/                      # Compiled binaries
├── data/                       # User data storage
├── Makefile                    # Build configuration
├── test_server.sh              # Server testing script
└── README.md                   # This file
```

## Development

### Building
```bash
make clean    # Clean build artifacts
make          # Build the project
make run      # Build and run
```

### Testing
```bash
# Run the automated test script
./test_server.sh

# Manual testing
curl -X POST http://localhost:8080/api/register \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=testuser&password=testpass"
```

### Debug Output
The server includes comprehensive debug output for:
- User registration and login
- File and directory operations
- Session management
- Error conditions

## Security Features

- **Password Hashing**: SHA-256 with salt
- **Session Tokens**: Secure random session generation
- **User Isolation**: Private file systems per user
- **Input Validation**: Proper form data parsing and validation
- **Path Sanitization**: Prevents directory traversal attacks

## Performance

- **Efficient File Operations**: Minimal I/O operations
- **Session Caching**: In-memory session storage
- **Optimized Build**: Compiler optimizations enabled
- **Responsive UI**: Smooth animations without performance impact

## Troubleshooting

### Common Issues

1. **Port Already in Use**
   ```bash
   # Check what's using port 8080
   lsof -i :8080
   # Kill the process
   kill <PID>
   ```

2. **Build Errors**
   ```bash
   # Install missing dependencies
   sudo apt install build-essential libssl-dev
   # Clean and rebuild
   make clean && make
   ```

3. **Permission Errors**
   ```bash
   # Ensure data directory is writable
   chmod 755 data/
   ```

4. **User Data Not Persisting**
   - Check debug output for user save/load operations
   - Verify data directory permissions
   - Check disk space

### Debug Mode
The server includes extensive debug output. Monitor the console for:
- User registration/login messages
- File operation confirmations
- Error details and stack traces

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is open source and available under the MIT License.

## Changelog

### Latest Updates
- ✅ Fixed form data parsing for proper username/password separation
- ✅ Enhanced user data persistence with debug output
- ✅ Improved notification system with auto-hide
- ✅ Added comprehensive UI animations and transitions
- ✅ Fixed username uniqueness validation
- ✅ Added loading states and better error handling
- ✅ Improved responsive design and accessibility

### Previous Versions
- Initial implementation with basic file operations
- Added user authentication and session management
- Implemented directory support and file browser
- Added real-time editing and auto-save functionality 