//server.cpp 
#include "../include/server.hpp"
#include <iostream>
#include <filesystem>
#include <regex>
#include <iomanip>
#include <sstream>

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
    std::string token = generate_session_token();
    Session session{token, username, time(nullptr), time(nullptr)};
    sessions[token] = session;
    
    it->second.session_token = token;
    it->second.last_activity = time(nullptr);
    
    HttpResponse response{200, "OK", {{"Content-Type", "application/json"}}, 
                         "{\"success\": true, \"message\": \"Login successful\"}"};
    response.headers["Set-Cookie"] = "session=" + token + "; Path=/; HttpOnly";
    
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
             << user.filesystem_path << "|" << user.last_activity << "\n";
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
