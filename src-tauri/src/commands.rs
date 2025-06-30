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

#[derive(Serialize, Deserialize, Debug)]
pub struct DockerSpecs {
    pub ubuntu_version: Option<String>,
    pub platform: Option<String>,
    pub node_version: Option<String>,
    pub pnpm_version: Option<String>,
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

// Global state for tracking running Docker build process
lazy_static::lazy_static! {
    static ref DOCKER_PROCESS: Arc<Mutex<Option<Child>>> = Arc::new(Mutex::new(None));
    static ref TEST_PROCESS: Arc<Mutex<Option<Child>>> = Arc::new(Mutex::new(None));
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

fn get_json_schema() -> Value {
    json!({
        "type": "object",
        "properties": {
            "test_cmd": {
                "type": "string",
                "description": "The test command without any placeholders, all tests are getting appended to the end of this test command."
            },
            "log_parser_name": {
                "type": "string",
                "enum": ["jest", "mocha", "vitest", "karma", "tap", "calypso", "chartjs", "marked", "p5js", "reactpdf"],
                "description": "A log parser is used to parse the textual result of the tests and determine how many succeeded, how many failed..."
            },
            "pre_install": {
                "type": "array",
                "items": {
                    "type": "string"
                },
                "description": "List of regular shell commands to run before the installation step."
            },
            "install": {
                "type": "array",
                "items": {
                    "type": "string"
                },
                "description": "List of regular shell commands to run in the installation step."
            },
            "build": {
                "type": "array",
                "items": {
                    "type": "string"
                },
                "description": "List of regular shell commands to run in the build step."
            },
            "docker_specs": {
                "type": "object",
                "properties": {
                    "ubuntu_version": {
                        "type": "string",
                        "description": "Ubuntu version for the Docker image"
                    },
                    "platform": {
                        "type": "string",
                        "description": "Platform specification for the Docker image"
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

fn validate_json_config(input: &str) -> Result<TestConfig, String> {
    // First, try to parse the JSON
    let parsed_json: Value = match serde_json::from_str(input) {
        Ok(json) => json,
        Err(e) => return Err(format!("Invalid JSON syntax: {}", e)),
    };

    // Get the schema and compile it
    let schema_value = get_json_schema();
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

fn generate_dockerfile(config: &TestConfig, github_repo_url: &str, commit: &str) -> String {
    // Use updated default values for any missing docker specs
    let ubuntu_version = config.docker_specs.as_ref()
        .and_then(|specs| specs.ubuntu_version.as_ref())
        .map(|s| s.as_str())
        .unwrap_or("22.04");
    
    let platform = config.docker_specs.as_ref()
        .and_then(|specs| specs.platform.as_ref())
        .map(|s| s.as_str())
        .unwrap_or("linux/x86_64");
    
    let node_version = config.docker_specs.as_ref()
        .and_then(|specs| specs.node_version.as_ref())
        .map(|s| s.as_str())
        .unwrap_or("20");
    
    let pnpm_version = config.docker_specs.as_ref()
        .and_then(|specs| specs.pnpm_version.as_ref())
        .map(|s| s.as_str())
        .unwrap_or("9.5.0");

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
    
    let dockerfile_template = format!("FROM --platform={} ubuntu:{}

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
        platform,
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
    );
    
    dockerfile_template
}

#[tauri::command]
pub fn generate_docker_file(input_json: String, github_repo_url: String, commit: String) -> ValidationResult {
    match validate_json_config(&input_json) {
        Ok(config) => {
            let dockerfile = generate_dockerfile(&config, &github_repo_url, &commit);
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
async fn check_docker_available() -> Result<(), String> {
    // Check if docker command exists
    if which::which("docker").is_err() {
        return Err("Docker is not installed or not found in PATH".to_string());
    }

    // Check if Docker daemon is running
    let output = Command::new("docker")
        .arg("info")
        .output()
        .await
        .map_err(|e| format!("Failed to check Docker status: {}", e))?;

    if !output.status.success() {
        return Err("Docker daemon is not running".to_string());
    }

    Ok(())
}



#[tauri::command]
pub async fn build_docker_image(
    dockerfile_content: String,
    image_name: String,
    github_repo_url: String,
    commit: String,
    app: AppHandle,
) -> Result<(), String> {
    // Check if Docker is available
    check_docker_available().await?;

    // Check if there's already a build running
    {
        let process = DOCKER_PROCESS.lock().unwrap();
        if process.is_some() {
            return Err("A Docker build is already running".to_string());
        }
    }

    // Create a temporary Dockerfile
    let mut temp_file = NamedTempFile::new()
        .map_err(|e| format!("Failed to create temporary file: {}", e))?;
    
    temp_file
        .write_all(dockerfile_content.as_bytes())
        .map_err(|e| format!("Failed to write Dockerfile: {}", e))?;

    // Get the path before moving temp_file
    let dockerfile_path = temp_file.path().to_path_buf();

    // Emit initial log
    let _ = app.emit("build_log", "Starting Docker build...");
    let _ = app.emit("build_log", &format!("Building image: {}", image_name));
    let _ = app.emit("build_log", &format!("Repository: {}", github_repo_url));
    let _ = app.emit("build_log", &format!("Commit: {}", commit));
    let _ = app.emit("build_log", "");

    // Start Docker build process
    let mut cmd = Command::new("docker");
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

    // Extract stdout and stderr immediately
    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;

    // Store the process reference for potential cancellation (without stdout/stderr)
    {
        let mut process = DOCKER_PROCESS.lock().unwrap();
        *process = Some(child);
    }

    // Spawn a task to handle the streaming and keep temp_file alive
    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        // Keep temp_file alive by moving it into this async block
        let _temp_file = temp_file;

        let stdout_reader = BufReader::new(stdout);
        let stderr_reader = BufReader::new(stderr);

        let app_clone_stdout = app_clone.clone();
        let stdout_task = tauri::async_runtime::spawn(async move {
            let mut lines = stdout_reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = app_clone_stdout.emit("build_log", &line);
            }
        });

        let app_clone_stderr = app_clone.clone();
        let stderr_task = tauri::async_runtime::spawn(async move {
            let mut lines = stderr_reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = app_clone_stderr.emit("build_log", &format!("STDERR: {}", line));
            }
        });

        // Wait for the process to complete by checking the global state
        let mut status_code = None;
        let mut process_result = Ok(());
        
        // Poll the process status until it completes
        loop {
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
            
            let mut should_break = false;
            let mut process_guard = DOCKER_PROCESS.lock().unwrap();
            
            if let Some(ref mut child_process) = process_guard.as_mut() {
                match child_process.try_wait() {
                    Ok(Some(status)) => {
                        status_code = Some(status);
                        should_break = true;
                    }
                    Ok(None) => {
                        // Still running, continue polling
                    }
                    Err(e) => {
                        process_result = Err(format!("Process error: {}", e));
                        should_break = true;
                    }
                }
            } else {
                // Process was removed (likely stopped), break
                should_break = true;
            }
            
            drop(process_guard); // Release the lock
            
            if should_break {
                break;
            }
        }

        // Wait for log streaming to complete
        let _ = tokio::join!(stdout_task, stderr_task);

        // Clear the global process reference
        {
            let mut process = DOCKER_PROCESS.lock().unwrap();
            *process = None;
        }

        // Emit completion event
        match process_result {
            Ok(()) => {
                if let Some(status) = status_code {
                    let success = status.success();
                    let build_complete = BuildCompleteEvent {
                        success,
                        error: if success { None } else { Some("Build failed".to_string()) },
                    };
                    let _ = app_clone.emit("build_complete", build_complete);

                    if !success {
                        let _ = app_clone.emit("build_log", &format!("ERROR: Docker build failed with exit code: {}", status.code().unwrap_or(-1)));
                    }
                } else {
                    // Process was stopped
                    let build_complete = BuildCompleteEvent {
                        success: false,
                        error: Some("Build was stopped".to_string()),
                    };
                    let _ = app_clone.emit("build_complete", build_complete);
                    let _ = app_clone.emit("build_log", "Build stopped by user");
                }
            }
            Err(e) => {
                let _ = app_clone.emit("build_log", &format!("ERROR: {}", e));
                let build_complete = BuildCompleteEvent {
                    success: false,
                    error: Some(e),
                };
                let _ = app_clone.emit("build_complete", build_complete);
            }
        }
        
        // temp_file will be automatically cleaned up when this async block ends
    });

    Ok(())
}

#[tauri::command]
pub async fn stop_docker_build() -> Result<(), String> {
    // Extract the child process from the mutex without holding the guard across await
    let mut child = {
        let mut process = DOCKER_PROCESS.lock().unwrap();
        process.take()
    };
    
    if let Some(ref mut child_process) = child {
        child_process.kill().await.map_err(|e| format!("Failed to stop build: {}", e))?;
        Ok(())
    } else {
        Err("No build process is currently running".to_string())
    }
}

#[tauri::command]
pub async fn check_docker_image_exists(image_name: String) -> Result<bool, String> {
    // Check if Docker is available first
    check_docker_available().await?;

    // Use docker images command to check if the image exists
    let output = Command::new("docker")
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



#[tauri::command]
pub async fn run_docker_test(
    image_name: String,
    test_cmd: String,
    test_file_paths: String,
    app: AppHandle,
) -> Result<(), String> {
    // Check if Docker is available
    check_docker_available().await?;

    // Check if there's already a test running
    {
        let process = TEST_PROCESS.lock().unwrap();
        if process.is_some() {
            return Err("A Docker test is already running".to_string());
        }
    }

    // Emit initial log
    let _ = app.emit("test_log", "Starting Docker test run...");
    let _ = app.emit("test_log", &format!("Image: {}", image_name));
    let _ = app.emit("test_log", &format!("Test command: {}", test_cmd));
    let _ = app.emit("test_log", &format!("Test files: {}", test_file_paths));
    let _ = app.emit("test_log", "");

    // Construct the full command to run in the container
    let full_test_cmd = if test_file_paths.trim().is_empty() {
        test_cmd
    } else {
        format!("{} {}", test_cmd, test_file_paths)
    };

    // Start Docker test process
    let mut cmd = Command::new("docker");
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

    // Extract stdout and stderr immediately
    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;

    // Store the process reference for potential cancellation (without stdout/stderr)
    {
        let mut process = TEST_PROCESS.lock().unwrap();
        *process = Some(child);
    }

    // Spawn a task to handle the streaming
    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        let stdout_reader = BufReader::new(stdout);
        let stderr_reader = BufReader::new(stderr);

        let app_clone_stdout = app_clone.clone();
        let stdout_task = tauri::async_runtime::spawn(async move {
            let mut lines = stdout_reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = app_clone_stdout.emit("test_log", &line);
            }
        });

        let app_clone_stderr = app_clone.clone();
        let stderr_task = tauri::async_runtime::spawn(async move {
            let mut lines = stderr_reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = app_clone_stderr.emit("test_log", &format!("STDERR: {}", line));
            }
        });

        // Wait for the process to complete by checking the global state
        let mut status_code = None;
        let mut process_result = Ok(());
        
        // Poll the process status until it completes
        loop {
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
            
            let mut should_break = false;
            let mut process_guard = TEST_PROCESS.lock().unwrap();
            
            if let Some(ref mut child_process) = process_guard.as_mut() {
                match child_process.try_wait() {
                    Ok(Some(status)) => {
                        status_code = Some(status);
                        should_break = true;
                    }
                    Ok(None) => {
                        // Still running, continue polling
                    }
                    Err(e) => {
                        process_result = Err(format!("Process error: {}", e));
                        should_break = true;
                    }
                }
            } else {
                // Process was removed (likely stopped), break
                should_break = true;
            }
            
            drop(process_guard); // Release the lock
            
            if should_break {
                break;
            }
        }

        // Wait for log streaming to complete
        let _ = tokio::join!(stdout_task, stderr_task);

        // Clear the global process reference
        {
            let mut process = TEST_PROCESS.lock().unwrap();
            *process = None;
        }

        // Emit completion event
        match process_result {
            Ok(()) => {
                if let Some(status) = status_code {
                    let success = status.success();
                    let test_complete = TestCompleteEvent {
                        success,
                        error: if success { None } else { Some("Test run failed".to_string()) },
                    };
                    let _ = app_clone.emit("test_complete", test_complete);

                    if !success {
                        let _ = app_clone.emit("test_log", &format!("ERROR: Docker test run failed with exit code: {}", status.code().unwrap_or(-1)));
                    }
                } else {
                    // Process was stopped
                    let test_complete = TestCompleteEvent {
                        success: false,
                        error: Some("Test was stopped".to_string()),
                    };
                    let _ = app_clone.emit("test_complete", test_complete);
                    let _ = app_clone.emit("test_log", "Test stopped by user");
                }
            }
            Err(e) => {
                let _ = app_clone.emit("test_log", &format!("ERROR: {}", e));
                let test_complete = TestCompleteEvent {
                    success: false,
                    error: Some(e),
                };
                let _ = app_clone.emit("test_complete", test_complete);
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn stop_docker_test() -> Result<(), String> {
    // Extract the child process from the mutex without holding the guard across await
    let mut child = {
        let mut process = TEST_PROCESS.lock().unwrap();
        process.take()
    };
    
    if let Some(ref mut child_process) = child {
        child_process.kill().await.map_err(|e| format!("Failed to stop test: {}", e))?;
        Ok(())
    } else {
        Err("No test process is currently running".to_string())
    }
}