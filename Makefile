CXX = g++
CXXFLAGS = -std=c++17 -Wall -Wextra -O2
LDFLAGS = -lssl -lcrypto

# Directories
BACKEND_DIR = backend
FRONTEND_DIR = frontend
BUILD_DIR = build

# Source files
SOURCES = $(BACKEND_DIR)/src/main.cpp $(BACKEND_DIR)/src/server.cpp
OBJECTS = $(SOURCES:$(BACKEND_DIR)/src/%.cpp=$(BUILD_DIR)/%.o)

# Target executable
TARGET = $(BUILD_DIR)/webserver

# Default target
all: $(TARGET)

# Create build directory
$(BUILD_DIR):
	mkdir -p $(BUILD_DIR)

# Compile source files
$(BUILD_DIR)/%.o: $(BACKEND_DIR)/src/%.cpp | $(BUILD_DIR)
	$(CXX) $(CXXFLAGS) -I$(BACKEND_DIR)/include -c $< -o $@

# Link executable
$(TARGET): $(OBJECTS)
	$(CXX) $(OBJECTS) -o $(TARGET) $(LDFLAGS)

# Run the server
run: $(TARGET)
	./$(TARGET)

# Clean build files
clean:
	rm -rf $(BUILD_DIR)

# Install dependencies (Ubuntu/Debian)
install-deps:
	sudo apt-get update
	sudo apt-get install -y g++ make libssl-dev

# Install dependencies (Fedora/RHEL)
install-deps-fedora:
	sudo dnf install -y gcc-c++ make openssl-devel

# Install dependencies (macOS)
install-deps-macos:
	brew install openssl

# Development mode (with debug flags)
debug: CXXFLAGS += -g -DDEBUG
debug: $(TARGET)

# Check if OpenSSL is available
check-openssl:
	@echo "Checking OpenSSL installation..."
	@pkg-config --exists openssl && echo "OpenSSL found" || echo "OpenSSL not found - please install libssl-dev"

# Help target
help:
	@echo "Available targets:"
	@echo "  all          - Build the web server"
	@echo "  run          - Build and run the server"
	@echo "  clean        - Remove build files"
	@echo "  debug        - Build with debug information"
	@echo "  install-deps - Install dependencies (Ubuntu/Debian)"
	@echo "  check-openssl- Check OpenSSL installation"
	@echo "  help         - Show this help message"

.PHONY: all run clean install-deps install-deps-fedora install-deps-macos debug check-openssl help 