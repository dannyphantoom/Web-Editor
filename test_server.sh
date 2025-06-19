#!/bin/bash

echo "Testing Web Text Editor Server..."
echo "=================================="

# Test if server is running
echo "1. Checking if server is running on port 8080..."
if curl -s http://localhost:8080 > /dev/null; then
    echo "✅ Server is running"
else
    echo "❌ Server is not running"
    exit 1
fi

# Test registration
echo "2. Testing user registration..."
REGISTER_RESPONSE=$(curl -s -X POST http://localhost:8080/api/register \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "username=testuser&password=testpass")

echo "Registration response: $REGISTER_RESPONSE"

# Test login
echo "3. Testing user login..."
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:8080/api/login \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "username=testuser&password=testpass" \
    -c cookies.txt)

echo "Login response: $LOGIN_RESPONSE"

# Test file creation
echo "4. Testing file creation..."
CREATE_RESPONSE=$(curl -s -X POST http://localhost:8080/api/create \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -b cookies.txt \
    -d "filename=test.txt")

echo "File creation response: $CREATE_RESPONSE"

# Test file listing
echo "5. Testing file listing..."
FILES_RESPONSE=$(curl -s -X GET http://localhost:8080/api/files \
    -b cookies.txt)

echo "Files response: $FILES_RESPONSE"

# Test directory creation
echo "6. Testing directory creation..."
DIR_RESPONSE=$(curl -s -X POST http://localhost:8080/api/create-dir \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -b cookies.txt \
    -d "dirname=testdir")

echo "Directory creation response: $DIR_RESPONSE"

# Clean up
rm -f cookies.txt

echo "=================================="
echo "Test completed!" 