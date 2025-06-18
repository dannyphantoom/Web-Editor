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

std::vector<FileInfo> WebServer::list_user_files(const std::string& username) {
    std::vector<FileInfo> files;
    std::string user_dir = data_dir + "/users/" + username;
    
    if (!fs::exists(user_dir)) return files;
    
    for (const auto& entry : fs::directory_iterator(user_dir)) {
        FileInfo file;
        file.name = entry.path().filename().string();
        file.path = entry.path().string();
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
    if (it == request.headers.end()) return "";
    
    std::string cookies = it->second;
    std::regex token_regex("session=([^;]+)");
    std::smatch match;
    
    if (std::regex_search(cookies, match, token_regex)) {
        return match[1].str();
    }
    return "";
}

bool WebServer::is_session_valid(const std::string& token) {
    auto it = sessions.find(token);
    if (it == sessions.end()) return false;
    
    time_t now = time(nullptr);
    if (now - it->second.last_activity > 3600) { // 1 hour timeout
        sessions.erase(it);
        return false;
    }
    
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
    
    // Parse body
    std::stringstream body_stream;
    while (std::getline(stream, line)) {
        body_stream << line << "\n";
    }
    req.body = body_stream.str();
    
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
    std::istringstream body_stream(request.body);
    std::string line;
    std::map<std::string, std::string> form_data;
    
    while (std::getline(body_stream, line)) {
        size_t equal_pos = line.find('=');
        if (equal_pos != std::string::npos) {
            std::string key = url_decode(line.substr(0, equal_pos));
            std::string value = url_decode(line.substr(equal_pos + 1));
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
    std::istringstream body_stream(request.body);
    std::string line;
    std::map<std::string, std::string> form_data;
    
    while (std::getline(body_stream, line)) {
        size_t equal_pos = line.find('=');
        if (equal_pos != std::string::npos) {
            std::string key = url_decode(line.substr(0, equal_pos));
            std::string value = url_decode(line.substr(equal_pos + 1));
            form_data[key] = value;
        }
    }
    
    std::string username = form_data["username"];
    std::string password = form_data["password"];
    
    if (users.find(username) != users.end()) {
        return {409, "Conflict", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"Username already exists\"}"};
    }
    
    User user;
    user.username = username;
    user.password_hash = hash_password(password);
    user.filesystem_path = create_user_filesystem(username);
    user.last_activity = time(nullptr);
    
    users[username] = user;
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
    std::vector<FileInfo> files = list_user_files(username);
    
    std::cout << "Listing files for user " << username << ": " << files.size() << " items found" << std::endl;
    
    std::ostringstream json;
    json << "{\"success\": true, \"files\": [";
    for (size_t i = 0; i < files.size(); i++) {
        if (i > 0) json << ",";
        json << "{\"name\":\"" << files[i].name << "\","
             << "\"size\":" << files[i].size << ","
             << "\"lastModified\":" << files[i].last_modified << ","
             << "\"isDirectory\":" << (files[i].is_directory ? "true" : "false") << ","
             << "\"path\":\"" << files[i].path << "\"}";
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
    
    std::istringstream body_stream(request.body);
    std::string line;
    std::map<std::string, std::string> form_data;
    
    while (std::getline(body_stream, line)) {
        size_t equal_pos = line.find('=');
        if (equal_pos != std::string::npos) {
            std::string key = url_decode(line.substr(0, equal_pos));
            std::string value = url_decode(line.substr(equal_pos + 1));
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
        return {401, "Unauthorized", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"Invalid session\"}"};
    }
    
    update_session_activity(token);
    std::string username = sessions[token].username;
    
    std::istringstream body_stream(request.body);
    std::string line;
    std::map<std::string, std::string> form_data;
    
    while (std::getline(body_stream, line)) {
        size_t equal_pos = line.find('=');
        if (equal_pos != std::string::npos) {
            std::string key = url_decode(line.substr(0, equal_pos));
            std::string value = url_decode(line.substr(equal_pos + 1));
            form_data[key] = value;
        }
    }
    
    std::string filename = form_data["filename"];
    
    if (filename.empty()) {
        return {400, "Bad Request", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"Filename required\"}"};
    }
    
    std::string file_path = data_dir + "/users/" + username + "/" + filename;
    std::cout << "Creating file: " << file_path << std::endl;
    
    if (fs::exists(file_path)) {
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
    std::ifstream file(users_file);
    if (!file.is_open()) return;
    
    std::string line;
    while (std::getline(file, line)) {
        std::istringstream line_stream(line);
        User user;
        std::getline(line_stream, user.username, '|');
        std::getline(line_stream, user.password_hash, '|');
        std::getline(line_stream, user.filesystem_path, '|');
        std::string last_activity_str;
        std::getline(line_stream, last_activity_str, '|');
        user.last_activity = std::stol(last_activity_str);
        
        users[user.username] = user;
    }
}

void WebServer::save_users() {
    std::string users_file = data_dir + "/users.txt";
    std::ofstream file(users_file);
    if (!file.is_open()) return;
    
    for (const auto& pair : users) {
        const User& user = pair.second;
        file << user.username << "|" << user.password_hash << "|" 
             << user.filesystem_path << "|" << user.last_activity << "\n";
    }
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
        return {401, "Unauthorized", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"Invalid session\"}"};
    }
    
    update_session_activity(token);
    std::string username = sessions[token].username;
    
    std::istringstream body_stream(request.body);
    std::string line;
    std::map<std::string, std::string> form_data;
    
    while (std::getline(body_stream, line)) {
        size_t equal_pos = line.find('=');
        if (equal_pos != std::string::npos) {
            std::string key = url_decode(line.substr(0, equal_pos));
            std::string value = url_decode(line.substr(equal_pos + 1));
            form_data[key] = value;
        }
    }
    
    std::string dirname = form_data["dirname"];
    
    if (dirname.empty()) {
        return {400, "Bad Request", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"Directory name required\"}"};
    }
    
    std::string dir_path = data_dir + "/users/" + username + "/" + dirname;
    if (fs::exists(dir_path)) {
        return {409, "Conflict", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"Directory already exists\"}"};
    }
    
    if (fs::create_directories(dir_path)) {
        return {200, "OK", {{"Content-Type", "application/json"}}, 
                "{\"success\": true, \"message\": \"Directory created successfully\"}"};
    } else {
        return {500, "Internal Server Error", {{"Content-Type", "application/json"}}, 
                "{\"success\": false, \"message\": \"Failed to create directory\"}"};
    }
}
