//server.cpp 
#include "../include/server.hpp"
#include <iostream>
#include <filesystem>
#include <regex>
#include <iomanip>
#include <sstream>
#include <sys/wait.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <pwd.h>
#include <unistd.h>
#include <cstdlib>
#include <cstring>
#include <signal.h>
#include <algorithm>

namespace fs = std::filesystem;

// Global server instance
static WebServer* g_server = nullptr;

// Constructor
WebServer::WebServer(uint16_t port) : port(port), server_fd(-1) {
    data_dir = "data";
    if (!fs::exists(data_dir)) {
        fs::create_directories(data_dir);
    }
    load_users();
    load_repositories();
}

// Destructor
WebServer::~WebServer() {
    stop();
    save_users();
}

// Password hashing
std::string WebServer::hash_password(const std::string& password) {
    std::string salt = generate_salt();
    std::string salted = password + salt;
    
    unsigned char hash[SHA256_DIGEST_LENGTH];
    SHA256_CTX sha256;
    SHA256_Init(&sha256);
    SHA256_Update(&sha256, salted.c_str(), salted.length());
    SHA256_Final(hash, &sha256);
    
    std::stringstream ss;
    for (int i = 0; i < SHA256_DIGEST_LENGTH; i++) {
        ss << std::hex << std::setw(2) << std::setfill('0') << (int)hash[i];
    }
    
    return salt + ":" + ss.str();
}

// Generate random salt
std::string WebServer::generate_salt() {
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_int_distribution<> dis(0, 255);
    
    std::string salt;
    for (int i = 0; i < 16; i++) {
        salt += (char)dis(gen);
    }
    
    std::stringstream ss;
    for (char c : salt) {
        ss << std::hex << std::setw(2) << std::setfill('0') << (int)(unsigned char)c;
    }
    return ss.str();
}

// Verify password
bool WebServer::verify_password(const std::string& password, const std::string& hash) {
    size_t colon_pos = hash.find(':');
    if (colon_pos == std::string::npos) return false;
    
    std::string salt = hash.substr(0, colon_pos);
    std::string stored_hash = hash.substr(colon_pos + 1);
    
    std::string salted = password + salt;
    unsigned char computed_hash[SHA256_DIGEST_LENGTH];
    SHA256_CTX sha256;
    SHA256_Init(&sha256);
    SHA256_Update(&sha256, salted.c_str(), salted.length());
    SHA256_Final(computed_hash, &sha256);
    
    std::stringstream ss;
    for (int i = 0; i < SHA256_DIGEST_LENGTH; i++) {
        ss << std::hex << std::setw(2) << std::setfill('0') << (int)computed_hash[i];
    }
    
    return stored_hash == ss.str();
}

// Generate session token
std::string WebServer::generate_session_token() {
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_int_distribution<> dis(0, 255);
    
    std::string token;
    for (int i = 0; i < 32; i++) {
        token += (char)dis(gen);
    }
    
    std::stringstream ss;
    for (char c : token) {
        ss << std::hex << std::setw(2) << std::setfill('0') << (int)(unsigned char)c;
    }
    return ss.str();
}

// URL encoding/decoding
std::string WebServer::url_decode(const std::string& str) {
    std::string result;
    for (size_t i = 0; i < str.length(); i++) {
        if (str[i] == '%' && i + 2 < str.length()) {
            int value;
            std::istringstream iss(str.substr(i + 1, 2));
            iss >> std::hex >> value;
            result += (char)value;
            i += 2;
        } else if (str[i] == '+') {
            result += ' ';
        } else {
            result += str[i];
        }
    }
    return result;
}

std::string WebServer::url_encode(const std::string& str) {
    std::ostringstream escaped;
    escaped.fill('0');
    escaped << std::hex;
    
    for (char c : str) {
        if (isalnum(c) || c == '-' || c == '_' || c == '.' || c == '~') {
            escaped << c;
        } else {
            escaped << '%' << std::setw(2) << int((unsigned char)c);
        }
    }
    return escaped.str();
}

// MIME type detection
std::string WebServer::get_mime_type(const std::string& filename) {
    std::string ext = fs::path(filename).extension().string();
    if (ext == ".html") return "text/html";
    if (ext == ".css") return "text/css";
    if (ext == ".js") return "application/javascript";
    if (ext == ".json") return "application/json";
    if (ext == ".txt") return "text/plain";
    return "text/plain";
}

// File operations
std::string WebServer::read_file_content(const std::string& path) {
    std::ifstream file(path);
    if (!file.is_open()) return "";
    
    std::stringstream buffer;
    buffer << file.rdbuf();
    return buffer.str();
}

bool WebServer::write_file_content(const std::string& path, const std::string& content) {
    std::ofstream file(path);
    if (!file.is_open()) return false;
    
    file << content;
    return true;
}

// User filesystem operations
std::string WebServer::create_user_filesystem(const std::string& username) {
    std::string user_dir = data_dir + "/users/" + username;
    if (!fs::exists(user_dir)) {
        fs::create_directories(user_dir);
    }
    return user_dir;
}

bool WebServer::delete_user_filesystem(const std::string& username) {
    std::string user_dir = data_dir + "/users/" + username;
    if (fs::exists(user_dir)) {
        return fs::remove_all(user_dir) > 0;
    }
    return true;
}

std::vector<FileInfo> WebServer::list_user_files(const std::string& username, const std::string& path) {
    std::vector<FileInfo> files;
    std::string user_dir = data_dir + "/users/" + username;
    std::string target_dir = user_dir;
    
    if (!path.empty()) {
        target_dir += "/" + path;
    }
    
    if (!fs::exists(target_dir)) return files;
    
    for (const auto& entry : fs::directory_iterator(target_dir)) {
        FileInfo file;
        file.name = entry.path().filename().string();
        
        // Calculate relative path from user directory
        std::string relative_path = fs::relative(entry.path(), user_dir).string();
        file.path = relative_path;
        
        file.last_modified = fs::last_write_time(entry.path()).time_since_epoch().count();
        file.is_directory = entry.is_directory();
        
        if (entry.is_regular_file()) {
            file.content = read_file_content(entry.path().string());
            file.size = fs::file_size(entry.path());
        } else if (entry.is_directory()) {
            file.size = 0;
            file.content = "";
        }
        
        files.push_back(file);
    }
    
    return files;
}

// Session management
std::string WebServer::extract_session_token(const HttpRequest& request) {
    auto it = request.headers.find("Cookie");
    if (it == request.headers.end()) {
        std::cout << "No Cookie header found in request" << std::endl;
        return "";
    }
    
    std::string cookies = it->second;
    std::cout << "Cookie header: " << cookies << std::endl;
    
    std::regex token_regex("session=([^;]+)");
    std::smatch match;
    
    if (std::regex_search(cookies, match, token_regex)) {
        std::string token = match[1].str();
        std::cout << "Extracted session token: " << token << std::endl;
        return token;
    }
    
    std::cout << "No session token found in cookies" << std::endl;
    return "";
}

bool WebServer::is_session_valid(const std::string& token) {
    std::cout << "Validating session token: " << token << std::endl;
    
    auto it = sessions.find(token);
    if (it == sessions.end()) {
        std::cout << "Session token not found in sessions map" << std::endl;
        return false;
    }
    
    time_t now = time(nullptr);
    if (now - it->second.last_activity > 3600) { // 1 hour timeout
        std::cout << "Session token expired" << std::endl;
        sessions.erase(it);
        return false;
    }
    
    std::cout << "Session token is valid for user: " << it->second.username << std::endl;
    return true;
}

void WebServer::update_session_activity(const std::string& token) {
    auto it = sessions.find(token);
    if (it != sessions.end()) {
        it->second.last_activity = time(nullptr);
    }
}

// HTTP parsing
HttpRequest WebServer::parse_http_request(const std::string& request) {
    HttpRequest req;
    std::istringstream stream(request);
    std::string line;
    
    // Parse first line
    if (std::getline(stream, line)) {
        std::istringstream line_stream(line);
        line_stream >> req.method >> req.path;
    }
    
    // Parse headers
    while (std::getline(stream, line) && line != "\r" && line != "") {
        size_t colon_pos = line.find(':');
        if (colon_pos != std::string::npos) {
            std::string key = line.substr(0, colon_pos);
            std::string value = line.substr(colon_pos + 1);
            // Remove leading space and \r
            if (!value.empty() && value[0] == ' ') value = value.substr(1);
            if (!value.empty() && value.back() == '\r') value.pop_back();
            req.headers[key] = value;
        }
    }
    
    // Parse body - read the entire remaining content as the body without adding newlines
    std::string body;
    std::string body_line;
    while (std::getline(stream, body_line)) {
        if (!body.empty()) body += "\n";
        body += body_line;
    }
    // Remove the trailing newline that was added
    if (!body.empty() && body.back() == '\n') {
        body.pop_back();
    }
    req.body = body;
    
    // Parse query parameters
    size_t query_pos = req.path.find('?');
    if (query_pos != std::string::npos) {
        std::string query_string = req.path.substr(query_pos + 1);
        req.path = req.path.substr(0, query_pos);
        
        std::istringstream query_stream(query_string);
        std::string param;
        while (std::getline(query_stream, param, '&')) {
            size_t equal_pos = param.find('=');
            if (equal_pos != std::string::npos) {
                std::string key = url_decode(param.substr(0, equal_pos));
                std::string value = url_decode(param.substr(equal_pos + 1));
                req.query_params[key] = value;
            }
        }
    }
    
    return req;
}

std::string WebServer::build_http_response(const HttpResponse& response) {
    std::ostringstream oss;
    oss << "HTTP/1.1 " << response.status_code << " " << response.status_text << "\r\n";
    
    for (const auto& header : response.headers) {
        oss << header.first << ": " << header.second << "\r\n";
    }
    
    oss << "Content-Length: " << response.body.length() << "\r\n";
    oss << "\r\n";
    oss << response.body;
    
    return oss.str();
}

// Route handlers
HttpResponse WebServer::handle_static_file(const std::string& path) {
    std::string file_path = "frontend" + path;
    if (path == "/") file_path = "frontend/index.html";
    
    if (!fs::exists(file_path)) {
        return {404, "Not Found", {{"Content-Type", "text/plain"}}, "File not found"};
    }
    
    std::string content = read_file_content(file_path);
    return {200, "OK", {{"Content-Type", get_mime_type(file_path)}}, content};
}

HttpResponse WebServer::handle_login(const HttpRequest& request) {
    std::string body = request.body;
    std::map<std::string, std::string> form_data;
    
    // Parse form data properly
    std::istringstream param_stream(body);
    std::string param;
    while (std::getline(param_stream, param, '&')) {
        size_t equal_pos = param.find('=');
        if (equal_pos != std::string::npos) {
            std::string key = url_decode(param.substr(0, equal_pos));
            std::string value = url_decode(param.substr(equal_pos + 1));
            form_data[key] = value;
        }
    }
    
    std::string username = form_data["username"];
    std::string password = form_data["password"];
    
    auto it = users.find(username);
    if (it == users.end() || !verify_password(password, it->second.password_hash)) {
        return {401, "Unauthorized", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"Invalid credentials\"}"};
    }
    
    // Create session
    Session session;
    session.token = generate_session_token();
    session.username = username;
    session.created = time(nullptr);
    session.last_activity = time(nullptr);
    session.current_directory = get_user_home_directory(username);
    
    sessions[session.token] = session;
    it->second.session_token = session.token;
    it->second.last_activity = time(nullptr);
    
    HttpResponse response{200, "OK", {{"Content-Type", "application/json"}}, 
                         "{\"success\": true, \"message\": \"Login successful\"}"};
    response.headers["Set-Cookie"] = "session=" + session.token + "; Path=/; HttpOnly";
    
    return response;
}

HttpResponse WebServer::handle_register(const HttpRequest& request) {
    std::string body = request.body;
    std::map<std::string, std::string> form_data;
    
    // Parse form data properly
    std::istringstream param_stream(body);
    std::string param;
    while (std::getline(param_stream, param, '&')) {
        size_t equal_pos = param.find('=');
        if (equal_pos != std::string::npos) {
            std::string key = url_decode(param.substr(0, equal_pos));
            std::string value = url_decode(param.substr(equal_pos + 1));
            form_data[key] = value;
        }
    }
    
    std::string username = form_data["username"];
    std::string password = form_data["password"];
    
    std::cout << "Registration attempt for username: " << username << std::endl;
    std::cout << "Current users count: " << users.size() << std::endl;
    
    // Check if username already exists
    if (users.find(username) != users.end()) {
        std::cout << "Username already exists: " << username << std::endl;
        return {409, "Conflict", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"Username already exists\"}"};
    }
    
    // Create new user
    User user;
    user.username = username;
    user.password_hash = hash_password(password);
    user.filesystem_path = create_user_filesystem(username);
    user.last_activity = time(nullptr);
    
    users[username] = user;
    
    // Create system user for terminal access
    if (!create_system_user(username)) {
        std::cout << "Warning: Failed to create system user for: " << username << std::endl;
        // Don't fail registration, just log warning
    }
    
    std::cout << "User created successfully: " << username << std::endl;
    std::cout << "Total users after creation: " << users.size() << std::endl;
    
    // Save users immediately after registration
    save_users();
    
    return {200, "OK", {{"Content-Type", "application/json"}}, 
            "{\"success\": true, \"message\": \"Registration successful\"}"};
}

HttpResponse WebServer::handle_logout(const HttpRequest& request) {
    std::string token = extract_session_token(request);
    if (!token.empty()) {
        sessions.erase(token);
    }
    
    HttpResponse response{200, "OK", {{"Content-Type", "application/json"}}, 
                         "{\"success\": true, \"message\": \"Logout successful\"}"};
    response.headers["Set-Cookie"] = "session=; Path=/; HttpOnly; Max-Age=0";
    
    return response;
}

HttpResponse WebServer::handle_get_files(const HttpRequest& request) {
    std::string token = extract_session_token(request);
    if (!is_session_valid(token)) {
        return {401, "Unauthorized", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"Invalid session\"}"};
    }
    
    update_session_activity(token);
    std::string username = sessions[token].username;
    
    // Get the requested path from query parameters
    auto path_it = request.query_params.find("path");
    std::string requested_path = (path_it != request.query_params.end()) ? path_it->second : "";
    
    std::vector<FileInfo> files = list_user_files(username, requested_path);
    std::vector<FileInfo> all_files = list_user_files(username, ""); // All files for search
    
    std::cout << "Listing files for user " << username << " in path '" << requested_path << "': " << files.size() << " items found" << std::endl;
    
    std::ostringstream json;
    json << "{\"success\": true, \"files\": [";
    for (size_t i = 0; i < files.size(); i++) {
        if (i > 0) json << ",";
        json << "{\"name\":\"" << files[i].name << "\","
             << "\"fullPath\":\"" << files[i].path << "\","
             << "\"size\":" << files[i].size << ","
             << "\"lastModified\":" << files[i].last_modified << ","
             << "\"isDirectory\":" << (files[i].is_directory ? "true" : "false") << ","
             << "\"path\":\"" << files[i].path << "\"}";
    }
    json << "], \"allFiles\": [";
    for (size_t i = 0; i < all_files.size(); i++) {
        if (i > 0) json << ",";
        json << "{\"name\":\"" << all_files[i].name << "\","
             << "\"fullPath\":\"" << all_files[i].path << "\","
             << "\"size\":" << all_files[i].size << ","
             << "\"lastModified\":" << all_files[i].last_modified << ","
             << "\"isDirectory\":" << (all_files[i].is_directory ? "true" : "false") << ","
             << "\"path\":\"" << all_files[i].path << "\"}";
    }
    json << "]}";
    
    return {200, "OK", {{"Content-Type", "application/json"}}, json.str()};
}

HttpResponse WebServer::handle_get_file(const HttpRequest& request) {
    std::string token = extract_session_token(request);
    if (!is_session_valid(token)) {
        return {401, "Unauthorized", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"Invalid session\"}"};
    }
    
    update_session_activity(token);
    std::string username = sessions[token].username;
    auto it = request.query_params.find("filename");
    std::string filename = (it != request.query_params.end()) ? it->second : "";
    
    if (filename.empty()) {
        return {400, "Bad Request", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"Filename required\"}"};
    }
    
    std::string file_path = data_dir + "/users/" + username + "/" + filename;
    if (!fs::exists(file_path)) {
        return {404, "Not Found", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"File not found\"}"};
    }
    
    std::string content = read_file_content(file_path);
    std::ostringstream json;
    json << "{\"success\": true, \"content\":\"" << url_encode(content) << "\"}";
    
    return {200, "OK", {{"Content-Type", "application/json"}}, json.str()};
}

HttpResponse WebServer::handle_save_file(const HttpRequest& request) {
    std::string token = extract_session_token(request);
    if (!is_session_valid(token)) {
        return {401, "Unauthorized", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"Invalid session\"}"};
    }
    
    update_session_activity(token);
    std::string username = sessions[token].username;
    
    std::string body = request.body;
    std::map<std::string, std::string> form_data;
    
    // Parse form data properly
    std::istringstream param_stream(body);
    std::string param;
    while (std::getline(param_stream, param, '&')) {
        size_t equal_pos = param.find('=');
        if (equal_pos != std::string::npos) {
            std::string key = url_decode(param.substr(0, equal_pos));
            std::string value = url_decode(param.substr(equal_pos + 1));
            form_data[key] = value;
        }
    }
    
    std::string filename = form_data["filename"];
    std::string content = form_data["content"];
    
    if (filename.empty()) {
        return {400, "Bad Request", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"Filename required\"}"};
    }
    
    std::string file_path = data_dir + "/users/" + username + "/" + filename;
    if (write_file_content(file_path, content)) {
        return {200, "OK", {{"Content-Type", "application/json"}}, 
                "{\"success\": true, \"message\": \"File saved successfully\"}"};
    } else {
        return {500, "Internal Server Error", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"Failed to save file\"}"};
    }
}

HttpResponse WebServer::handle_create_file(const HttpRequest& request) {
    std::string token = extract_session_token(request);
    if (!is_session_valid(token)) {
        std::cout << "Create file: Invalid session token" << std::endl;
        return {401, "Unauthorized", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"Invalid session\"}"};
    }
    
    update_session_activity(token);
    std::string username = sessions[token].username;
    std::cout << "Create file request from user: " << username << std::endl;
    
    std::string body = request.body;
    std::cout << "Request body: " << body << std::endl;
    
    std::map<std::string, std::string> form_data;
    
    // Parse form data properly
    std::istringstream param_stream(body);
    std::string param;
    while (std::getline(param_stream, param, '&')) {
        size_t equal_pos = param.find('=');
        if (equal_pos != std::string::npos) {
            std::string key = url_decode(param.substr(0, equal_pos));
            std::string value = url_decode(param.substr(equal_pos + 1));
            form_data[key] = value;
            std::cout << "Parsed form data: " << key << " = " << value << std::endl;
        }
    }
    
    std::string filename = form_data["filename"];
    std::string path = form_data["path"];
    
    if (filename.empty()) {
        std::cout << "Create file: No filename provided" << std::endl;
        return {400, "Bad Request", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"Filename required\"}"};
    }
    
    std::string user_dir = data_dir + "/users/" + username;
    std::string target_dir = user_dir;
    if (!path.empty()) {
        target_dir += "/" + path;
    }
    
    std::string file_path = target_dir + "/" + filename;
    std::cout << "Creating file: " << file_path << std::endl;
    
    // Ensure target directory exists
    if (!fs::exists(target_dir)) {
        std::cout << "Creating target directory: " << target_dir << std::endl;
        fs::create_directories(target_dir);
    }
    
    if (fs::exists(file_path)) {
        std::cout << "File already exists: " << file_path << std::endl;
        return {409, "Conflict", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"File already exists\"}"};
    }
    
    if (write_file_content(file_path, "")) {
        std::cout << "File created successfully: " << file_path << std::endl;
        return {200, "OK", {{"Content-Type", "application/json"}}, 
                "{\"success\": true, \"message\": \"File created successfully\"}"};
    } else {
        std::cout << "Failed to create file: " << file_path << std::endl;
        return {500, "Internal Server Error", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"Failed to create file\"}"};
    }
}

HttpResponse WebServer::handle_delete_file(const HttpRequest& request) {
    std::string token = extract_session_token(request);
    if (!is_session_valid(token)) {
        return {401, "Unauthorized", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"Invalid session\"}"};
    }
    
    update_session_activity(token);
    std::string username = sessions[token].username;
    auto it = request.query_params.find("filename");
    std::string filename = (it != request.query_params.end()) ? it->second : "";
    
    if (filename.empty()) {
        return {400, "Bad Request", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"Filename required\"}"};
    }
    
    std::string file_path = data_dir + "/users/" + username + "/" + filename;
    if (!fs::exists(file_path)) {
        return {404, "Not Found", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"File not found\"}"};
    }
    
    if (fs::remove(file_path)) {
        return {200, "OK", {{"Content-Type", "application/json"}}, 
                "{\"success\": true, \"message\": \"File deleted successfully\"}"};
    } else {
        return {500, "Internal Server Error", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"Failed to delete file\"}"};
    }
}

HttpResponse WebServer::handle_index() {
    return handle_static_file("/");
}

// User data persistence
void WebServer::load_users() {
    std::string users_file = data_dir + "/users.txt";
    std::cout << "Loading users from: " << users_file << std::endl;
    
    std::ifstream file(users_file);
    if (!file.is_open()) {
        std::cout << "No users file found, starting with empty user list" << std::endl;
        return;
    }
    
    std::string line;
    int user_count = 0;
    int line_number = 0;
    
    while (std::getline(file, line)) {
        line_number++;
        if (line.empty()) continue;
        
        try {
            std::istringstream line_stream(line);
            User user;
            
            if (!std::getline(line_stream, user.username, '|')) {
                std::cout << "Warning: Invalid user data at line " << line_number << std::endl;
                continue;
            }
            
            if (!std::getline(line_stream, user.password_hash, '|')) {
                std::cout << "Warning: Invalid password hash at line " << line_number << std::endl;
                continue;
            }
            
            if (!std::getline(line_stream, user.filesystem_path, '|')) {
                std::cout << "Warning: Invalid filesystem path at line " << line_number << std::endl;
                continue;
            }
            
            std::string last_activity_str;
            if (!std::getline(line_stream, last_activity_str, '|')) {
                std::cout << "Warning: Invalid last activity at line " << line_number << std::endl;
                continue;
            }
            
            try {
                user.last_activity = std::stol(last_activity_str);
            } catch (const std::exception& e) {
                std::cout << "Warning: Invalid timestamp at line " << line_number << ", using current time" << std::endl;
                user.last_activity = time(nullptr);
            }
            
            // Load API key fields (optional, for backward compatibility)
            if (std::getline(line_stream, user.api_key, '|')) {
                if (std::getline(line_stream, user.api_provider, '|')) {
                    if (std::getline(line_stream, user.api_model, '|')) {
                        // All API key fields present
                    } else {
                        user.api_model = "gpt-3.5-turbo"; // Default
                    }
                } else {
                    user.api_provider = "openai"; // Default
                    user.api_model = "gpt-3.5-turbo"; // Default
                }
            } else {
                user.api_key = ""; // Default
                user.api_provider = "openai"; // Default
                user.api_model = "gpt-3.5-turbo"; // Default
            }
            
            users[user.username] = user;
            user_count++;
            std::cout << "Loaded user: " << user.username << std::endl;
        } catch (const std::exception& e) {
            std::cout << "Error parsing user data at line " << line_number << ": " << e.what() << std::endl;
        }
    }
    std::cout << "Loaded " << user_count << " users successfully" << std::endl;
}

void WebServer::save_users() {
    std::string users_file = data_dir + "/users.txt";
    std::cout << "Saving users to: " << users_file << std::endl;
    
    // Ensure the data directory exists
    if (!fs::exists(data_dir)) {
        std::cout << "Creating data directory: " << data_dir << std::endl;
        fs::create_directories(data_dir);
    }
    
    std::ofstream file(users_file);
    if (!file.is_open()) {
        std::cerr << "Failed to open users file for writing: " << users_file << std::endl;
        return;
    }
    
    int user_count = 0;
    for (const auto& pair : users) {
        const User& user = pair.second;
        file << user.username << "|" << user.password_hash << "|" 
             << user.filesystem_path << "|" << user.last_activity << "|"
             << user.api_key << "|" << user.api_provider << "|" << user.api_model << "\n";
        user_count++;
        std::cout << "Saved user: " << user.username << std::endl;
    }
    std::cout << "Saved " << user_count << " users successfully" << std::endl;
    file.close();
}

// Server lifecycle
void WebServer::start() {
    server_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (server_fd < 0) {
        std::cerr << "Failed to create socket" << std::endl;
        return;
    }
    
    int opt = 1;
    setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));
    
    sockaddr_in address = {AF_INET, htons(port), INADDR_ANY};
    if (bind(server_fd, (struct sockaddr*)&address, sizeof(address)) < 0) {
        std::cerr << "Failed to bind socket" << std::endl;
        return;
    }
    
    if (listen(server_fd, 10) < 0) {
        std::cerr << "Failed to listen" << std::endl;
        return;
    }
    
    std::cout << "Server started on port " << port << std::endl;
    
    while (true) {
        int client_fd = accept(server_fd, nullptr, nullptr);
        if (client_fd < 0) continue;
        
        char buffer[4096] = {0};
        ssize_t bytes_read = read(client_fd, buffer, sizeof(buffer) - 1);
        if (bytes_read <= 0) {
            close(client_fd);
            continue;
        }
        
        std::string request_str(buffer, bytes_read);
        HttpRequest request = parse_http_request(request_str);
        
        HttpResponse response;
        
        // Route handling
        if (request.path == "/" && request.method == "GET") {
            response = handle_index();
        } else if (request.path == "/api/login" && request.method == "POST") {
            response = handle_login(request);
        } else if (request.path == "/api/register" && request.method == "POST") {
            response = handle_register(request);
        } else if (request.path == "/api/auth" && request.method == "POST") {
            response = handle_auth(request);
        } else if (request.path == "/api/validate-session" && request.method == "POST") {
            response = handle_validate_session(request);
        } else if (request.path == "/api/logout" && request.method == "POST") {
            response = handle_logout(request);
        } else if (request.path == "/api/files" && request.method == "GET") {
            response = handle_get_files(request);
        } else if (request.path == "/api/file" && request.method == "GET") {
            response = handle_get_file(request);
        } else if (request.path == "/api/save" && request.method == "POST") {
            response = handle_save_file(request);
        } else if (request.path == "/api/create" && request.method == "POST") {
            response = handle_create_file(request);
        } else if (request.path == "/api/create-dir" && request.method == "POST") {
            response = handle_create_directory(request);
        } else if (request.path == "/api/upload" && request.method == "POST") {
            response = handle_upload_file(request);
        } else if (request.path == "/api/delete" && request.method == "DELETE") {
            response = handle_delete_file(request);
        } else if (request.path == "/api/init-repo" && request.method == "POST") {
            response = handle_init_repo(request);
        } else if (request.path == "/api/commit" && request.method == "POST") {
            response = handle_commit(request);
        } else if (request.path == "/api/history" && request.method == "GET") {
            response = handle_get_history(request);
        } else if (request.path == "/api/checkout" && request.method == "POST") {
            response = handle_checkout(request);
        } else if (request.path == "/api/create-branch" && request.method == "POST") {
            response = handle_create_branch(request);
        } else if (request.path == "/api/switch-branch" && request.method == "POST") {
            response = handle_switch_branch(request);
        } else if (request.path == "/api/save-api-key" && request.method == "POST") {
            response = handle_save_api_key(request);
        } else if (request.path == "/api/get-api-key" && request.method == "GET") {
            response = handle_get_api_key(request);
        } else if (request.path == "/api/terminal/execute" && request.method == "POST") {
            response = handle_terminal_execute(request);
        } else if (request.method == "GET") {
            response = handle_static_file(request.path);
        } else {
            response = {404, "Not Found", {{"Content-Type", "text/plain"}}, "Not Found"};
        }
        
        std::string response_str = build_http_response(response);
        send(client_fd, response_str.c_str(), response_str.length(), 0);
        close(client_fd);
    }
}

void WebServer::stop() {
    if (server_fd >= 0) {
        close(server_fd);
        server_fd = -1;
    }
}

// Global function
void start_server(uint16_t port) {
    g_server = new WebServer(port);
    g_server->start();
}

HttpResponse WebServer::handle_create_directory(const HttpRequest& request) {
    std::string token = extract_session_token(request);
    if (!is_session_valid(token)) {
        std::cout << "Create directory: Invalid session token" << std::endl;
        return {401, "Unauthorized", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"Invalid session\"}"};
    }
    
    update_session_activity(token);
    std::string username = sessions[token].username;
    std::cout << "Create directory request from user: " << username << std::endl;
    
    std::string body = request.body;
    std::cout << "Request body: " << body << std::endl;
    
    std::map<std::string, std::string> form_data;
    
    // Parse form data properly
    std::istringstream param_stream(body);
    std::string param;
    while (std::getline(param_stream, param, '&')) {
        size_t equal_pos = param.find('=');
        if (equal_pos != std::string::npos) {
            std::string key = url_decode(param.substr(0, equal_pos));
            std::string value = url_decode(param.substr(equal_pos + 1));
            form_data[key] = value;
            std::cout << "Parsed form data: " << key << " = " << value << std::endl;
        }
    }
    
    std::string dirname = form_data["dirname"];
    std::string path = form_data["path"];
    
    if (dirname.empty()) {
        std::cout << "Create directory: No directory name provided" << std::endl;
        return {400, "Bad Request", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"Directory name required\"}"};
    }
    
    std::string user_dir = data_dir + "/users/" + username;
    std::string target_dir = user_dir;
    if (!path.empty()) {
        target_dir += "/" + path;
    }
    
    std::string dir_path = target_dir + "/" + dirname;
    std::cout << "Creating directory: " << dir_path << std::endl;
    
    // Ensure target directory exists
    if (!fs::exists(target_dir)) {
        std::cout << "Creating target directory: " << target_dir << std::endl;
        fs::create_directories(target_dir);
    }
    
    if (fs::exists(dir_path)) {
        std::cout << "Directory already exists: " << dir_path << std::endl;
        return {409, "Conflict", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"Directory already exists\"}"};
    }
    
    if (fs::create_directories(dir_path)) {
        std::cout << "Directory created successfully: " << dir_path << std::endl;
        return {200, "OK", {{"Content-Type", "application/json"}}, 
                "{\"success\": true, \"message\": \"Directory created successfully\"}"};
    } else {
        std::cout << "Failed to create directory: " << dir_path << std::endl;
        return {500, "Internal Server Error", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"Failed to create directory\"}"};
    }
}

// Version control helper functions
std::string WebServer::calculate_file_hash(const std::string& content) {
    unsigned char hash[SHA256_DIGEST_LENGTH];
    SHA256_CTX sha256;
    SHA256_Init(&sha256);
    SHA256_Update(&sha256, content.c_str(), content.length());
    SHA256_Final(hash, &sha256);
    
    std::stringstream ss;
    for (int i = 0; i < SHA256_DIGEST_LENGTH; i++) {
        ss << std::hex << std::setw(2) << std::setfill('0') << (int)hash[i];
    }
    return ss.str();
}

std::string WebServer::generate_version_id() {
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_int_distribution<> dis(0, 255);
    
    std::string id;
    for (int i = 0; i < 8; i++) {
        id += (char)dis(gen);
    }
    
    std::stringstream ss;
    for (char c : id) {
        ss << std::hex << std::setw(2) << std::setfill('0') << (int)(unsigned char)c;
    }
    return ss.str();
}

bool WebServer::init_repository(const std::string& username, const std::string& path) {
    std::string repo_key = username + "/" + path;
    
    if (repositories.find(repo_key) != repositories.end()) {
        return false; // Repository already exists
    }
    
    Repository repo;
    repo.name = path.empty() ? "root" : path;
    repo.path = path;
    repo.current_branch = "main";
    repo.head_version = "";
    
    // Create initial version
    Version initial_version;
    initial_version.id = generate_version_id();
    initial_version.message = "Initial commit";
    initial_version.author = username;
    initial_version.timestamp = time(nullptr);
    initial_version.parent_id = "";
    
    repo.versions[initial_version.id] = initial_version;
    repo.branches["main"] = initial_version.id;
    repo.head_version = initial_version.id;
    
    repositories[repo_key] = repo;
    save_repositories();
    
    return true;
}

bool WebServer::create_version(const std::string& username, const std::string& path, const std::string& message) {
    std::string repo_key = username + "/" + path;
    
    if (repositories.find(repo_key) == repositories.end()) {
        return false;
    }
    
    Repository& repo = repositories[repo_key];
    
    // Get current files and calculate hashes
    std::vector<FileInfo> files = list_user_files(username, path);
    std::map<std::string, std::string> file_hashes;
    std::vector<std::string> changed_files;
    
    for (const auto& file : files) {
        if (!file.is_directory) {
            std::string hash = calculate_file_hash(file.content);
            file_hashes[file.name] = hash;
            changed_files.push_back(file.name);
        }
    }
    
    // Create new version
    Version new_version;
    new_version.id = generate_version_id();
    new_version.message = message;
    new_version.author = username;
    new_version.timestamp = time(nullptr);
    new_version.parent_id = repo.head_version;
    new_version.file_hashes = file_hashes;
    new_version.changed_files = changed_files;
    
    repo.versions[new_version.id] = new_version;
    repo.branches[repo.current_branch] = new_version.id;
    repo.head_version = new_version.id;
    
    save_repositories();
    return true;
}

bool WebServer::checkout_version(const std::string& username, const std::string& path, const std::string& version_id) {
    std::string repo_key = username + "/" + path;
    
    if (repositories.find(repo_key) == repositories.end()) {
        return false;
    }
    
    Repository& repo = repositories[repo_key];
    
    if (repo.versions.find(version_id) == repo.versions.end()) {
        return false;
    }
    
    // For now, just update the head version
    // In a full implementation, you'd restore the actual files
    repo.head_version = version_id;
    save_repositories();
    
    return true;
}

bool WebServer::create_branch(const std::string& username, const std::string& path, const std::string& branch_name) {
    std::string repo_key = username + "/" + path;
    
    if (repositories.find(repo_key) == repositories.end()) {
        return false;
    }
    
    Repository& repo = repositories[repo_key];
    
    if (repo.branches.find(branch_name) != repo.branches.end()) {
        return false; // Branch already exists
    }
    
    repo.branches[branch_name] = repo.head_version;
    save_repositories();
    
    return true;
}

bool WebServer::switch_branch(const std::string& username, const std::string& path, const std::string& branch_name) {
    std::string repo_key = username + "/" + path;
    
    if (repositories.find(repo_key) == repositories.end()) {
        return false;
    }
    
    Repository& repo = repositories[repo_key];
    
    if (repo.branches.find(branch_name) == repo.branches.end()) {
        return false; // Branch doesn't exist
    }
    
    repo.current_branch = branch_name;
    repo.head_version = repo.branches[branch_name];
    save_repositories();
    
    return true;
}

std::vector<Version> WebServer::get_version_history(const std::string& username, const std::string& path) {
    std::string repo_key = username + "/" + path;
    std::vector<Version> history;
    
    if (repositories.find(repo_key) == repositories.end()) {
        return history;
    }
    
    Repository& repo = repositories[repo_key];
    
    for (const auto& pair : repo.versions) {
        history.push_back(pair.second);
    }
    
    // Sort by timestamp (newest first)
    std::sort(history.begin(), history.end(), 
              [](const Version& a, const Version& b) { return a.timestamp > b.timestamp; });
    
    return history;
}

void WebServer::load_repositories() {
    std::string repos_file = data_dir + "/repositories.txt";
    std::cout << "Loading repositories from: " << repos_file << std::endl;
    
    std::ifstream file(repos_file);
    if (!file.is_open()) {
        std::cout << "No repositories file found, starting with empty repository list" << std::endl;
        return;
    }
    
    // Simple loading for now - in a real implementation you'd want more robust parsing
    std::string line;
    while (std::getline(file, line)) {
        if (line.empty()) continue;
        
        std::istringstream line_stream(line);
        std::string repo_key, name, path, current_branch, head_version;
        
        if (std::getline(line_stream, repo_key, '|') &&
            std::getline(line_stream, name, '|') &&
            std::getline(line_stream, path, '|') &&
            std::getline(line_stream, current_branch, '|') &&
            std::getline(line_stream, head_version, '|')) {
            
            Repository repo;
            repo.name = name;
            repo.path = path;
            repo.current_branch = current_branch;
            repo.head_version = head_version;
            
            repositories[repo_key] = repo;
            std::cout << "Loaded repository: " << repo_key << std::endl;
        }
    }
}

void WebServer::save_repositories() {
    std::string repos_file = data_dir + "/repositories.txt";
    std::cout << "Saving repositories to: " << repos_file << std::endl;
    
    if (!fs::exists(data_dir)) {
        fs::create_directories(data_dir);
    }
    
    std::ofstream file(repos_file);
    if (!file.is_open()) {
        std::cerr << "Failed to open repositories file for writing: " << repos_file << std::endl;
        return;
    }
    
    for (const auto& pair : repositories) {
        const Repository& repo = pair.second;
        file << pair.first << "|" << repo.name << "|" << repo.path << "|" 
             << repo.current_branch << "|" << repo.head_version << "\n";
    }
    
    file.close();
}

// Version control route handlers
HttpResponse WebServer::handle_init_repo(const HttpRequest& request) {
    std::string token = extract_session_token(request);
    if (!is_session_valid(token)) {
        return {401, "Unauthorized", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"Invalid session\"}"};
    }
    
    update_session_activity(token);
    std::string username = sessions[token].username;
    
    std::string body = request.body;
    std::map<std::string, std::string> form_data;
    
    std::istringstream param_stream(body);
    std::string param;
    while (std::getline(param_stream, param, '&')) {
        size_t equal_pos = param.find('=');
        if (equal_pos != std::string::npos) {
            std::string key = url_decode(param.substr(0, equal_pos));
            std::string value = url_decode(param.substr(equal_pos + 1));
            form_data[key] = value;
        }
    }
    
    std::string path = form_data["path"];
    
    if (init_repository(username, path)) {
        return {200, "OK", {{"Content-Type", "application/json"}}, 
                "{\"success\": true, \"message\": \"Repository initialized successfully\"}"};
    } else {
        return {409, "Conflict", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"Repository already exists\"}"};
    }
}

HttpResponse WebServer::handle_commit(const HttpRequest& request) {
    std::string token = extract_session_token(request);
    if (!is_session_valid(token)) {
        return {401, "Unauthorized", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"Invalid session\"}"};
    }
    
    update_session_activity(token);
    std::string username = sessions[token].username;
    
    std::string body = request.body;
    std::map<std::string, std::string> form_data;
    
    std::istringstream param_stream(body);
    std::string param;
    while (std::getline(param_stream, param, '&')) {
        size_t equal_pos = param.find('=');
        if (equal_pos != std::string::npos) {
            std::string key = url_decode(param.substr(0, equal_pos));
            std::string value = url_decode(param.substr(equal_pos + 1));
            form_data[key] = value;
        }
    }
    
    std::string path = form_data["path"];
    std::string message = form_data["message"];
    
    if (message.empty()) {
        return {400, "Bad Request", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"Commit message required\"}"};
    }
    
    if (create_version(username, path, message)) {
        return {200, "OK", {{"Content-Type", "application/json"}}, 
                "{\"success\": true, \"message\": \"Changes committed successfully\"}"};
    } else {
        return {404, "Not Found", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"Repository not found\"}"};
    }
}

HttpResponse WebServer::handle_get_history(const HttpRequest& request) {
    std::string token = extract_session_token(request);
    if (!is_session_valid(token)) {
        return {401, "Unauthorized", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"Invalid session\"}"};
    }
    
    update_session_activity(token);
    std::string username = sessions[token].username;
    
    auto path_it = request.query_params.find("path");
    std::string path = (path_it != request.query_params.end()) ? path_it->second : "";
    
    std::vector<Version> history = get_version_history(username, path);
    
    std::ostringstream json;
    json << "{\"success\": true, \"history\": [";
    for (size_t i = 0; i < history.size(); i++) {
        if (i > 0) json << ",";
        json << "{\"id\":\"" << history[i].id << "\","
             << "\"message\":\"" << history[i].message << "\","
             << "\"author\":\"" << history[i].author << "\","
             << "\"timestamp\":" << history[i].timestamp << ","
             << "\"parent_id\":\"" << history[i].parent_id << "\","
             << "\"changed_files\":[";
        for (size_t j = 0; j < history[i].changed_files.size(); j++) {
            if (j > 0) json << ",";
            json << "\"" << history[i].changed_files[j] << "\"";
        }
        json << "]}";
    }
    json << "]}";
    
    return {200, "OK", {{"Content-Type", "application/json"}}, json.str()};
}

HttpResponse WebServer::handle_checkout(const HttpRequest& request) {
    std::string token = extract_session_token(request);
    if (!is_session_valid(token)) {
        return {401, "Unauthorized", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"Invalid session\"}"};
    }
    
    update_session_activity(token);
    std::string username = sessions[token].username;
    
    std::string body = request.body;
    std::map<std::string, std::string> form_data;
    
    std::istringstream param_stream(body);
    std::string param;
    while (std::getline(param_stream, param, '&')) {
        size_t equal_pos = param.find('=');
        if (equal_pos != std::string::npos) {
            std::string key = url_decode(param.substr(0, equal_pos));
            std::string value = url_decode(param.substr(equal_pos + 1));
            form_data[key] = value;
        }
    }
    
    std::string path = form_data["path"];
    std::string version_id = form_data["version_id"];
    
    if (checkout_version(username, path, version_id)) {
        return {200, "OK", {{"Content-Type", "application/json"}}, 
                "{\"success\": true, \"message\": \"Checked out version successfully\"}"};
    } else {
        return {404, "Not Found", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"Version or repository not found\"}"};
    }
}

HttpResponse WebServer::handle_create_branch(const HttpRequest& request) {
    std::string token = extract_session_token(request);
    if (!is_session_valid(token)) {
        return {401, "Unauthorized", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"Invalid session\"}"};
    }
    
    update_session_activity(token);
    std::string username = sessions[token].username;
    
    std::string body = request.body;
    std::map<std::string, std::string> form_data;
    
    std::istringstream param_stream(body);
    std::string param;
    while (std::getline(param_stream, param, '&')) {
        size_t equal_pos = param.find('=');
        if (equal_pos != std::string::npos) {
            std::string key = url_decode(param.substr(0, equal_pos));
            std::string value = url_decode(param.substr(equal_pos + 1));
            form_data[key] = value;
        }
    }
    
    std::string path = form_data["path"];
    std::string branch_name = form_data["branch_name"];
    
    if (branch_name.empty()) {
        return {400, "Bad Request", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"Branch name required\"}"};
    }
    
    if (create_branch(username, path, branch_name)) {
        return {200, "OK", {{"Content-Type", "application/json"}}, 
                "{\"success\": true, \"message\": \"Branch created successfully\"}"};
    } else {
        return {409, "Conflict", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"Branch already exists or repository not found\"}"};
    }
}

HttpResponse WebServer::handle_switch_branch(const HttpRequest& request) {
    std::string token = extract_session_token(request);
    if (!is_session_valid(token)) {
        return {401, "Unauthorized", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"Invalid session\"}"};
    }
    
    update_session_activity(token);
    std::string username = sessions[token].username;
    
    std::string body = request.body;
    std::map<std::string, std::string> form_data;
    
    std::istringstream param_stream(body);
    std::string param;
    while (std::getline(param_stream, param, '&')) {
        size_t equal_pos = param.find('=');
        if (equal_pos != std::string::npos) {
            std::string key = url_decode(param.substr(0, equal_pos));
            std::string value = url_decode(param.substr(equal_pos + 1));
            form_data[key] = value;
        }
    }
    
    std::string path = form_data["path"];
    std::string branch_name = form_data["branch_name"];
    
    if (branch_name.empty()) {
        return {400, "Bad Request", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"Branch name required\"}"};
    }
    
    if (switch_branch(username, path, branch_name)) {
        return {200, "OK", {{"Content-Type", "application/json"}}, 
                "{\"success\": true, \"message\": \"Switched to branch successfully\"}"};
    } else {
        return {404, "Not Found", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"Branch or repository not found\"}"};
    }
}

HttpResponse WebServer::handle_upload_file(const HttpRequest& request) {
    std::string token = extract_session_token(request);
    if (!is_session_valid(token)) {
        return {401, "Unauthorized", {{"Content-Type", "application/json"}},
                "{\"success\": false, \"message\": \"Invalid session\"}"};
    }
    update_session_activity(token);
    std::string username = sessions[token].username;

    // Only support multipart/form-data for now
    auto it = request.headers.find("Content-Type");
    if (it == request.headers.end() || it->second.find("multipart/form-data") == std::string::npos) {
        return {400, "Bad Request", {{"Content-Type", "application/json"}},
                "{\"success\": false, \"message\": \"Content-Type must be multipart/form-data\"}"};
    }

    // Very basic multipart parsing (for demo, not production)
    std::string boundary;
    std::string content_type = it->second;
    size_t pos = content_type.find("boundary=");
    if (pos != std::string::npos) {
        boundary = "--" + content_type.substr(pos + 9);
    } else {
        return {400, "Bad Request", {{"Content-Type", "application/json"}},
                "{\"success\": false, \"message\": \"Missing boundary in Content-Type\"}"};
    }

    std::string body = request.body;
    std::string user_dir = data_dir + "/users/" + username;
    std::string upload_path = user_dir;

    // Try to extract the path and relativePath fields (if present)
    std::string path_field, rel_path_field;
    size_t path_pos = body.find("name=\"path\"");
    if (path_pos != std::string::npos) {
        size_t val_start = body.find("\r\n\r\n", path_pos);
        if (val_start != std::string::npos) {
            size_t val_end = body.find(boundary, val_start);
            if (val_end != std::string::npos) {
                path_field = body.substr(val_start + 4, val_end - val_start - 6);
            }
        }
    }
    size_t rel_path_pos = body.find("name=\"relativePath\"");
    if (rel_path_pos != std::string::npos) {
        size_t val_start = body.find("\r\n\r\n", rel_path_pos);
        if (val_start != std::string::npos) {
            size_t val_end = body.find(boundary, val_start);
            if (val_end != std::string::npos) {
                rel_path_field = body.substr(val_start + 4, val_end - val_start - 6);
            }
        }
    }
    if (!path_field.empty()) {
        upload_path += "/" + path_field;
    }

    // Find the file part
    size_t file_pos = body.find("name=\"file\"");
    if (file_pos == std::string::npos) {
        return {400, "Bad Request", {{"Content-Type", "application/json"}},
                "{\"success\": false, \"message\": \"No file part found\"}"};
    }
    // Extract filename
    size_t fn_pos = body.find("filename=\"", file_pos);
    if (fn_pos == std::string::npos) {
        return {400, "Bad Request", {{"Content-Type", "application/json"}},
                "{\"success\": false, \"message\": \"No filename found\"}"};
    }
    size_t fn_start = fn_pos + 10;
    size_t fn_end = body.find("\"", fn_start);
    std::string filename = body.substr(fn_start, fn_end - fn_start);

    // Find file content
    size_t content_start = body.find("\r\n\r\n", fn_end);
    if (content_start == std::string::npos) {
        return {400, "Bad Request", {{"Content-Type", "application/json"}},
                "{\"success\": false, \"message\": \"Malformed file part\"}"};
    }
    content_start += 4;
    size_t content_end = body.find(boundary, content_start);
    if (content_end == std::string::npos) {
        return {400, "Bad Request", {{"Content-Type", "application/json"}},
                "{\"success\": false, \"message\": \"Malformed file part (no boundary)\"}"};
    }
    std::string file_content = body.substr(content_start, content_end - content_start - 2); // Remove trailing \r\n

    // Determine final path
    std::string final_path = upload_path;
    if (!rel_path_field.empty()) {
        // Use relative path for folder uploads
        final_path += "/" + rel_path_field;
    } else {
        final_path += "/" + filename;
    }

    // Ensure directory exists
    std::string dir = final_path.substr(0, final_path.find_last_of("/"));
    if (!fs::exists(dir)) {
        fs::create_directories(dir);
    }

    // Write file
    std::ofstream out(final_path, std::ios::binary);
    out.write(file_content.c_str(), file_content.size());
    out.close();

    return {200, "OK", {{"Content-Type", "application/json"}},
            "{\"success\": true, \"message\": \"File uploaded\"}"};
}

HttpResponse WebServer::handle_auth(const HttpRequest& request) {
    std::cout << "Auth request received" << std::endl;
    std::cout << "Request body: " << request.body << std::endl;
    
    // Parse JSON request body
    std::string body = request.body;
    std::string username, password, action;
    
    // Simple JSON parsing for the expected format
    // Expected format: {"username":"user","password":"pass","action":"login"}
    if (body.find("\"username\"") != std::string::npos) {
        size_t username_start = body.find("\"username\"") + 12;
        size_t username_end = body.find("\"", username_start);
        if (username_end != std::string::npos) {
            username = body.substr(username_start, username_end - username_start);
        }
    }
    
    if (body.find("\"password\"") != std::string::npos) {
        size_t password_start = body.find("\"password\"") + 12;
        size_t password_end = body.find("\"", password_start);
        if (password_end != std::string::npos) {
            password = body.substr(password_start, password_end - password_start);
        }
    }
    
    if (body.find("\"action\"") != std::string::npos) {
        size_t action_start = body.find("\"action\"") + 10;
        size_t action_end = body.find("\"", action_start);
        if (action_end != std::string::npos) {
            action = body.substr(action_start, action_end - action_start);
        }
    }
    
    std::cout << "Parsed auth data - username: " << username << ", action: " << action << std::endl;
    
    if (action == "login") {
        return handle_login_internal(username, password);
    } else if (action == "register") {
        return handle_register_internal(username, password);
    } else {
        return {400, "Bad Request", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"Invalid action\"}"};
    }
}

HttpResponse WebServer::handle_login_internal(const std::string& username, const std::string& password) {
    if (username.empty() || password.empty()) {
        return {400, "Bad Request", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"Username and password required\"}"};
    }
    
    auto it = users.find(username);
    if (it == users.end()) {
        return {401, "Unauthorized", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"Invalid username or password\"}"};
    }
    
    if (!verify_password(password, it->second.password_hash)) {
        return {401, "Unauthorized", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"Invalid username or password\"}"};
    }
    
    // Generate new session token
    std::string token = generate_session_token();
    Session session;
    session.token = token;
    session.username = username;
    session.created = time(nullptr);
    session.last_activity = time(nullptr);
    session.current_directory = get_user_home_directory(username);
    
    sessions[session.token] = session;
    it->second.session_token = session.token;
    it->second.last_activity = time(nullptr);
    
    std::string response = "{\"success\": true, \"message\": \"Login successful\", \"token\": \"" + token + "\"}";
    return {200, "OK", {{"Content-Type", "application/json"}, {"Set-Cookie", "session=" + token + "; Path=/; HttpOnly"}}, response};
}

HttpResponse WebServer::handle_register_internal(const std::string& username, const std::string& password) {
    if (username.empty() || password.empty()) {
        return {400, "Bad Request", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"Username and password required\"}"};
    }
    
    if (users.find(username) != users.end()) {
        return {409, "Conflict", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"Username already exists\"}"};
    }
    
    // Create new user
    User user;
    user.username = username;
    user.password_hash = hash_password(password);
    user.filesystem_path = create_user_filesystem(username);
    user.last_activity = time(nullptr);
    
    users[username] = user;
    
    // Create system user for terminal access
    if (!create_system_user(username)) {
        std::cout << "Warning: Failed to create system user for: " << username << std::endl;
        // Don't fail registration, just log warning
    }
    
    // Generate session token for new user
    std::string token = generate_session_token();
    Session session;
    session.token = token;
    session.username = username;
    session.created = time(nullptr);
    session.last_activity = time(nullptr);
    session.current_directory = get_user_home_directory(username);
    
    sessions[session.token] = session;
    user.session_token = session.token;
    users[username] = user;
    
    std::string response = "{\"success\": true, \"message\": \"Registration successful\", \"token\": \"" + token + "\"}";
    return {200, "OK", {{"Content-Type", "application/json"}, {"Set-Cookie", "session=" + token + "; Path=/; HttpOnly"}}, response};
}

HttpResponse WebServer::handle_validate_session(const HttpRequest& request) {
    std::string token = extract_session_token(request);
    
    // If token not found in cookies, try to extract from JSON body
    if (token.empty()) {
        std::string body = request.body;
        if (body.find("\"token\"") != std::string::npos) {
            size_t token_start = body.find("\"token\"") + 9;
            size_t token_end = body.find("\"", token_start);
            if (token_end != std::string::npos) {
                token = body.substr(token_start, token_end - token_start);
            }
        }
    }
    
    if (!is_session_valid(token)) {
        return {401, "Unauthorized", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"Invalid session\"}"};
    }
    
    update_session_activity(token);
    std::string username = sessions[token].username;
    
    std::string response = "{\"success\": true, \"message\": \"Session is valid\", \"username\": \"" + username + "\"}";
    return {200, "OK", {{"Content-Type", "application/json"}}, response};
}

HttpResponse WebServer::handle_save_api_key(const HttpRequest& request) {
    std::string token = extract_session_token(request);
    if (!is_session_valid(token)) {
        return {401, "Unauthorized", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"Invalid session\"}"};
    }
    
    update_session_activity(token);
    std::string username = sessions[token].username;
    
    // Parse JSON request body
    std::string body = request.body;
    std::string api_key, provider, model;
    
    // Simple JSON parsing
    if (body.find("\"api_key\"") != std::string::npos) {
        size_t key_start = body.find("\"api_key\"") + 11;
        size_t key_end = body.find("\"", key_start);
        if (key_end != std::string::npos) {
            api_key = body.substr(key_start, key_end - key_start);
        }
    }
    
    if (body.find("\"provider\"") != std::string::npos) {
        size_t provider_start = body.find("\"provider\"") + 12;
        size_t provider_end = body.find("\"", provider_start);
        if (provider_end != std::string::npos) {
            provider = body.substr(provider_start, provider_end - provider_start);
        }
    }
    
    if (body.find("\"model\"") != std::string::npos) {
        size_t model_start = body.find("\"model\"") + 9;
        size_t model_end = body.find("\"", model_start);
        if (model_end != std::string::npos) {
            model = body.substr(model_start, model_end - model_start);
        }
    }
    
    if (api_key.empty()) {
        return {400, "Bad Request", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"API key required\"}"};
    }
    
    // Update user's API key information
    auto it = users.find(username);
    if (it != users.end()) {
        it->second.api_key = api_key;
        it->second.api_provider = provider;
        it->second.api_model = model;
        save_users(); // Save to disk
    }
    
    return {200, "OK", {{"Content-Type", "application/json"}}, 
            "{\"success\": true, \"message\": \"API key saved successfully\"}"};
}

HttpResponse WebServer::handle_get_api_key(const HttpRequest& request) {
    std::string token = extract_session_token(request);
    if (!is_session_valid(token)) {
        return {401, "Unauthorized", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"Invalid session\"}"};
    }
    
    update_session_activity(token);
    std::string username = sessions[token].username;
    
    auto it = users.find(username);
    if (it == users.end()) {
        return {404, "Not Found", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"User not found\"}"};
    }
    
    std::string response = "{\"success\": true, \"api_key\": \"" + it->second.api_key + 
                          "\", \"provider\": \"" + it->second.api_provider + 
                          "\", \"model\": \"" + it->second.api_model + "\"}";
    
    return {200, "OK", {{"Content-Type", "application/json"}}, response};
}

// User management functions
bool WebServer::create_system_user(const std::string& username) {
    std::cout << "Checking system user: " << username << std::endl;
    
    // Check if user already exists using getpwnam
    struct passwd* pwd = getpwnam(username.c_str());
    if (pwd != nullptr) {
        std::cout << "System user already exists: " << username << " (UID: " << pwd->pw_uid << ")" << std::endl;
        
        // Ensure directories exist (don't try to change ownership without sudo)
        std::string web_app_dir = get_user_home_directory(username);
        std::string system_home_dir = "/home/" + username;
        
        // Just ensure directories exist
        if (!fs::exists(web_app_dir)) {
            try {
                fs::create_directories(web_app_dir);
                std::cout << "Created web app directory: " << web_app_dir << std::endl;
            } catch (const fs::filesystem_error& e) {
                std::cout << "Warning: Could not create web app directory: " << e.what() << std::endl;
            }
        }
        
        if (!fs::exists(system_home_dir)) {
            try {
                fs::create_directories(system_home_dir);
                std::cout << "Created system home directory: " << system_home_dir << std::endl;
            } catch (const fs::filesystem_error& e) {
                std::cout << "Warning: Could not create system home directory: " << e.what() << std::endl;
            }
        }
        
        return true;
    }
    
    std::cout << "Creating system user: " << username << std::endl;
    
    // Create standard system home directory
    std::string system_home_dir = "/home/" + username;
    if (!fs::exists(system_home_dir)) {
        try {
            fs::create_directories(system_home_dir);
            std::cout << "Created system home directory: " << system_home_dir << std::endl;
        } catch (const fs::filesystem_error& e) {
            std::cout << "Failed to create system home directory: " << e.what() << std::endl;
            return false;
        }
    }
    
    // Create web app directory if it doesn't exist
    std::string web_app_dir = get_user_home_directory(username);
    if (!fs::exists(web_app_dir)) {
        try {
            fs::create_directories(web_app_dir);
            std::cout << "Created web app directory: " << web_app_dir << std::endl;
        } catch (const fs::filesystem_error& e) {
            std::cout << "Failed to create web app directory: " << e.what() << std::endl;
            return false;
        }
    }
    
    // Create system user (this requires sudo, so we'll skip if not available)
    std::string useradd_cmd = "useradd -m -d " + system_home_dir + " -s /bin/bash " + username;
    std::cout << "Executing: " << useradd_cmd << std::endl;
    int result = system(useradd_cmd.c_str());
    
    if (result == 0) {
        std::cout << "System user created successfully: " << username << std::endl;
        return true;
    } else {
        std::cout << "Warning: Failed to create system user (may need sudo): " << username << std::endl;
        std::cout << "Continuing without system user creation..." << std::endl;
        return true; // Continue anyway, the user might already exist
    }
}

bool WebServer::delete_system_user(const std::string& username) {
    std::cout << "Deleting system user: " << username << std::endl;
    
    // Check if user exists
    struct passwd* pwd = getpwnam(username.c_str());
    if (pwd == nullptr) {
        std::cout << "User does not exist: " << username << std::endl;
        return true;
    }
    
    // Delete user with userdel command
    std::string command = "userdel -r " + username;
    int result = system(command.c_str());
    
    if (result == 0) {
        std::cout << "System user deleted successfully: " << username << std::endl;
        return true;
    } else {
        std::cout << "Failed to delete system user: " << username << std::endl;
        return false;
    }
}

std::string WebServer::get_user_home_directory(const std::string& username) {
    // Use the web application's file system instead of system home directory
    return data_dir + "/users/" + username;
}

bool WebServer::is_safe_command(const std::string& command) {
    // List of dangerous commands that should be blocked
    std::vector<std::string> dangerous_commands = {
        "sudo", "su", "passwd", "chpasswd", "useradd", "userdel", "usermod",
        "groupadd", "groupdel", "groupmod", "visudo", "chown", "chmod",
        "mount", "umount", "fdisk", "mkfs", "dd", "rm -rf /", "rm -rf /*",
        "shutdown", "reboot", "halt", "poweroff", "init", "systemctl",
        "service", "iptables", "ufw", "firewall-cmd", "crontab", "at",
        "ssh-keygen", "ssh-copy-id", "scp", "rsync", "wget", "curl",
        "nc", "netcat", "telnet", "ftp", "sftp", "git clone",
        "docker", "kubectl", "helm", "kubectl", "oc", "openshift"
    };
    
    std::string lower_command = command;
    std::transform(lower_command.begin(), lower_command.end(), lower_command.begin(), ::tolower);
    
    for (const auto& dangerous : dangerous_commands) {
        if (lower_command.find(dangerous) == 0) {
            return false;
        }
    }
    
    // Block commands with suspicious patterns
    if (lower_command.find("..") != std::string::npos ||
        lower_command.find("&&") != std::string::npos ||
        lower_command.find("||") != std::string::npos ||
        lower_command.find(";") != std::string::npos ||
        lower_command.find("|") != std::string::npos ||
        lower_command.find(">") != std::string::npos ||
        lower_command.find("<") != std::string::npos ||
        lower_command.find("`") != std::string::npos ||
        lower_command.find("$(") != std::string::npos) {
        return false;
    }
    
    return true;
}

// --- Fix path resolution for terminal commands and directory creation ---

// Update sanitize_path to always resolve relative to data/users/username and canonicalize
std::string WebServer::sanitize_path(const std::string& path, const std::string& username) {
    std::string user_home = get_user_home_directory(username);
    std::string resolved_path;

    // If path is empty or ~, use user_home
    if (path.empty() || path == "~" || path == "~/" || path == ".") {
        resolved_path = user_home;
    } else if (path[0] == '~') {
        resolved_path = user_home + path.substr(1);
    } else if (path[0] == '/') {
        // Absolute path: treat as relative to user_home
        resolved_path = user_home + path;
    } else {
        // Relative path
        resolved_path = user_home + "/" + path;
    }

    // Canonicalize if possible, but fallback to user_home if error
    try {
        if (fs::exists(resolved_path)) {
            std::string canonical_path = fs::canonical(resolved_path).string();
            if (canonical_path.find(user_home) != 0) {
                return user_home;
            }
            return canonical_path;
        } else {
            // If the path doesn't exist yet (e.g., mkdir), canonicalize the parent
            auto parent = fs::path(resolved_path).parent_path();
            if (fs::exists(parent)) {
                std::string canonical_parent = fs::canonical(parent).string();
                if (canonical_parent.find(user_home) != 0) {
                    return user_home;
                }
                return (canonical_parent + "/" + fs::path(resolved_path).filename().string());
            } else {
                return user_home;
            }
        }
    } catch (const fs::filesystem_error& e) {
        std::cout << "Filesystem error in sanitize_path: " << e.what() << std::endl;
        return user_home;
    }
}

// Update execute_terminal_command to track and update current directory per session
std::string WebServer::execute_terminal_command(const std::string& command, const std::string& username, const std::string& directory) {
    std::cout << "Executing terminal command for user " << username << ": " << command << std::endl;
    if (!is_safe_command(command)) {
        return "Error: Command not allowed for security reasons.";
    }

    // Get session for user
    Session* session_ptr = nullptr;
    for (auto& [token, session] : sessions) {
        if (session.username == username) {
            session_ptr = &session;
            break;
        }
    }
    if (!session_ptr) {
        // Fallback: use home directory
        std::cout << "No session found for user, using home directory." << std::endl;
        session_ptr = nullptr;
    }

    // Determine current working directory
    std::string working_dir = get_user_home_directory(username);
    if (session_ptr && !session_ptr->current_directory.empty()) {
        working_dir = session_ptr->current_directory;
    }
    // If a specific directory is requested (e.g., after login), use it
    if (!directory.empty()) {
        std::string sanitized_dir = sanitize_path(directory, username);
        if (!sanitized_dir.empty()) {
            working_dir = sanitized_dir;
        }
    }

    // Handle cd command: update session's current directory
    std::string trimmed_command = command;
    // Remove leading/trailing whitespace
    trimmed_command.erase(0, trimmed_command.find_first_not_of(" \t\n\r"));
    trimmed_command.erase(trimmed_command.find_last_not_of(" \t\n\r") + 1);
    if (trimmed_command.rfind("cd", 0) == 0) {
        std::string target = trimmed_command.substr(2);
        target.erase(0, target.find_first_not_of(" \t"));
        std::string new_dir;
        if (target.empty() || target == "~") {
            new_dir = get_user_home_directory(username);
        } else if (target[0] == '/') {
            new_dir = sanitize_path(target, username);
        } else {
            new_dir = working_dir + "/" + target;
            new_dir = sanitize_path(new_dir, username);
        }
        if (!new_dir.empty() && fs::exists(new_dir) && fs::is_directory(new_dir)) {
            if (session_ptr) session_ptr->current_directory = new_dir;
            working_dir = new_dir;
        } else {
            return "cd: no such directory: " + target;
        }
        // cd does not need to run a shell command
        return "";
    }

    std::cout << "Working directory: " << working_dir << std::endl;
    std::string temp_file = "/tmp/terminal_output_" + username + "_" + std::to_string(time(nullptr));
    std::string non_interactive_command = command;
    if (command.find("rm ") == 0) {
        if (command.find(" -f") == std::string::npos && command.find(" --force") == std::string::npos) {
            non_interactive_command = command + " -f";
        }
    } else if (command.find("cp ") == 0) {
        if (command.find(" -f") == std::string::npos && command.find(" --force") == std::string::npos) {
            non_interactive_command = command + " -f";
        }
    } else if (command.find("mv ") == 0) {
        if (command.find(" -f") == std::string::npos && command.find(" --force") == std::string::npos) {
            non_interactive_command = command + " -f";
        }
    }
    std::string full_command = "cd \"" + working_dir + "\" && " + non_interactive_command + " > '" + temp_file + "' 2>&1";
    std::cout << "Executing command: " << full_command << std::endl;
    int result = system(full_command.c_str());
    std::string output;
    std::ifstream temp_stream(temp_file);
    if (temp_stream.is_open()) {
        std::string line;
        while (std::getline(temp_stream, line)) {
            output += line + "\n";
        }
        temp_stream.close();
    }
    std::remove(temp_file.c_str());
    std::cout << "Command result: " << result << std::endl;
    std::cout << "Command output: " << output << std::endl;
    // Update session's current directory if needed (for commands like mkdir, rm, etc, we stay in the same dir)
    if (session_ptr) session_ptr->current_directory = working_dir;
    return output;
}

// Update change_directory to use sanitize_path and check existence
bool WebServer::change_directory(const std::string& username, const std::string& new_directory) {
    std::string sanitized_path = sanitize_path(new_directory, username);
    if (!fs::exists(sanitized_path) || !fs::is_directory(sanitized_path)) {
        return false;
    }
    std::string user_dir = get_user_home_directory(username);
    if (sanitized_path.find(user_dir) != 0) {
        return false;
    }
    return true;
}

// Terminal functions
std::string WebServer::get_current_directory(const std::string& username) {
    // For web filesystem, just return the user's directory
    return get_user_home_directory(username);
}

HttpResponse WebServer::handle_terminal_execute(const HttpRequest& request) {
    std::string token = extract_session_token(request);
    if (!is_session_valid(token)) {
        return {401, "Unauthorized", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"Invalid session\"}"};
    }
    
    update_session_activity(token);
    std::string username = sessions[token].username;
    std::string& current_dir = sessions[token].current_directory;
    
    // Ensure system user exists for this web user
    if (!create_system_user(username)) {
        return {500, "Internal Server Error", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"Failed to create system user\"}"};
    }
    
    // Parse JSON body
    std::string body = request.body;
    std::string command;
    std::string directory;
    
    // Simple JSON parsing for command and directory
    size_t cmd_pos = body.find("\"command\":");
    size_t dir_pos = body.find("\"directory\":");
    
    if (cmd_pos != std::string::npos) {
        size_t start = body.find("\"", cmd_pos + 10) + 1;
        size_t end = body.find("\"", start);
        if (end != std::string::npos) {
            command = body.substr(start, end - start);
        }
    }
    
    if (dir_pos != std::string::npos) {
        size_t start = body.find("\"", dir_pos + 12) + 1;
        size_t end = body.find("\"", start);
        if (end != std::string::npos) {
            directory = body.substr(start, end - start);
        }
    }
    
    if (command.empty()) {
        return {400, "Bad Request", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"Command required\"}"};
    }
    
    std::cout << "Terminal command from user " << username << ": " << command << std::endl;
    
    // Use session's current directory if no directory specified
    std::string working_dir = directory.empty() ? current_dir : directory;
    
    // Handle cd command specially
    if (command.substr(0, 3) == "cd ") {
        std::string target_dir = command.substr(3);
        target_dir = sanitize_path(target_dir, username);
        
        if (change_directory(username, target_dir)) {
            current_dir = target_dir;
            std::ostringstream json;
            json << "{\"success\": true, "
                 << "\"output\":\"\", "
                 << "\"directory\":\"" << url_encode(current_dir) << "\"}";
            return {200, "OK", {{"Content-Type", "application/json"}}, json.str()};
        } else {
            std::ostringstream json;
            json << "{\"success\": true, "
                 << "\"output\":\"cd: " << url_encode(target_dir) << ": No such file or directory\", "
                 << "\"directory\":\"" << url_encode(current_dir) << "\"}";
            return {200, "OK", {{"Content-Type", "application/json"}}, json.str()};
        }
    }
    
    // Execute the command
    std::string output = execute_terminal_command(command, username, working_dir);
    
    // Build response
    std::ostringstream json;
    json << "{\"success\": true, "
         << "\"output\":\"" << url_encode(output) << "\", "
         << "\"directory\":\"" << url_encode(current_dir) << "\"}";
    
    return {200, "OK", {{"Content-Type", "application/json"}}, json.str()};
}
