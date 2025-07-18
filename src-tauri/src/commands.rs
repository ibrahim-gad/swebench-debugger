// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use jsonschema::JSONSchema;
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tempfile::NamedTempFile;
use std::io::Write;
use std::fs;
use std::path::PathBuf;
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Debug)]
pub struct DockerSpecs {
    pub ubuntu_version: Option<String>,
    pub node_version: Option<String>,
    pub pnpm_version: Option<String>,
    pub rust_version: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct TestConfig {
    pub test_cmd: String,
    pub log_parser_name: String,
    pub pre_install: Option<Vec<String>>,
    pub install: Option<Vec<String>>,
    pub build: Option<Vec<String>>,
    pub docker_specs: Option<DockerSpecs>,
}

#[derive(Serialize)]
pub struct ValidationResult {
    pub success: bool,
    pub error: Option<String>,
    pub dockerfile: Option<String>,
}

type TabId = String;
lazy_static::lazy_static! {
    static ref DOCKER_PROCESSES: Arc<Mutex<HashMap<TabId, Child>>> = Arc::new(Mutex::new(HashMap::new()));
    static ref TEST_PROCESSES: Arc<Mutex<HashMap<TabId, Child>>> = Arc::new(Mutex::new(HashMap::new()));
}

#[derive(Serialize, Clone)]
pub struct BuildCompleteEvent {
    pub success: bool,
    pub error: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct TestCompleteEvent {
    pub success: bool,
    pub error: Option<String>,
}

fn get_json_schema(language: &str) -> Value {
    match language {
        "Rust" => json!({
            "type": "object",
            "properties": {
                "test_cmd": {
                    "type": "string",
                    "description": "The test command without any placeholders, all tests are getting appended to the end of this test command."
                },
                "log_parser_name": {
                    "type": "string",
                    "enum": ["cargo", "agentic"],
                    "description": "A log parser is used to parse the textual result of the tests and determine how many succeeded, how many failed..."
                },
                "pre_install": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "List of regular shell commands to run before the installation step."
                },
                "install": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "List of regular shell commands to run in the installation step."
                },
                "build": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "List of regular shell commands to run in the build step."
                },
                "docker_specs": {
                    "type": "object",
                    "properties": {
                        "rust_version": {
                            "type": "string",
                            "description": "Rust version to use"
                        }
                    },
                    "required": [],
                    "additionalProperties": false
                }
            },
            "required": ["test_cmd", "log_parser_name"],
            "additionalProperties": false
        }),
        "C/CPP" => json!({
            "type": "object",
            "properties": {
                "test_cmd": {
                    "type": "string",
                    "description": "The test command without any placeholders, all tests are getting appended to the end of this test command."
                },
                "log_parser_name": {
                    "type": "string",
                    "enum": ["doctest", "googletest", "agentic"],
                    "description": "A log parser is used to parse the textual result of the tests and determine how many succeeded, how many failed..."
                },
                "pre_install": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "List of regular shell commands to run before the installation step."
                },
                "install": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "List of regular shell commands to run in the installation step."
                },
                "build": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "List of regular shell commands to run in the build step."
                },
                "docker_specs": {
                    "type": "object",
                    "properties": {
                        "ubuntu_version": {
                            "type": "string",
                            "description": "Ubuntu version for the Docker image"
                        }
                    },
                    "required": [],
                    "additionalProperties": false
                }
            },
            "required": ["test_cmd", "log_parser_name"],
            "additionalProperties": false
        }),
        _ => json!({
            "type": "object",
            "properties": {
                "test_cmd": {
                    "type": "string",
                    "description": "The test command without any placeholders, all tests are getting appended to the end of this test command."
                },
                "log_parser_name": {
                    "type": "string",
                    "enum": ["jest", "mocha", "vitest", "karma", "tap", "calypso", "chartjs", "marked", "p5js", "agentic"],
                    "description": "A log parser is used to parse the textual result of the tests and determine how many succeeded, how many failed..."
                },
                "pre_install": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "List of regular shell commands to run before the installation step."
                },
                "install": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "List of regular shell commands to run in the installation step."
                },
                "build": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "List of regular shell commands to run in the build step."
                },
                "docker_specs": {
                    "type": "object",
                    "properties": {
                        "ubuntu_version": {
                            "type": "string",
                            "description": "Ubuntu version for the Docker image"
                        },
                        "node_version": {
                            "type": "string",
                            "description": "Node.js version to install"
                        },
                        "pnpm_version": {
                            "type": "string",
                            "description": "PNPM version to install"
                        }
                    },
                    "required": [],
                    "additionalProperties": false
                }
            },
            "required": ["test_cmd", "log_parser_name"],
            "additionalProperties": false
        })
    }
}

fn validate_json_config(input: &str, language: &str) -> Result<TestConfig, String> {
    // First, try to parse the JSON
    let parsed_json: Value = match serde_json::from_str(input) {
        Ok(json) => json,
        Err(e) => return Err(format!("Invalid JSON syntax: {}", e)),
    };

    // Get the schema and compile it
    let schema_value = get_json_schema(language);
    let schema = match JSONSchema::compile(&schema_value) {
        Ok(schema) => schema,
        Err(e) => return Err(format!("Schema compilation error: {}", e)),
    };

    // Validate against schema
    let validation_result = schema.validate(&parsed_json);
    if let Err(errors) = validation_result {
        let mut error_messages = Vec::new();
        for error in errors {
            let path = if error.instance_path.to_string().is_empty() {
                "root".to_string()
            } else {
                error.instance_path.to_string()
            };
            error_messages.push(format!("At '{}': {}", path, error));
        }
        return Err(format!("Validation failed:\n{}", error_messages.join("\n")));
    }

    // If validation passes, try to deserialize into our struct
    match serde_json::from_value::<TestConfig>(parsed_json.clone()) {
        Ok(config) => Ok(config),
        Err(e) => Err(format!("Failed to parse validated JSON: {}", e)),
    }
}

fn generate_dockerfile(config: &TestConfig, github_repo_url: &str, commit: &str, language: &str) -> String {
    // Format arrays for printf command - ["cmd1", "cmd2"] => "cmd1" "cmd2"
    let format_commands = |cmds: &Option<Vec<String>>| -> String {
        cmds.as_ref()
            .map(|commands| {
                if commands.is_empty() {
                    String::new()
                } else {
                    commands.iter()
                        .map(|cmd| format!("\"{}\"", cmd))
                        .collect::<Vec<_>>()
                        .join(" ")
                }
            })
            .unwrap_or_else(String::new)
    };

    let pre_install_cmds = format_commands(&config.pre_install);
    let install_cmds = format_commands(&config.install);
    let build_cmds = format_commands(&config.build);

    match language {
        "C/CPP" => generate_cpp_dockerfile(config, github_repo_url, commit, &pre_install_cmds, &install_cmds, &build_cmds),
        "Rust" => generate_rust_dockerfile(config, github_repo_url, commit, &pre_install_cmds, &install_cmds, &build_cmds),
        _ => generate_js_dockerfile(config, github_repo_url, commit, &pre_install_cmds, &install_cmds, &build_cmds), // Default to JS
    }
}

fn generate_js_dockerfile(
    config: &TestConfig,
    github_repo_url: &str,
    commit: &str,
    pre_install_cmds: &str,
    install_cmds: &str,
    build_cmds: &str
) -> String {
    // Use updated default values for any missing docker specs
    let ubuntu_version = config.docker_specs.as_ref()
        .and_then(|specs| specs.ubuntu_version.as_ref())
        .map(|s| s.as_str())
        .unwrap_or("22.04");

    let node_version = config.docker_specs.as_ref()
        .and_then(|specs| specs.node_version.as_ref())
        .map(|s| s.as_str())
        .unwrap_or("20");

    let pnpm_version = config.docker_specs.as_ref()
        .and_then(|specs| specs.pnpm_version.as_ref())
        .map(|s| s.as_str())
        .unwrap_or("9.5.0");

    format!("FROM ubuntu:{}

ARG DEBIAN_FRONTEND=noninteractive
ENV TZ=Etc/UTC

RUN apt-get update && apt-get install -y \\
    build-essential \\
    curl \\
    git \\
    libssl-dev \\
    software-properties-common \\
    wget \\
    gnupg \\
    jq \\
    ca-certificates \\
    dbus \\
    ffmpeg \\
    imagemagick \\
    libcairo2-dev \\
    libpango1.0-dev \\
    libjpeg-dev \\
    libgif-dev \\
    librsvg2-dev \\
    pkg-config

# Install node
RUN bash -c \"set -eo pipefail && curl -fsSL https://deb.nodesource.com/setup_{}.x | bash -\"
RUN apt-get update && apt-get install -y nodejs
RUN node -v && npm -v

# Install pnpm
RUN npm install --global corepack@latest
RUN corepack enable pnpm

# Install Chromium for browser testing
RUN apt-get update && apt-get install -y chromium-browser
ENV CHROME_BIN=/usr/bin/chromium-browser
ENV CHROME_PATH=/usr/bin/chromium-browser

RUN adduser --disabled-password --gecos 'dog' nonroot


ARG DEBIAN_FRONTEND=noninteractive
ENV TZ=Etc/UTC

RUN printf '%s\\n' \"#!/bin/bash\" \"set -euxo pipefail\" \"\" > /root/setup_env.sh && chmod +x /root/setup_env.sh
RUN sed -i -e 's/\\r$//' /root/setup_env.sh
RUN chmod +x /root/setup_env.sh

ENV NVM_DIR=/usr/local/nvm

# Install Node
ENV NODE_VERSION {}
RUN node -v

# Install Python 3 and Python 2
RUN apt-get update && apt-get install -y python3 python3-pip python2

# Ensure 'python' command points to python3
RUN ln -s /usr/bin/python3 /usr/bin/python

# Test Python installation
RUN python -V && python3 -V && python2 -V

# Set up environment variables for Node
ENV NODE_PATH $NVM_DIR/v$NODE_VERSION/lib/node_modules
ENV PATH $NVM_DIR/versions/node/v$NODE_VERSION/bin:$PATH
RUN echo \"PATH=$PATH:/usr/local/nvm/versions/node/$NODE_VERSION/bin/node\" >> /etc/environment

# Install pnpm
RUN npm install -g pnpm@{} --force

# Run the setup script
RUN /bin/bash -c \"source ~/.bashrc && /root/setup_env.sh\"
RUN node -v
RUN npm -v
RUN pnpm -v
RUN python -V
RUN python2 -V
RUN yarn -v
RUN npx -v

WORKDIR /testbed/
RUN git clone --depth 1 -o origin {} /testbed
RUN chmod -R 777 /testbed
RUN git fetch origin {}
RUN git reset --hard {}
RUN git remote remove origin
RUN printf '%s\\n' \"#!/bin/bash\" \"set -euxo pipefail\" {} {} {} \"\" > /root/setup_repo.sh && chmod +x /root/setup_repo.sh
RUN sed -i -e 's/\\r$//' /root/setup_repo.sh
RUN node -v
RUN npm -v
RUN /bin/bash /root/setup_repo.sh

WORKDIR /testbed/
",
        ubuntu_version,
        node_version,
        node_version,
        pnpm_version,
        github_repo_url,
        commit,
        commit,
        pre_install_cmds,
        install_cmds,
        build_cmds
    )
}

fn generate_cpp_dockerfile(
    config: &TestConfig,
    github_repo_url: &str,
    commit: &str,
    pre_install_cmds: &str,
    install_cmds: &str,
    build_cmds: &str
) -> String {
    // Use updated default values for any missing docker specs
    let ubuntu_version = config.docker_specs.as_ref()
        .and_then(|specs| specs.ubuntu_version.as_ref())
        .map(|s| s.as_str())
        .unwrap_or("22.04");

    format!("FROM ubuntu:{}

ARG DEBIAN_FRONTEND=noninteractive
ENV TZ=Etc/UTC

# Uncomment deb-src lines. Only works on Ubuntu 22.04 and below
RUN sed -i 's/^# deb-src/deb-src/' /etc/apt/sources.list

# Includes dependencies for all C/C++ projects
RUN apt update && \\
    apt install -y wget git build-essential libtool automake autoconf tcl bison flex cmake python3 python3-pip python3-venv python-is-python3 && \\
    rm -rf /var/lib/apt/lists/*

RUN adduser --disabled-password --gecos 'dog' nonroot

WORKDIR /testbed/
RUN git clone --depth 1 -o origin {} /testbed
RUN chmod -R 777 /testbed
RUN git fetch origin {}
RUN git reset --hard {}
RUN git remote remove origin
RUN printf '%s\\n' \"#!/bin/bash\" \"set -euxo pipefail\" {} {} {} \"\" > /root/setup_repo.sh && chmod +x /root/setup_repo.sh
RUN /bin/bash /root/setup_repo.sh

WORKDIR /testbed/
",
        ubuntu_version,
        github_repo_url,
        commit,
        commit,
        pre_install_cmds,
        install_cmds,
        build_cmds
    )
}

fn generate_rust_dockerfile(
    config: &TestConfig,
    github_repo_url: &str,
    commit: &str,
    pre_install_cmds: &str,
    install_cmds: &str,
    build_cmds: &str
) -> String {
    // Use updated default values for any missing docker specs
    let rust_version = config.docker_specs.as_ref()
        .and_then(|specs| specs.rust_version.as_ref())
        .map(|s| s.as_str())
        .unwrap_or("latest");

    format!("FROM rust:{}

ARG DEBIAN_FRONTEND=noninteractive
ENV TZ=Etc/UTC

RUN apt update && apt install -y \\
wget \\
git \\
build-essential \\
&& rm -rf /var/lib/apt/lists/*

RUN adduser --disabled-password --gecos 'dog' nonroot

WORKDIR /testbed/
RUN git clone --depth 1 -o origin {} /testbed
RUN chmod -R 777 /testbed
RUN git fetch origin {}
RUN git reset --hard {}
RUN git remote remove origin
RUN printf '%s\\n' \"#!/bin/bash\" \"set -euxo pipefail\" {} {} {} \"\" > /root/setup_repo.sh && chmod +x /root/setup_repo.sh
RUN /bin/bash /root/setup_repo.sh

WORKDIR /testbed/
",
        rust_version,
        github_repo_url,
        commit,
        commit,
        pre_install_cmds,
        install_cmds,
        build_cmds
    )
}

#[tauri::command]
pub fn generate_docker_file(input_json: String, github_repo_url: String, commit: String, language: String) -> ValidationResult {
    match validate_json_config(&input_json, &language) {
        Ok(config) => {
            let dockerfile = generate_dockerfile(&config, &github_repo_url, &commit, &language);
            ValidationResult {
                success: true,
                error: None,
                dockerfile: Some(dockerfile),
            }
        }
        Err(error) => ValidationResult {
            success: false,
            error: Some(error),
            dockerfile: None,
        },
    }
}

// Check if Docker is installed and running
async fn check_docker_available(docker_path: Option<&str>) -> Result<String, String> {
    let docker_cmd = if let Some(path) = docker_path {
        // Use custom path if provided and not empty
        let trimmed_path = path.trim();
        if trimmed_path.is_empty() {
            // If path is empty or whitespace, fall back to PATH
            match which::which("docker") {
                Ok(path) => path.to_string_lossy().to_string(),
                Err(_) => return Err(format!("Docker is not installed or not found in PATH: {}", std::env::var("PATH").unwrap()).to_string()),
            }
        } else if !std::path::Path::new(trimmed_path).exists() {
            return Err(format!("Docker executable not found at: {}", trimmed_path));
        } else {
            trimmed_path.to_string()
        }
    } else {
        // Check if docker command exists in PATH
        match which::which("docker") {
            Ok(path) => path.to_string_lossy().to_string(),
            Err(_) => return Err(format!("Docker is not installed or not found in PATH: {}", std::env::var("PATH").unwrap()).to_string()),
        }
    };

    // Check if Docker daemon is running
    let output = Command::new(&docker_cmd)
        .arg("info")
        .output()
        .await
        .map_err(|e| format!("Failed to check Docker status: {}", e))?;

    if !output.status.success() {
        return Err("Docker daemon is not running".to_string());
    }

    Ok(docker_cmd)
}

#[tauri::command]
pub async fn build_docker_image(
    tab_id: String,
    dockerfile_content: String,
    image_name: String,
    github_repo_url: String,
    commit: String,
    docker_path: String,
    app: AppHandle,
) -> Result<(), String> {
    // Check if Docker is available
    let docker_cmd = check_docker_available(if docker_path.is_empty() { None } else { Some(&docker_path) }).await?;

    // Check if there's already a build running for this tab
    {
        let processes = DOCKER_PROCESSES.lock().unwrap();
        if processes.contains_key(&tab_id) {
            return Err("A Docker build is already running for this tab".to_string());
        }
    }

    // Create a temporary Dockerfile
    let mut temp_file = NamedTempFile::new()
        .map_err(|e| format!("Failed to create temporary file: {}", e))?;
    temp_file
        .write_all(dockerfile_content.as_bytes())
        .map_err(|e| format!("Failed to write Dockerfile: {}", e))?;
    let dockerfile_path = temp_file.path().to_path_buf();

    let _ = app.emit("build_log", json!({"tab_id": tab_id, "message": "Starting Docker build..."}));
    let _ = app.emit("build_log", json!({"tab_id": tab_id, "message": format!("Using Docker: {}", docker_cmd)}));
    let _ = app.emit("build_log", json!({"tab_id": tab_id, "message": format!("Building image: {}", image_name)}));
    let _ = app.emit("build_log", json!({"tab_id": tab_id, "message": format!("Repository: {}", github_repo_url)}));
    let _ = app.emit("build_log", json!({"tab_id": tab_id, "message": format!("Commit: {}", commit)}));
    let _ = app.emit("build_log", json!({"tab_id": tab_id, "message": ""}));

    let mut cmd = Command::new(&docker_cmd);
    cmd.arg("build")
        .arg("-f")
        .arg(&dockerfile_path)
        .arg("-t")
        .arg(&image_name)
        .arg(".")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to start Docker build: {}", e))?;

    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;

    {
        let mut processes = DOCKER_PROCESSES.lock().unwrap();
        processes.insert(tab_id.clone(), child);
    }

    let app_clone = app.clone();
    let tab_id_clone = tab_id.clone();
    tauri::async_runtime::spawn(async move {
        let _temp_file = temp_file;
        let stdout_reader = BufReader::new(stdout);
        let stderr_reader = BufReader::new(stderr);
        let app_clone_stdout = app_clone.clone();
        let tab_id_stdout = tab_id_clone.clone();
        let stdout_task = tauri::async_runtime::spawn(async move {
            let mut lines = stdout_reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = app_clone_stdout.emit("build_log", json!({"tab_id": tab_id_stdout, "message": line}));
            }
        });
        let app_clone_stderr = app_clone.clone();
        let tab_id_stderr = tab_id_clone.clone();
        let stderr_task = tauri::async_runtime::spawn(async move {
            let mut lines = stderr_reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = app_clone_stderr.emit("build_log", json!({"tab_id": tab_id_stderr, "message": format!("STDERR: {}", line)}));
            }
        });
        let mut status_code = None;
        let mut process_result = Ok(());
        loop {
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
            let mut should_break = false;
            let mut processes = DOCKER_PROCESSES.lock().unwrap();
            if let Some(child_process) = processes.get_mut(&tab_id_clone) {
                match child_process.try_wait() {
                    Ok(Some(status)) => {
                        status_code = Some(status);
                        should_break = true;
                    }
                    Ok(None) => {}
                    Err(e) => {
                        process_result = Err(format!("Process error: {}", e));
                        should_break = true;
                    }
                }
            } else {
                should_break = true;
            }
            drop(processes);
            if should_break {
                break;
            }
        }
        let _ = tokio::join!(stdout_task, stderr_task);
        {
            let mut processes = DOCKER_PROCESSES.lock().unwrap();
            processes.remove(&tab_id_clone);
        }
        match process_result {
            Ok(()) => {
                if let Some(status) = status_code {
                    let success = status.success();
                    let build_complete = BuildCompleteEvent {
                        success,
                        error: if success { None } else { Some("Build failed".to_string()) },
                    };
                    let _ = app_clone.emit("build_complete", json!({"tab_id": tab_id_clone, "success": build_complete.success, "error": build_complete.error}));
                    if !success {
                        let _ = app_clone.emit("build_log", json!({"tab_id": tab_id_clone, "message": format!("ERROR: Docker build failed with exit code: {}", status.code().unwrap_or(-1))}));
                    }
                } else {
                    let build_complete = BuildCompleteEvent {
                        success: false,
                        error: Some("Build was stopped".to_string()),
                    };
                    let _ = app_clone.emit("build_complete", json!({"tab_id": tab_id_clone, "success": build_complete.success, "error": build_complete.error}));
                    let _ = app_clone.emit("build_log", json!({"tab_id": tab_id_clone, "message": "Build stopped by user"}));
                }
            }
            Err(e) => {
                let _ = app_clone.emit("build_log", json!({"tab_id": tab_id_clone, "message": format!("ERROR: {}", e)}));
                let build_complete = BuildCompleteEvent {
                    success: false,
                    error: Some(e),
                };
                let _ = app_clone.emit("build_complete", json!({"tab_id": tab_id_clone, "success": build_complete.success, "error": build_complete.error}));
            }
        }
    });
    Ok(())
}

#[tauri::command]
pub async fn stop_docker_build(tab_id: String) -> Result<(), String> {
    let child = {
        let mut processes = DOCKER_PROCESSES.lock().unwrap();
        processes.remove(&tab_id)
    };
    if let Some(mut child) = child {
        child.kill().await.map_err(|e| format!("Failed to stop build: {}", e))?;
        Ok(())
    } else {
        Err("No build process is currently running for this tab".to_string())
    }
}

#[tauri::command]
pub async fn check_docker_image_exists(image_name: String, docker_path: String) -> Result<bool, String> {
    // Check if Docker is available first
    let docker_cmd = check_docker_available(if docker_path.is_empty() { None } else { Some(&docker_path) }).await?;

    // Use docker images command to check if the image exists
    let output = Command::new(&docker_cmd)
        .arg("images")
        .arg("--format")
        .arg("{{.Repository}}:{{.Tag}}")
        .arg("--filter")
        .arg(&format!("reference={}", image_name))
        .output()
        .await
        .map_err(|e| format!("Failed to check Docker images: {}", e))?;

    if !output.status.success() {
        return Err("Failed to list Docker images".to_string());
    }

    let output_str = String::from_utf8_lossy(&output.stdout);

    // Parse the provided image name (handle cases with and without tags)
    let (target_repo, target_tag) = if image_name.contains(':') {
        let parts: Vec<&str> = image_name.splitn(2, ':').collect();
        (parts[0], parts[1])
    } else {
        (image_name.as_str(), "latest")
    };

    // Check if any of the existing images match
    let image_exists = output_str.lines().any(|line| {
        let line = line.trim();
        if line.is_empty() {
            return false;
        }

        // Parse each line (format: repository:tag)
        if let Some((repo, tag)) = line.split_once(':') {
            repo == target_repo && tag == target_tag
        } else {
            // Fallback: direct comparison if format is unexpected
            line == image_name
        }
    });

    Ok(image_exists)
}

// Get the configuration file path
fn get_config_path() -> PathBuf {
    let mut home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    home.push(".swebench-debugger");

    // Create directory if it doesn't exist
    if !home.exists() {
        let _ = fs::create_dir_all(&home);
    }

    home.join("config.json")
}

#[tauri::command]
pub fn save_config(key: String, value: String) -> Result<(), String> {
    let config_path = get_config_path();
    let mut config = if config_path.exists() {
        let content = fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read configuration: {}", e))?;
        serde_json::from_str::<serde_json::Value>(&content)
            .unwrap_or_else(|_| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };
    if let Some(obj) = config.as_object_mut() {
        obj.insert(key, serde_json::Value::String(value));
    }
    fs::write(&config_path, serde_json::to_string_pretty(&config).unwrap())
        .map_err(|e| format!("Failed to save configuration: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn load_config(key: String) -> Result<String, String> {
    let config_path = get_config_path();
    if !config_path.exists() {
        return Ok(String::new());
    }
    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read configuration: {}", e))?;
    let config: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse configuration: {}", e))?;
    Ok(config.get(&key).and_then(|v| v.as_str()).unwrap_or("").to_string())
}

#[tauri::command]
pub async fn run_docker_test(
    tab_id: String,
    image_name: String,
    test_cmd: String,
    test_file_paths: String,
    docker_path: String,
    app: AppHandle,
) -> Result<(), String> {
    let docker_cmd = check_docker_available(if docker_path.is_empty() { None } else { Some(&docker_path) }).await?;
    {
        let processes = TEST_PROCESSES.lock().unwrap();
        if processes.contains_key(&tab_id) {
            return Err("A Docker test is already running for this tab".to_string());
        }
    }
    let _ = app.emit("test_log", json!({"tab_id": tab_id, "message": "Starting Docker test run..."}));
    let _ = app.emit("test_log", json!({"tab_id": tab_id, "message": format!("Using Docker: {}", docker_cmd)}));
    let _ = app.emit("test_log", json!({"tab_id": tab_id, "message": format!("Image: {}", image_name)}));
    let _ = app.emit("test_log", json!({"tab_id": tab_id, "message": format!("Test command: {}", test_cmd)}));
    let _ = app.emit("test_log", json!({"tab_id": tab_id, "message": format!("Test files: {}", test_file_paths)}));
    let _ = app.emit("test_log", json!({"tab_id": tab_id, "message": ""}));
    let full_test_cmd = if test_file_paths.trim().is_empty() {
        test_cmd
    } else {
        format!("{} {}", test_cmd, test_file_paths)
    };
    let mut cmd = Command::new(&docker_cmd);
    cmd.arg("run")
        .arg("--rm")
        .arg(&image_name)
        .arg("bash")
        .arg("-c")
        .arg(&full_test_cmd)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to start Docker test: {}", e))?;
    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;
    {
        let mut processes = TEST_PROCESSES.lock().unwrap();
        processes.insert(tab_id.clone(), child);
    }
    let app_clone = app.clone();
    let tab_id_clone = tab_id.clone();
    tauri::async_runtime::spawn(async move {
        let stdout_reader = BufReader::new(stdout);
        let stderr_reader = BufReader::new(stderr);
        let app_clone_stdout = app_clone.clone();
        let tab_id_stdout = tab_id_clone.clone();
        let stdout_task = tauri::async_runtime::spawn(async move {
            let mut lines = stdout_reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = app_clone_stdout.emit("test_log", json!({"tab_id": tab_id_stdout, "message": line}));
            }
        });
        let app_clone_stderr = app_clone.clone();
        let tab_id_stderr = tab_id_clone.clone();
        let stderr_task = tauri::async_runtime::spawn(async move {
            let mut lines = stderr_reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = app_clone_stderr.emit("test_log", json!({"tab_id": tab_id_stderr, "message": format!("STDERR: {}", line)}));
            }
        });
        let mut status_code = None;
        let mut process_result = Ok(());
        loop {
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
            let mut should_break = false;
            let mut processes = TEST_PROCESSES.lock().unwrap();
            if let Some(child_process) = processes.get_mut(&tab_id_clone) {
                match child_process.try_wait() {
                    Ok(Some(status)) => {
                        status_code = Some(status);
                        should_break = true;
                    }
                    Ok(None) => {}
                    Err(e) => {
                        process_result = Err(format!("Process error: {}", e));
                        should_break = true;
                    }
                }
            } else {
                should_break = true;
            }
            drop(processes);
            if should_break {
                break;
            }
        }
        let _ = tokio::join!(stdout_task, stderr_task);
        {
            let mut processes = TEST_PROCESSES.lock().unwrap();
            processes.remove(&tab_id_clone);
        }
        match process_result {
            Ok(()) => {
                if let Some(status) = status_code {
                    let success = status.success();
                    let test_complete = TestCompleteEvent {
                        success,
                        error: if success { None } else { Some("Test run failed".to_string()) },
                    };
                    let _ = app_clone.emit("test_complete", json!({"tab_id": tab_id_clone, "success": test_complete.success, "error": test_complete.error}));
                    if !success {
                        let _ = app_clone.emit("test_log", json!({"tab_id": tab_id_clone, "message": format!("ERROR: Docker test run failed with exit code: {}", status.code().unwrap_or(-1))}));
                    }
                } else {
                    let test_complete = TestCompleteEvent {
                        success: false,
                        error: Some("Test was stopped".to_string()),
                    };
                    let _ = app_clone.emit("test_complete", json!({"tab_id": tab_id_clone, "success": test_complete.success, "error": test_complete.error}));
                    let _ = app_clone.emit("test_log", json!({"tab_id": tab_id_clone, "message": "Test stopped by user"}));
                }
            }
            Err(e) => {
                let _ = app_clone.emit("test_log", json!({"tab_id": tab_id_clone, "message": format!("ERROR: {}", e)}));
                let test_complete = TestCompleteEvent {
                    success: false,
                    error: Some(e),
                };
                let _ = app_clone.emit("test_complete", json!({"tab_id": tab_id_clone, "success": test_complete.success, "error": test_complete.error}));
            }
        }
    });
    Ok(())
}

#[tauri::command]
pub async fn stop_docker_test(tab_id: String) -> Result<(), String> {
    let child = {
        let mut processes = TEST_PROCESSES.lock().unwrap();
        processes.remove(&tab_id)
    };
    if let Some(mut child) = child {
        child.kill().await.map_err(|e| format!("Failed to stop test: {}", e))?;
        Ok(())
    } else {
        Err("No test process is currently running for this tab".to_string())
    }
}
