import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import RepositoryForm from "./components/RepositoryForm";
import BuildSection from "./components/BuildSection";
import TestSection from "./components/TestSection";
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
  const testLogsSectionRef = useRef<HTMLDivElement>(null);

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

  // Scroll test logs section into view when test starts
  useEffect(() => {
    if (isTesting && testLogsSectionRef.current) {
      // Small delay to ensure the section is rendered
      setTimeout(() => {
        testLogsSectionRef.current?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start' 
        });
      }, 100);
    }
  }, [isTesting]);

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
  }, [imageName]);

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

        <RepositoryForm
          githubRepoUrl={githubRepoUrl}
          setGithubRepoUrl={setGithubRepoUrl}
          baseCommit={baseCommit}
          setBaseCommit={setBaseCommit}
          headCommit={headCommit}
          setHeadCommit={setHeadCommit}
          jsonSpec={jsonSpec}
          setJsonSpec={setJsonSpec}
          isDockerfileExpanded={isDockerfileExpanded}
          setIsDockerfileExpanded={setIsDockerfileExpanded}
          generatedDockerfile={generatedDockerfile}
          validationError={validationError}
          isValidJson={isValidJson}
          useHeadCommit={useHeadCommit}
          setUseHeadCommit={setUseHeadCommit}
        />

        <BuildSection
          imageName={imageName}
          setImageName={setImageName}
          isBuilding={isBuilding}
          buildLogs={buildLogs}
          shouldAutoScroll={shouldAutoScroll}
          setShouldAutoScroll={setShouldAutoScroll}
          handleBuild={handleBuild}
          handleStopBuild={handleStopBuild}
          isValidImageName={isValidImageName}
          generatedDockerfile={generatedDockerfile}
          isValidJson={isValidJson}
          validationError={validationError}
          logsContainerRef={logsContainerRef}
          buildLogsSectionRef={buildLogsSectionRef}
          handleScroll={handleScroll}
        />

        <TestSection
          testFiles={testFiles}
          setTestFiles={setTestFiles}
          isTesting={isTesting}
          testLogs={testLogs}
          shouldAutoScrollTest={shouldAutoScrollTest}
          setShouldAutoScrollTest={setShouldAutoScrollTest}
          handleTest={handleTest}
          handleStopTest={handleStopTest}
          isImageExists={isImageExists}
          isCheckingImage={isCheckingImage}
          testLogsContainerRef={testLogsContainerRef}
          testLogsSectionRef={testLogsSectionRef}
          handleTestScroll={handleTestScroll}
        />
      </div>
    </div>
  );
}

export default App;
