#ifndef SERVER_HPP
#define SERVER_HPP

#include <string>
#include <map>
#include <vector>
#include <unordered_map>
#include <fstream>
#include <sstream>
#include <cstring>
#include <unistd.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <arpa/inet.h>
#include <openssl/sha.h>
#include <openssl/hmac.h>
#include <ctime>
#include <random>
#include <algorithm>

// User structure
struct User {
    std::string username;
    std::string password_hash;
    std::string session_token;
    time_t last_activity;
    std::string filesystem_path;
};

// Version control structures
struct Version {
    std::string id;
    std::string message;
    std::string author;
    time_t timestamp;
    std::string parent_id;
    std::map<std::string, std::string> file_hashes; // filename -> content hash
    std::vector<std::string> changed_files;
};

struct Repository {
    std::string name;
    std::string path;
    std::string current_branch;
    std::map<std::string, Version> versions; // version_id -> Version
    std::map<std::string, std::string> branches; // branch_name -> version_id
    std::string head_version;
};

// File structure
struct FileInfo {
    std::string name;
    std::string content;
    time_t last_modified;
    size_t size;
    bool is_directory;
    std::string path;  // Full path for navigation
    std::string hash;  // Content hash for version control
};

// Session structure
struct Session {
    std::string token;
    std::string username;
    time_t created;
    time_t last_activity;
};

// HTTP Request structure
struct HttpRequest {
    std::string method;
    std::string path;
    std::string body;
    std::map<std::string, std::string> headers;
    std::map<std::string, std::string> query_params;
};

// HTTP Response structure
struct HttpResponse {
    int status_code;
    std::string status_text;
    std::map<std::string, std::string> headers;
    std::string body;
};

// Server class
class WebServer {
private:
    int server_fd;
    uint16_t port;
    std::unordered_map<std::string, User> users;
    std::unordered_map<std::string, Session> sessions;
    std::unordered_map<std::string, Repository> repositories; // username/path -> Repository
    std::string data_dir;
    
    // Helper functions
    std::string hash_password(const std::string& password);
    std::string generate_session_token();
    std::string generate_salt();
    bool verify_password(const std::string& password, const std::string& hash);
    std::string url_decode(const std::string& str);
    std::string url_encode(const std::string& str);
    std::string get_mime_type(const std::string& filename);
    std::string read_file_content(const std::string& path);
    bool write_file_content(const std::string& path, const std::string& content);
    std::vector<FileInfo> list_user_files(const std::string& username, const std::string& path = "");
    std::string create_user_filesystem(const std::string& username);
    bool delete_user_filesystem(const std::string& username);
    
    // HTTP parsing
    HttpRequest parse_http_request(const std::string& request);
    std::string build_http_response(const HttpResponse& response);
    std::string extract_session_token(const HttpRequest& request);
    bool is_session_valid(const std::string& token);
    void update_session_activity(const std::string& token);
    
    // Version control functions
    std::string calculate_file_hash(const std::string& content);
    std::string generate_version_id();
    bool init_repository(const std::string& username, const std::string& path);
    bool create_version(const std::string& username, const std::string& path, const std::string& message);
    bool checkout_version(const std::string& username, const std::string& path, const std::string& version_id);
    bool create_branch(const std::string& username, const std::string& path, const std::string& branch_name);
    bool switch_branch(const std::string& username, const std::string& path, const std::string& branch_name);
    std::vector<Version> get_version_history(const std::string& username, const std::string& path);
    void load_repositories();
    void save_repositories();
    
    // Route handlers
    HttpResponse handle_static_file(const std::string& path);
    HttpResponse handle_login(const HttpRequest& request);
    HttpResponse handle_register(const HttpRequest& request);
    HttpResponse handle_logout(const HttpRequest& request);
    HttpResponse handle_get_files(const HttpRequest& request);
    HttpResponse handle_get_file(const HttpRequest& request);
    HttpResponse handle_save_file(const HttpRequest& request);
    HttpResponse handle_create_file(const HttpRequest& request);
    HttpResponse handle_create_directory(const HttpRequest& request);
    HttpResponse handle_upload_file(const HttpRequest& request);
    HttpResponse handle_delete_file(const HttpRequest& request);
    HttpResponse handle_init_repo(const HttpRequest& request);
    HttpResponse handle_commit(const HttpRequest& request);
    HttpResponse handle_get_history(const HttpRequest& request);
    HttpResponse handle_checkout(const HttpRequest& request);
    HttpResponse handle_create_branch(const HttpRequest& request);
    HttpResponse handle_switch_branch(const HttpRequest& request);
    HttpResponse handle_index();

public:
    WebServer(uint16_t port);
    ~WebServer();
    void start();
    void stop();
    void load_users();
    void save_users();
};

// Function declarations
void start_server(uint16_t port);

#endif // SERVER_HPP
