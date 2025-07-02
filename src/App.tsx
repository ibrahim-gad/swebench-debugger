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

interface TabData {
  id: string;
  title: string;
  githubRepoUrl: string;
  baseCommit: string;
  headCommit: string;
  jsonSpec: string;
  imageName: string;
  testFiles: string;
  isDockerfileExpanded: boolean;
  generatedDockerfile: string;
  validationError: string | null;
  isValidJson: boolean;
  useHeadCommit: boolean;
  isBuilding: boolean;
  buildLogs: string[];
  isValidImageName: boolean;
  shouldAutoScroll: boolean;
  isImageExists: boolean;
  isCheckingImage: boolean;
  isTesting: boolean;
  testLogs: string[];
  shouldAutoScrollTest: boolean;
  dockerPath: string;
  isDockerPathExpanded: boolean;
}

// SWEBenchTab component - represents a single tab
function SWEBenchTab({
  tabData,
  onTabDataChange,
  dockerPath,
  setDockerPath,
}: {
  tabData: TabData;
  onTabDataChange: (data: TabData) => void;
  dockerPath: string;
  setDockerPath: (path: string) => void;
}) {
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
    const dockerNameRegex =
      /^[a-z0-9]([a-z0-9._-]*[a-z0-9])?(\:[a-z0-9]([a-z0-9._-]*[a-z0-9])?)?$/;

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
      if (cleanUrl.endsWith(".git")) {
        cleanUrl = cleanUrl.slice(0, -4);
      }

      // Extract path from different URL formats
      let repoPath = "";

      if (
        cleanUrl.startsWith("https://github.com/") ||
        cleanUrl.startsWith("http://github.com/")
      ) {
        repoPath = cleanUrl.replace(/^https?:\/\/github\.com\//, "");
      } else if (cleanUrl.startsWith("git@github.com:")) {
        repoPath = cleanUrl.replace(/^git@github\.com:/, "");
      } else if (cleanUrl.includes("github.com/")) {
        // Handle other formats that contain github.com/
        const match = cleanUrl.match(/github\.com\/(.+)/);
        if (match) {
          repoPath = match[1];
        }
      } else {
        return ""; // Not a recognizable GitHub URL
      }

      // Extract user/repo from path
      const pathParts = repoPath.split("/");
      if (pathParts.length >= 2) {
        const user = pathParts[0].toLowerCase();
        const repo = pathParts[1].toLowerCase();

        // Clean up repo name (remove any additional path segments, query params, etc.)
        const cleanRepo = repo.split("?")[0].split("#")[0];

        return `${user}__${cleanRepo}`;
      }

      return "";
    } catch (error) {
      return "";
    }
  };

  // Update tab data
  const updateTabData = (updates: Partial<TabData>) => {
    onTabDataChange({ ...tabData, ...updates });
  };

  // Auto-generate image name when GitHub URL changes
  useEffect(() => {
    const generatedImageName = generateImageNameFromGitHubUrl(
      tabData.githubRepoUrl
    );
    if (generatedImageName) {
      updateTabData({ imageName: generatedImageName });
    }
  }, [tabData.githubRepoUrl]);

  // Update image name validation when imageName changes
  useEffect(() => {
    updateTabData({
      isValidImageName: validateDockerImageName(tabData.imageName),
    });
  }, [tabData.imageName]);

  // Check if image exists when image name changes
  useEffect(() => {
    if (tabData.imageName && tabData.isValidImageName) {
      checkImageExists(tabData.imageName);
    } else {
      updateTabData({ isImageExists: false });
    }
  }, [tabData.imageName, tabData.isValidImageName]);

  // Generate Dockerfile from JSON spec using backend validation
  useEffect(() => {
    const generateDockerfile = async () => {
      // First, check JSON syntax
      const syntaxValid = validateJsonSyntax(tabData.jsonSpec);
      updateTabData({ isValidJson: syntaxValid });

      if (!syntaxValid) {
        updateTabData({
          validationError:
            "Invalid JSON syntax. Please fix the JSON before proceeding.",
          generatedDockerfile:
            "# Invalid JSON syntax\n# Please check your JSON format",
        });
        return;
      }

      // Check if we have the required inputs
      if (!tabData.githubRepoUrl.trim()) {
        updateTabData({
          validationError:
            "GitHub repository URL is required for Dockerfile generation.",
          generatedDockerfile:
            "# Missing GitHub repository URL\n# Please enter a GitHub repository URL",
        });
        return;
      }

      const commitToUse = tabData.useHeadCommit
        ? tabData.headCommit
        : tabData.baseCommit;
      if (!commitToUse.trim()) {
        updateTabData({
          validationError: `${
            tabData.useHeadCommit ? "Head" : "Base"
          } commit is required for Dockerfile generation.`,
          generatedDockerfile: `# Missing ${
            tabData.useHeadCommit ? "head" : "base"
          } commit\n# Please enter a ${
            tabData.useHeadCommit ? "head" : "base"
          } commit hash`,
        });
        return;
      }

      updateTabData({ validationError: null });

      try {
        // Call the backend validation and generation
        const result = await invoke<ValidationResult>("generate_docker_file", {
          inputJson: tabData.jsonSpec,
          githubRepoUrl: tabData.githubRepoUrl.trim(),
          commit: commitToUse.trim(),
        });

        if (result.success && result.dockerfile) {
          updateTabData({
            generatedDockerfile: result.dockerfile,
            validationError: null,
          });
        } else if (result.error) {
          updateTabData({
            validationError: result.error,
            generatedDockerfile:
              "# Validation failed\n# " + result.error.replace(/\n/g, "\n# "),
          });
        }
      } catch (error) {
        console.error("Failed to generate Dockerfile:", error);
        updateTabData({
          validationError:
            "Failed to communicate with backend: " + String(error),
          generatedDockerfile:
            "# Backend error\n# Failed to generate Dockerfile",
        });
      }
    };

    generateDockerfile();
  }, [
    tabData.jsonSpec,
    tabData.githubRepoUrl,
    tabData.baseCommit,
    tabData.headCommit,
    tabData.useHeadCommit,
  ]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (tabData.shouldAutoScroll && logsContainerRef.current) {
      logsContainerRef.current.scrollTop =
        logsContainerRef.current.scrollHeight;
    }
  }, [tabData.buildLogs, tabData.shouldAutoScroll]);

  // Auto-scroll to bottom when new test logs arrive
  useEffect(() => {
    if (tabData.shouldAutoScrollTest && testLogsContainerRef.current) {
      testLogsContainerRef.current.scrollTop =
        testLogsContainerRef.current.scrollHeight;
    }
  }, [tabData.testLogs, tabData.shouldAutoScrollTest]);

  // Scroll build logs section into view when build starts
  useEffect(() => {
    if (tabData.isBuilding && buildLogsSectionRef.current) {
      // Small delay to ensure the section is rendered
      setTimeout(() => {
        buildLogsSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 100);
    }
  }, [tabData.isBuilding]);

  // Scroll test logs section into view when test starts
  useEffect(() => {
    if (tabData.isTesting && testLogsSectionRef.current) {
      // Small delay to ensure the section is rendered
      setTimeout(() => {
        testLogsSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 100);
    }
  }, [tabData.isTesting]);

  // Handle scroll events to detect manual scrolling
  const handleScroll = () => {
    if (logsContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } =
        logsContainerRef.current;
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 5; // 5px threshold
      updateTabData({ shouldAutoScroll: isAtBottom });
    }
  };

  // Listen for build logs
  useEffect(() => {
    const unlisten = listen<string>("build_log", (event) => {
      updateTabData({ buildLogs: [...tabData.buildLogs, event.payload] });
    });

    const unlistenBuildComplete = listen<{ success: boolean; error?: string }>(
      "build_complete",
      (event) => {
        updateTabData({ isBuilding: false });
        if (!event.payload.success && event.payload.error) {
          updateTabData({
            buildLogs: [...tabData.buildLogs, `ERROR: ${event.payload.error}`],
          });
        } else if (event.payload.success) {
          // Recheck if the image exists after successful build to enable test button
          checkImageExists(tabData.imageName);
        }
      }
    );

    return () => {
      unlisten.then((f) => f());
      unlistenBuildComplete.then((f) => f());
    };
  }, [tabData.imageName]);

  // Listen for test logs
  useEffect(() => {
    const unlistenTestLog = listen<string>("test_log", (event) => {
      updateTabData({ testLogs: [...tabData.testLogs, event.payload] });
    });

    const unlistenTestComplete = listen<{ success: boolean; error?: string }>(
      "test_complete",
      (event) => {
        updateTabData({ isTesting: false });
        if (!event.payload.success && event.payload.error) {
          updateTabData({
            testLogs: [...tabData.testLogs, `ERROR: ${event.payload.error}`],
          });
        }
      }
    );

    return () => {
      unlistenTestLog.then((f) => f());
      unlistenTestComplete.then((f) => f());
    };
  }, []);

  const handleBuild = async () => {
    if (
      !tabData.isValidImageName ||
      tabData.isBuilding ||
      !tabData.isValidJson ||
      tabData.validationError !== null
    )
      return;

    updateTabData({
      isBuilding: true,
      buildLogs: [],
      testLogs: [],
      shouldAutoScroll: true,
    });

    const commitToUse = tabData.useHeadCommit
      ? tabData.headCommit
      : tabData.baseCommit;

    try {
      await invoke("build_docker_image", {
        dockerfileContent: tabData.generatedDockerfile,
        imageName: tabData.imageName.trim(),
        githubRepoUrl: tabData.githubRepoUrl.trim(),
        commit: commitToUse.trim(),
        dockerPath: dockerPath.trim(),
      });
    } catch (error) {
      updateTabData({ isBuilding: false });
      updateTabData({ buildLogs: [...tabData.buildLogs, `ERROR: ${error}`] });
      console.error("Build failed:", error);
    }
  };

  const handleStopBuild = async () => {
    try {
      await invoke("stop_docker_build");
      updateTabData({ isBuilding: false });
    } catch (error) {
      console.error("Failed to stop build:", error);
    }
  };

  const handleTest = async () => {
    if (!tabData.isImageExists || tabData.isTesting) return;

    // Extract test_cmd from the JSON spec
    let testCmd = "";
    try {
      const parsedSpec = JSON.parse(tabData.jsonSpec);
      testCmd = parsedSpec.test_cmd || "";
    } catch (error) {
      console.error("Failed to parse JSON spec:", error);
      return;
    }

    if (!testCmd.trim()) {
      console.error("No test command found in JSON spec");
      return;
    }

    updateTabData({
      isTesting: true,
      testLogs: [],
      shouldAutoScrollTest: true,
    });

    try {
      await invoke("run_docker_test", {
        imageName: tabData.imageName.trim(),
        testCmd: testCmd.trim(),
        testFilePaths: tabData.testFiles.trim(),
        dockerPath: dockerPath.trim(),
      });
    } catch (error) {
      updateTabData({ isTesting: false });
      updateTabData({ testLogs: [...tabData.testLogs, `ERROR: ${error}`] });
      console.error("Test failed:", error);
    }
  };

  const handleStopTest = async () => {
    try {
      await invoke("stop_docker_test");
      updateTabData({ isTesting: false });
    } catch (error) {
      console.error("Failed to stop test:", error);
    }
  };

  // Handle scroll events for test logs
  const handleTestScroll = () => {
    if (testLogsContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } =
        testLogsContainerRef.current;
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 5; // 5px threshold
      updateTabData({ shouldAutoScrollTest: isAtBottom });
    }
  };

  const checkImageExists = async (imageNameToCheck: string) => {
    if (
      !imageNameToCheck.trim() ||
      !validateDockerImageName(imageNameToCheck)
    ) {
      updateTabData({ isImageExists: false });
      return;
    }

    updateTabData({ isCheckingImage: true });
    try {
      const exists = await invoke<boolean>("check_docker_image_exists", {
        imageName: imageNameToCheck.trim(),
        dockerPath: dockerPath.trim(),
      });
      updateTabData({ isImageExists: exists });
    } catch (error) {
      console.error("Failed to check if image exists:", error);
      updateTabData({ isImageExists: false });
    } finally {
      updateTabData({ isCheckingImage: false });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-6xl mx-auto space-y-6 pb-16">
        {/* Docker Configuration Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Docker Configuration
            </h2>
            <button
              onClick={() =>
                updateTabData({
                  isDockerPathExpanded: !tabData.isDockerPathExpanded,
                })
              }
              className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors"
            >
              {tabData.isDockerPathExpanded ? "Hide" : "Show"} Advanced
            </button>
          </div>

          {tabData.isDockerPathExpanded && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 min-w-[140px]">
                  Docker Path
                </label>
                <input
                  type="text"
                  value={dockerPath}
                  onChange={(e) => setDockerPath(e.target.value)}
                  className="flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                  placeholder="Leave empty to use system PATH (e.g., /usr/local/bin/docker)"
                />
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                <p>• Leave empty to use Docker from system PATH</p>
                <p>
                  • Specify full path to Docker executable (e.g.,
                  /usr/local/bin/docker)
                </p>
                <p>• Useful when Docker is installed in a custom location</p>
                {dockerPath.trim() && (
                  <p className="mt-2 text-blue-600 dark:text-blue-400">
                    ✓ Using custom Docker path: {dockerPath.trim()}
                  </p>
                )}
                {!dockerPath.trim() && (
                  <p className="mt-2 text-green-600 dark:text-green-400">
                    ✓ Using Docker from system PATH
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <RepositoryForm
          githubRepoUrl={tabData.githubRepoUrl}
          setGithubRepoUrl={(url) => updateTabData({ githubRepoUrl: url })}
          baseCommit={tabData.baseCommit}
          setBaseCommit={(commit) => updateTabData({ baseCommit: commit })}
          headCommit={tabData.headCommit}
          setHeadCommit={(commit) => updateTabData({ headCommit: commit })}
          jsonSpec={tabData.jsonSpec}
          setJsonSpec={(spec) => updateTabData({ jsonSpec: spec })}
          isDockerfileExpanded={tabData.isDockerfileExpanded}
          setIsDockerfileExpanded={(expanded) =>
            updateTabData({ isDockerfileExpanded: expanded })
          }
          generatedDockerfile={tabData.generatedDockerfile}
          validationError={tabData.validationError}
          isValidJson={tabData.isValidJson}
          useHeadCommit={tabData.useHeadCommit}
          setUseHeadCommit={(useHead) =>
            updateTabData({ useHeadCommit: useHead })
          }
        />

        <BuildSection
          imageName={tabData.imageName}
          setImageName={(name) => updateTabData({ imageName: name })}
          isBuilding={tabData.isBuilding}
          buildLogs={tabData.buildLogs}
          shouldAutoScroll={tabData.shouldAutoScroll}
          setShouldAutoScroll={(scroll) =>
            updateTabData({ shouldAutoScroll: scroll })
          }
          handleBuild={handleBuild}
          handleStopBuild={handleStopBuild}
          isValidImageName={tabData.isValidImageName}
          generatedDockerfile={tabData.generatedDockerfile}
          isValidJson={tabData.isValidJson}
          validationError={tabData.validationError}
          logsContainerRef={logsContainerRef}
          buildLogsSectionRef={buildLogsSectionRef}
          handleScroll={handleScroll}
        />

        <TestSection
          testFiles={tabData.testFiles}
          setTestFiles={(files) => updateTabData({ testFiles: files })}
          isTesting={tabData.isTesting}
          testLogs={tabData.testLogs}
          shouldAutoScrollTest={tabData.shouldAutoScrollTest}
          setShouldAutoScrollTest={(scroll) =>
            updateTabData({ shouldAutoScrollTest: scroll })
          }
          handleTest={handleTest}
          handleStopTest={handleStopTest}
          isImageExists={tabData.isImageExists}
          isCheckingImage={tabData.isCheckingImage}
          testLogsContainerRef={testLogsContainerRef}
          testLogsSectionRef={testLogsSectionRef}
          handleTestScroll={handleTestScroll}
        />
      </div>
    </div>
  );
}

// Main App component with tab management
function App() {
  const [tabs, setTabs] = useState<TabData[]>([
    {
      id: "1",
      title: "Untitled",
      githubRepoUrl: "",
      baseCommit: "",
      headCommit: "",
      jsonSpec: `{
  "test_cmd": "npm test",
  "log_parser_name": "jest"
}`,
      imageName: "",
      testFiles: "",
      isDockerfileExpanded: false,
      generatedDockerfile: "",
      validationError: null,
      isValidJson: true,
      useHeadCommit: false,
      isBuilding: false,
      buildLogs: [],
      isValidImageName: false,
      shouldAutoScroll: true,
      isImageExists: false,
      isCheckingImage: false,
      isTesting: false,
      testLogs: [],
      shouldAutoScrollTest: true,
      dockerPath: "",
      isDockerPathExpanded: false,
    },
  ]);
  const [activeTabId, setActiveTabId] = useState("1");
  const [dockerPath, setDockerPath] = useState("");

  // Load Docker path configuration on app start
  useEffect(() => {
    const loadDockerPath = async () => {
      try {
        const savedPath = await invoke<string>("load_docker_path");
        setDockerPath(savedPath);
      } catch (error) {
        console.error("Failed to load Docker path:", error);
      }
    };

    loadDockerPath();
  }, []);

  // Save Docker path when it changes
  useEffect(() => {
    const saveDockerPath = async () => {
      try {
        // Only save if dockerPath is not undefined (avoid saving on initial load)
        if (dockerPath !== undefined) {
          await invoke("save_docker_path", { dockerPath: dockerPath.trim() });
        }
      } catch (error) {
        console.error("Failed to save Docker path:", error);
      }
    };

    saveDockerPath();
  }, [dockerPath]);

  // Update tab data
  const updateTabData = (tabId: string, updates: Partial<TabData>) => {
    setTabs((prevTabs) =>
      prevTabs.map((tab) => (tab.id === tabId ? { ...tab, ...updates } : tab))
    );
  };

  // Add new tab
  const addTab = () => {
    const newTabId = Date.now().toString();
    const newTab: TabData = {
      id: newTabId,
      title: "Untitled",
      githubRepoUrl: "",
      baseCommit: "",
      headCommit: "",
      jsonSpec: `{
  "test_cmd": "npm test",
  "log_parser_name": "jest"
}`,
      imageName: "",
      testFiles: "",
      isDockerfileExpanded: false,
      generatedDockerfile: "",
      validationError: null,
      isValidJson: true,
      useHeadCommit: false,
      isBuilding: false,
      buildLogs: [],
      isValidImageName: false,
      shouldAutoScroll: true,
      isImageExists: false,
      isCheckingImage: false,
      isTesting: false,
      testLogs: [],
      shouldAutoScrollTest: true,
      dockerPath: "",
      isDockerPathExpanded: false,
    };
    setTabs((prevTabs) => [...prevTabs, newTab]);
    setActiveTabId(newTabId);
  };

  // Close tab
  const closeTab = (tabId: string) => {
    if (tabs.length <= 1) return; // Don't close the last tab

    setTabs((prevTabs) => prevTabs.filter((tab) => tab.id !== tabId));

    // If we're closing the active tab, switch to the previous tab
    if (activeTabId === tabId) {
      const currentIndex = tabs.findIndex((tab) => tab.id === tabId);
      const newActiveTab = tabs[currentIndex - 1] || tabs[currentIndex + 1];
      if (newActiveTab) {
        setActiveTabId(newActiveTab.id);
      }
    }
  };

  // Update tab title based on image name
  const updateTabTitle = (
    tabId: string,
    imageName: string,
    githubRepoUrl: string
  ) => {
    let title = "Untitled";
    if (imageName.trim()) {
      title = imageName;
    } else if (githubRepoUrl.trim()) {
      // Extract repo name from URL for title
      try {
        const url = new URL(githubRepoUrl);
        const pathParts = url.pathname.split("/");
        if (pathParts.length >= 3) {
          title = pathParts[2]; // repo name
        }
      } catch {
        title = "Untitled";
      }
    }

    updateTabData(tabId, { title });
  };

  // Update tab title when image name or repo URL changes
  useEffect(() => {
    tabs.forEach((tab) => {
      updateTabTitle(tab.id, tab.imageName, tab.githubRepoUrl);
    });
  }, [tabs.map((tab) => `${tab.imageName}-${tab.githubRepoUrl}`).join(",")]);

  const activeTab = tabs.find((tab) => tab.id === activeTabId);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Tab Bar */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between px-6 py-2">
          <div className="flex items-center space-x-0 overflow-x-auto">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={`flex items-center space-x-2 px-6 py-2 cursor-pointer transition-colors border-b-2 border-transparent select-none
                  ${
                    activeTabId === tab.id
                      ? "bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white border-b-blue-500 dark:border-b-blue-400 font-semibold"
                      : "bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-400 dark:hover:bg-gray-500"
                  }
                  rounded-none m-0`}
                style={{ borderRadius: 0, margin: 0 }}
                onClick={() => setActiveTabId(tab.id)}
              >
                <span className="text-sm font-medium truncate max-w-32">
                  {tab.title}
                </span>
                {tabs.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(tab.id);
                    }}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                )}
              </div>
            ))}
            {/* + Button as a tab */}
            <div
              className="flex items-center px-6 py-2 cursor-pointer transition-colors bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-400 dark:hover:bg-gray-500 rounded-none m-0 border-b-2 border-transparent"
              style={{ borderRadius: 0, margin: 0 }}
              onClick={addTab}
              title="New Tab"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab && (
        <SWEBenchTab
          tabData={activeTab}
          onTabDataChange={(data) => updateTabData(activeTabId, data)}
          dockerPath={dockerPath}
          setDockerPath={setDockerPath}
        />
      )}
    </div>
  );
}

export default App;
