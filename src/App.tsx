import { useState, useEffect, ChangeEvent, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import Editor from "@monaco-editor/react";
import { FiChevronDown, FiChevronRight, FiCopy, FiPlay, FiSquare, FiCheck } from "react-icons/fi";
import "./App.css";


interface ValidationResult {
  success: boolean;
  error?: string;
  dockerfile?: string;
}

function App() {
  const [githubRepoUrl, setGithubRepoUrl] = useState("");
  const [baseCommit, setBaseCommit] = useState("");
  const [headCommit, setHeadCommit] = useState("");
  const [jsonSpec, setJsonSpec] = useState<string>(`{
  "test_cmd": "npm test",
  "log_parser_name": "jest"
}`);
  const [imageName, setImageName] = useState("");
  const [testFiles, setTestFiles] = useState("");
  const [isDockerfileExpanded, setIsDockerfileExpanded] = useState(false);
  const [generatedDockerfile, setGeneratedDockerfile] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isValidJson, setIsValidJson] = useState(true);
  const [useHeadCommit, setUseHeadCommit] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);
  const [buildLogs, setBuildLogs] = useState<string[]>([]);
  const [isValidImageName, setIsValidImageName] = useState(false);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [isImageExists, setIsImageExists] = useState(false);
  const [isCheckingImage, setIsCheckingImage] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testLogs, setTestLogs] = useState<string[]>([]);
  const [shouldAutoScrollTest, setShouldAutoScrollTest] = useState(true);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const testLogsContainerRef = useRef<HTMLDivElement>(null);
  const buildLogsSectionRef = useRef<HTMLDivElement>(null);

  // Validate JSON syntax
  const validateJsonSyntax = (jsonString: string): boolean => {
    try {
      JSON.parse(jsonString);
      return true;
    } catch {
      return false;
    }
  };

  // Validate Docker image name
  const validateDockerImageName = (name: string): boolean => {
    if (!name.trim()) return false;
    
    // Basic Docker image name validation
    // Must be lowercase, can contain alphanumeric, hyphens, underscores, periods, and slashes
    const dockerNameRegex = /^[a-z0-9]([a-z0-9._-]*[a-z0-9])?(\:[a-z0-9]([a-z0-9._-]*[a-z0-9])?)?$/;
    
    // Must not be longer than 128 characters
    if (name.length > 128) return false;
    
    return dockerNameRegex.test(name);
  };

  // Extract GitHub repo info and generate image name
  const generateImageNameFromGitHubUrl = (url: string): string => {
    if (!url.trim()) return "";
    
    try {
      // Handle different GitHub URL formats
      let cleanUrl = url.trim();
      
      // Remove .git suffix if present
      if (cleanUrl.endsWith('.git')) {
        cleanUrl = cleanUrl.slice(0, -4);
      }
      
      // Extract path from different URL formats
      let repoPath = "";
      
      if (cleanUrl.startsWith('https://github.com/') || cleanUrl.startsWith('http://github.com/')) {
        repoPath = cleanUrl.replace(/^https?:\/\/github\.com\//, '');
      } else if (cleanUrl.startsWith('git@github.com:')) {
        repoPath = cleanUrl.replace(/^git@github\.com:/, '');
      } else if (cleanUrl.includes('github.com/')) {
        // Handle other formats that contain github.com/
        const match = cleanUrl.match(/github\.com\/(.+)/);
        if (match) {
          repoPath = match[1];
        }
      } else {
        return ""; // Not a recognizable GitHub URL
      }
      
      // Extract user/repo from path
      const pathParts = repoPath.split('/');
      if (pathParts.length >= 2) {
        const user = pathParts[0].toLowerCase();
        const repo = pathParts[1].toLowerCase();
        
        // Clean up repo name (remove any additional path segments, query params, etc.)
        const cleanRepo = repo.split('?')[0].split('#')[0];
        
        return `${user}__${cleanRepo}`;
      }
      
      return "";
    } catch (error) {
      return "";
    }
  };

  // Auto-generate image name when GitHub URL changes
  useEffect(() => {
    const generatedImageName = generateImageNameFromGitHubUrl(githubRepoUrl);
    if (generatedImageName) {
      setImageName(generatedImageName);
    }
  }, [githubRepoUrl]);

  // Update image name validation when imageName changes
  useEffect(() => {
    setIsValidImageName(validateDockerImageName(imageName));
  }, [imageName]);

  // Check if image exists when image name changes
  useEffect(() => {
    if (imageName && isValidImageName) {
      checkImageExists(imageName);
    } else {
      setIsImageExists(false);
    }
  }, [imageName, isValidImageName]);

  // Generate Dockerfile from JSON spec using backend validation
  useEffect(() => {
    const generateDockerfile = async () => {
      // First, check JSON syntax
      const syntaxValid = validateJsonSyntax(jsonSpec);
      setIsValidJson(syntaxValid);
      
      if (!syntaxValid) {
        setValidationError("Invalid JSON syntax. Please fix the JSON before proceeding.");
        setGeneratedDockerfile("# Invalid JSON syntax\n# Please check your JSON format");
        return;
      }

      // Check if we have the required inputs
      if (!githubRepoUrl.trim()) {
        setValidationError("GitHub repository URL is required for Dockerfile generation.");
        setGeneratedDockerfile("# Missing GitHub repository URL\n# Please enter a GitHub repository URL");
        return;
      }

      const commitToUse = useHeadCommit ? headCommit : baseCommit;
      if (!commitToUse.trim()) {
        setValidationError(`${useHeadCommit ? 'Head' : 'Base'} commit is required for Dockerfile generation.`);
        setGeneratedDockerfile(`# Missing ${useHeadCommit ? 'head' : 'base'} commit\n# Please enter a ${useHeadCommit ? 'head' : 'base'} commit hash`);
        return;
      }

      setValidationError(null);

      try {
        // Call the backend validation and generation
        const result = await invoke<ValidationResult>("generate_docker_file", {
          inputJson: jsonSpec,
          githubRepoUrl: githubRepoUrl.trim(),
          commit: commitToUse.trim()
        });

        if (result.success && result.dockerfile) {
          setGeneratedDockerfile(result.dockerfile);
          setValidationError(null);
        } else if (result.error) {
          setValidationError(result.error);
          setGeneratedDockerfile("# Validation failed\n# " + result.error.replace(/\n/g, "\n# "));
        }
      } catch (error) {
        console.error("Failed to generate Dockerfile:", error);
        setValidationError("Failed to communicate with backend: " + String(error));
        setGeneratedDockerfile("# Backend error\n# Failed to generate Dockerfile");
      }
    };

    generateDockerfile();
  }, [jsonSpec, githubRepoUrl, baseCommit, headCommit, useHeadCommit]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (shouldAutoScroll && logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [buildLogs, shouldAutoScroll]);

  // Auto-scroll to bottom when new test logs arrive
  useEffect(() => {
    if (shouldAutoScrollTest && testLogsContainerRef.current) {
      testLogsContainerRef.current.scrollTop = testLogsContainerRef.current.scrollHeight;
    }
  }, [testLogs, shouldAutoScrollTest]);

  // Scroll build logs section into view when build starts
  useEffect(() => {
    if (isBuilding && buildLogsSectionRef.current) {
      // Small delay to ensure the section is rendered
      setTimeout(() => {
        buildLogsSectionRef.current?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start' 
        });
      }, 100);
    }
  }, [isBuilding]);

  // Handle scroll events to detect manual scrolling
  const handleScroll = () => {
    if (logsContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = logsContainerRef.current;
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 5; // 5px threshold
      setShouldAutoScroll(isAtBottom);
    }
  };

  // Listen for build logs
  useEffect(() => {
    const unlisten = listen<string>("build_log", (event) => {
      setBuildLogs((prev: string[]) => [...prev, event.payload]);
    });

    const unlistenBuildComplete = listen<{ success: boolean; error?: string }>("build_complete", (event) => {
      setIsBuilding(false);
      if (!event.payload.success && event.payload.error) {
        setBuildLogs((prev: string[]) => [...prev, `ERROR: ${event.payload.error}`]);
      } else if (event.payload.success) {
        // Recheck if the image exists after successful build to enable test button
        checkImageExists(imageName);
      }
    });

    return () => {
      unlisten.then(f => f());
      unlistenBuildComplete.then(f => f());
    };
  }, []);

  // Listen for test logs
  useEffect(() => {
    const unlistenTestLog = listen<string>("test_log", (event) => {
      setTestLogs((prev: string[]) => [...prev, event.payload]);
    });

    const unlistenTestComplete = listen<{ success: boolean; error?: string }>("test_complete", (event) => {
      setIsTesting(false);
      if (!event.payload.success && event.payload.error) {
        setTestLogs((prev: string[]) => [...prev, `ERROR: ${event.payload.error}`]);
      }
    });

    return () => {
      unlistenTestLog.then(f => f());
      unlistenTestComplete.then(f => f());
    };
  }, []);

  const handleBuild = async () => {
    if (!isValidImageName || isBuilding || !isValidJson || validationError !== null) return;
    
    setIsBuilding(true);
    setBuildLogs([]);
    setTestLogs([]); // Clear test logs when starting a new build
    setShouldAutoScroll(true); // Reset auto-scroll for new build
    
    const commitToUse = useHeadCommit ? headCommit : baseCommit;
    
    try {
      await invoke("build_docker_image", {
        dockerfileContent: generatedDockerfile,
        imageName: imageName.trim(),
        githubRepoUrl: githubRepoUrl.trim(),
        commit: commitToUse.trim()
      });
    } catch (error) {
      setIsBuilding(false);
      setBuildLogs((prev: string[]) => [...prev, `ERROR: ${error}`]);
      console.error("Build failed:", error);
    }
  };

  const handleStopBuild = async () => {
    try {
      await invoke("stop_docker_build");
      setIsBuilding(false);
    } catch (error) {
      console.error("Failed to stop build:", error);
    }
  };

  const handleTest = async () => {
    if (!isImageExists || isTesting) return;
    
    // Extract test_cmd from the JSON spec
    let testCmd = "";
    try {
      const parsedSpec = JSON.parse(jsonSpec);
      testCmd = parsedSpec.test_cmd || "";
    } catch (error) {
      console.error("Failed to parse JSON spec:", error);
      return;
    }
    
    if (!testCmd.trim()) {
      console.error("No test command found in JSON spec");
      return;
    }
    
    setIsTesting(true);
    setTestLogs([]);
    setShouldAutoScrollTest(true); // Reset auto-scroll for new test
    
    try {
      await invoke("run_docker_test", {
        imageName: imageName.trim(),
        testCmd: testCmd.trim(),
        testFilePaths: testFiles.trim()
      });
    } catch (error) {
      setIsTesting(false);
      setTestLogs((prev: string[]) => [...prev, `ERROR: ${error}`]);
      console.error("Test failed:", error);
    }
  };

  const handleStopTest = async () => {
    try {
      await invoke("stop_docker_test");
      setIsTesting(false);
    } catch (error) {
      console.error("Failed to stop test:", error);
    }
  };

  // Handle scroll events for test logs
  const handleTestScroll = () => {
    if (testLogsContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = testLogsContainerRef.current;
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 5; // 5px threshold
      setShouldAutoScrollTest(isAtBottom);
    }
  };

  const handleCopyDockerfile = async () => {
    try {
      await navigator.clipboard.writeText(generatedDockerfile);
      // You could add a toast notification here if desired
    } catch (err) {
      console.error('Failed to copy dockerfile:', err);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = generatedDockerfile;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
  };

  const handleCopyJsonSpec = async () => {
    try {
      await navigator.clipboard.writeText(jsonSpec);
      // You could add a toast notification here if desired
    } catch (err) {
      console.error('Failed to copy JSON spec:', err);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = jsonSpec;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
  };

  const handleCopyBuildLogs = async () => {
    const logsText = buildLogs.join('\n');
    try {
      await navigator.clipboard.writeText(logsText);
    } catch (err) {
      console.error('Failed to copy build logs:', err);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = logsText;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
  };

  const handleCopyTestLogs = async () => {
    const logsText = testLogs.join('\n');
    try {
      await navigator.clipboard.writeText(logsText);
    } catch (err) {
      console.error('Failed to copy test logs:', err);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = logsText;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
  };

  const checkImageExists = async (imageNameToCheck: string) => {
    if (!imageNameToCheck.trim() || !validateDockerImageName(imageNameToCheck)) {
      setIsImageExists(false);
      return;
    }

    setIsCheckingImage(true);
    try {
      const exists = await invoke<boolean>("check_docker_image_exists", {
        imageName: imageNameToCheck.trim()
      });
      setIsImageExists(exists);
    } catch (error) {
      console.error("Failed to check if image exists:", error);
      setIsImageExists(false);
    } finally {
      setIsCheckingImage(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-6xl mx-auto space-y-6 pb-16">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">
          SWEBench Debugger
        </h1>

        {/* First Row: GitHub Repo URL */}
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 min-w-[140px]">
            GitHub Repo URL
          </label>
          <input
            type="text"
            value={githubRepoUrl}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setGithubRepoUrl(e.target.value)}
            className="flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
            placeholder="Enter GitHub repository URL..."
          />
        </div>

        {/* Second Row: Base and Head Commit */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 min-w-[100px]">
              Base Commit
            </label>
            <input
              type="text"
              value={baseCommit}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setBaseCommit(e.target.value)}
              className="flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              placeholder="Enter base commit hash..."
            />
          </div>
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 min-w-[100px]">
              Head Commit
            </label>
            <input
              type="text"
              value={headCommit}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setHeadCommit(e.target.value)}
              className="flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              placeholder="Enter head commit hash..."
            />
          </div>
        </div>

        {/* Third Row: JSON Spec */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              JSON Spec
            </label>
            {jsonSpec && (
              <button
                onClick={handleCopyJsonSpec}
                className="p-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                title="Copy JSON Spec"
              >
                <FiCopy size={16} />
              </button>
            )}
          </div>
          {/* Validation status indicator */}
          {!isValidJson && (
            <div className="mb-2 p-2 bg-red-100 dark:bg-red-900 border border-red-300 dark:border-red-700 rounded-md">
              <p className="text-sm text-red-700 dark:text-red-300">Invalid JSON syntax</p>
            </div>
          )}
          {validationError && isValidJson && (
            <div className="mb-2 p-2 bg-yellow-100 dark:bg-yellow-900 border border-yellow-300 dark:border-yellow-700 rounded-md">
              <p className="text-sm text-yellow-700 dark:text-yellow-300 whitespace-pre-wrap">{validationError}</p>
            </div>
          )}
          <div className={`border rounded-md overflow-hidden ${
            !isValidJson 
              ? 'border-red-500 dark:border-red-400' 
              : validationError 
                ? 'border-yellow-500 dark:border-yellow-400'
                : 'border-gray-300 dark:border-gray-600'
          }`}>
            <Editor
              height="250px"
              defaultLanguage="json"
              value={jsonSpec}
              onChange={(value: string | undefined) => setJsonSpec(value || "")}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                lineNumbers: "on",
                scrollBeyondLastLine: false,
                automaticLayout: true,
                formatOnPaste: true,
                formatOnType: true,
              }}
            />
          </div>
        </div>

        {/* Fourth Row: Expandable Dockerfile */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsDockerfileExpanded(!isDockerfileExpanded)}
                className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
              >
                {isDockerfileExpanded ? <FiChevronDown /> : <FiChevronRight />}
                Generated Dockerfile
              </button>
              {generatedDockerfile && (
                <button
                  onClick={handleCopyDockerfile}
                  className="p-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                  title="Copy Dockerfile"
                >
                  <FiCopy size={16} />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">Use:</span>
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="radio"
                  name="commit"
                  checked={!useHeadCommit}
                  onChange={() => setUseHeadCommit(false)}
                  className="text-blue-600"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Base Commit</span>
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="radio"
                  name="commit"
                  checked={useHeadCommit}
                  onChange={() => setUseHeadCommit(true)}
                  className="text-blue-600"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Head Commit</span>
              </label>
            </div>
          </div>
          {isDockerfileExpanded && (
            <div className="border border-gray-300 dark:border-gray-600 rounded-md overflow-hidden">
              <Editor
                height="300px"
                defaultLanguage="dockerfile"
                value={generatedDockerfile}
                theme="vs-dark"
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  lineNumbers: "on",
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  readOnly: true,
                  wordWrap: "on",
                  folding: false,
                  renderLineHighlight: "none",
                  contextmenu: false,
                }}
              />
            </div>
          )}
        </div>

        {/* Fifth Row: Image Name and Build */}
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 min-w-[100px]">
            Image Name
          </label>
          <div className="flex-1">
            <input
              type="text"
              value={imageName}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setImageName(e.target.value)}
              className={`w-full px-3 py-1.5 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white ${
                imageName && !isValidImageName 
                  ? 'border-red-500 dark:border-red-400' 
                  : 'border-gray-300 dark:border-gray-600'
              }`}
              placeholder="Enter image name (e.g., myapp:latest)..."
            />
            {imageName && !isValidImageName && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                Invalid Docker image name. Use lowercase letters, numbers, hyphens, underscores, and periods.
              </p>
            )}
          </div>
          {!isBuilding ? (
            <button
              onClick={handleBuild}
              disabled={!isValidImageName || !generatedDockerfile || isBuilding || !isValidJson || validationError !== null}
              className={`px-6 py-2 font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors flex items-center gap-2 ${
                !isValidImageName || !generatedDockerfile || isBuilding || !isValidJson || validationError !== null
                  ? 'bg-gray-400 cursor-not-allowed text-gray-700'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
              title={
                !isValidJson ? 'JSON spec has syntax errors' :
                validationError ? `Validation error: ${validationError}` :
                !isValidImageName ? 'Invalid Docker image name' :
                !generatedDockerfile ? 'No Dockerfile generated' :
                'Build Docker image'
              }
            >
              <FiPlay size={16} />
              Build
            </button>
          ) : (
            <button
              onClick={handleStopBuild}
              className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors flex items-center gap-2"
            >
              <FiSquare size={16} />
              Stop
            </button>
          )}
        </div>

        {/* Build Logs Section */}
        {(isBuilding || buildLogs.length > 0) && (
          <div ref={buildLogsSectionRef}>
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                Build Logs
              </h3>
              {isBuilding && (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              )}
              {!isBuilding && buildLogs.length > 0 && (
                <button
                  onClick={handleCopyBuildLogs}
                  className="p-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                  title="Copy Build Logs"
                >
                  <FiCopy size={16} />
                </button>
              )}
              {!shouldAutoScroll && buildLogs.length > 0 && (
                <div className="flex items-center gap-1 text-sm text-yellow-600 dark:text-yellow-400">
                  <span>Auto-scroll paused</span>
                  <button
                    onClick={() => {
                      setShouldAutoScroll(true);
                      if (logsContainerRef.current) {
                        logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
                      }
                    }}
                    className="text-xs px-2 py-1 bg-yellow-100 dark:bg-yellow-900 rounded hover:bg-yellow-200 dark:hover:bg-yellow-800 transition-colors"
                  >
                    Scroll to bottom
                  </button>
                </div>
              )}
            </div>
            <div 
              ref={logsContainerRef}
              onScroll={handleScroll}
              className="bg-gray-900 dark:bg-gray-800 rounded-md p-4 h-96 max-h-96 overflow-y-auto"
            >
              {buildLogs.map((log, index) => (
                <div key={index} className="text-sm font-mono text-green-400 whitespace-pre-wrap">
                  {log}
                </div>
              ))}
              {isBuilding && buildLogs.length === 0 && (
                <div className="text-sm font-mono text-gray-400">
                  Initializing build...
                </div>
              )}
            </div>
          </div>
        )}

        {/* Sixth Row: Test Files and Test */}
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 min-w-[100px]">
            Test Files
          </label>
          <input
            type="text"
            value={testFiles}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setTestFiles(e.target.value)}
            className="flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 dark:bg-gray-700 dark:text-white"
            placeholder="Enter test file paths..."
          />
          {!isTesting ? (
            <button
              onClick={handleTest}
              disabled={!isImageExists || isCheckingImage || isTesting}
              className={`px-6 py-2 font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-colors flex items-center gap-2 ${
                !isImageExists || isCheckingImage || isTesting
                  ? 'bg-gray-400 cursor-not-allowed text-gray-700'
                  : 'bg-green-600 hover:bg-green-700 text-white'
              }`}
              title={!isImageExists ? 'Docker image does not exist' : 'Run tests'}
            >
              {isCheckingImage ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
              ) : (
                <FiCheck size={16} />
              )}
              Test
            </button>
          ) : (
            <button
              onClick={handleStopTest}
              className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors flex items-center gap-2"
            >
              <FiSquare size={16} />
              Stop
            </button>
                     )}
        </div>

        {/* Test Logs Section */}
        {(isTesting || testLogs.length > 0) && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                Test Logs
              </h3>
              {isTesting && (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-600"></div>
              )}
              {!isTesting && testLogs.length > 0 && (
                <button
                  onClick={handleCopyTestLogs}
                  className="p-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                  title="Copy Test Logs"
                >
                  <FiCopy size={16} />
                </button>
              )}
              {!shouldAutoScrollTest && testLogs.length > 0 && (
                <div className="flex items-center gap-1 text-sm text-yellow-600 dark:text-yellow-400">
                  <span>Auto-scroll paused</span>
                  <button
                    onClick={() => {
                      setShouldAutoScrollTest(true);
                      if (testLogsContainerRef.current) {
                        testLogsContainerRef.current.scrollTop = testLogsContainerRef.current.scrollHeight;
                      }
                    }}
                    className="text-xs px-2 py-1 bg-yellow-100 dark:bg-yellow-900 rounded hover:bg-yellow-200 dark:hover:bg-yellow-800 transition-colors"
                  >
                    Scroll to bottom
                  </button>
                </div>
              )}
            </div>
            <div 
              ref={testLogsContainerRef}
              onScroll={handleTestScroll}
              className="bg-gray-900 dark:bg-gray-800 rounded-md p-4 max-h-96 overflow-y-auto"
            >
              {testLogs.map((log, index) => (
                <div key={index} className="text-sm font-mono text-green-400 whitespace-pre-wrap">
                  {log}
                </div>
              ))}
              {isTesting && testLogs.length === 0 && (
                <div className="text-sm font-mono text-gray-400">
                  Initializing test run...
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
