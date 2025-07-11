import { useEffect, useRef, useReducer } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import RepositoryForm from "./RepositoryForm";
import BuildSection from "./BuildSection";
import TestSection from "./TestSection";
import "../App.css";

interface ValidationResult {
  success: boolean;
  error?: string;
  dockerfile?: string;
}

interface TabState {
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

type TabAction =
  | { type: "SET_TITLE"; payload: string }
  | { type: "SET_GITHUB_REPO_URL"; payload: string }
  | { type: "SET_BASE_COMMIT"; payload: string }
  | { type: "SET_HEAD_COMMIT"; payload: string }
  | { type: "SET_JSON_SPEC"; payload: string }
  | { type: "SET_IMAGE_NAME"; payload: string }
  | { type: "SET_TEST_FILES"; payload: string }
  | { type: "SET_DOCKERFILE_EXPANDED"; payload: boolean }
  | { type: "SET_GENERATED_DOCKERFILE"; payload: string }
  | { type: "SET_VALIDATION_ERROR"; payload: string | null }
  | { type: "SET_IS_VALID_JSON"; payload: boolean }
  | { type: "SET_USE_HEAD_COMMIT"; payload: boolean }
  | { type: "SET_IS_BUILDING"; payload: boolean }
  | { type: "ADD_BUILD_LOG"; payload: string }
  | { type: "CLEAR_BUILD_LOGS"; payload?: void }
  | { type: "SET_IS_VALID_IMAGE_NAME"; payload: boolean }
  | { type: "SET_SHOULD_AUTO_SCROLL"; payload: boolean }
  | { type: "SET_IS_IMAGE_EXISTS"; payload: boolean }
  | { type: "SET_IS_CHECKING_IMAGE"; payload: boolean }
  | { type: "SET_IS_TESTING"; payload: boolean }
  | { type: "ADD_TEST_LOG"; payload: string }
  | { type: "CLEAR_TEST_LOGS"; payload?: void }
  | { type: "SET_SHOULD_AUTO_SCROLL_TEST"; payload: boolean }
  | { type: "SET_DOCKER_PATH"; payload: string }
  | { type: "SET_DOCKER_PATH_EXPANDED"; payload: boolean }
  | { type: "UPDATE_MULTIPLE"; payload: Partial<TabState> };

const defaultTabState: TabState = {
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

function tabReducer(state: TabState, action: TabAction): TabState {
  switch (action.type) {
    case "SET_TITLE":
      return { ...state, title: action.payload };
    case "SET_GITHUB_REPO_URL":
      return { ...state, githubRepoUrl: action.payload };
    case "SET_BASE_COMMIT":
      return { ...state, baseCommit: action.payload };
    case "SET_HEAD_COMMIT":
      return { ...state, headCommit: action.payload };
    case "SET_JSON_SPEC":
      return { ...state, jsonSpec: action.payload };
    case "SET_IMAGE_NAME":
      return { ...state, imageName: action.payload };
    case "SET_TEST_FILES":
      return { ...state, testFiles: action.payload };
    case "SET_DOCKERFILE_EXPANDED":
      return { ...state, isDockerfileExpanded: action.payload };
    case "SET_GENERATED_DOCKERFILE":
      return { ...state, generatedDockerfile: action.payload };
    case "SET_VALIDATION_ERROR":
      return { ...state, validationError: action.payload };
    case "SET_IS_VALID_JSON":
      return { ...state, isValidJson: action.payload };
    case "SET_USE_HEAD_COMMIT":
      return { ...state, useHeadCommit: action.payload };
    case "SET_IS_BUILDING":
      return { ...state, isBuilding: action.payload };
    case "ADD_BUILD_LOG":
      return { ...state, buildLogs: [...state.buildLogs, action.payload] };
    case "CLEAR_BUILD_LOGS":
      return { ...state, buildLogs: [] };
    case "SET_IS_VALID_IMAGE_NAME":
      return { ...state, isValidImageName: action.payload };
    case "SET_SHOULD_AUTO_SCROLL":
      return { ...state, shouldAutoScroll: action.payload };
    case "SET_IS_IMAGE_EXISTS":
      return { ...state, isImageExists: action.payload };
    case "SET_IS_CHECKING_IMAGE":
      return { ...state, isCheckingImage: action.payload };
    case "SET_IS_TESTING":
      return { ...state, isTesting: action.payload };
    case "ADD_TEST_LOG":
      return { ...state, testLogs: [...state.testLogs, action.payload] };
    case "CLEAR_TEST_LOGS":
      return { ...state, testLogs: [] };
    case "SET_SHOULD_AUTO_SCROLL_TEST":
      return { ...state, shouldAutoScrollTest: action.payload };
    case "SET_DOCKER_PATH":
      return { ...state, dockerPath: action.payload };
    case "SET_DOCKER_PATH_EXPANDED":
      return { ...state, isDockerPathExpanded: action.payload };
    case "UPDATE_MULTIPLE":
      return { ...state, ...action.payload };
    default:
      return state;
  }
}

// SWEBenchTab component - represents a single tab
export function SWEBenchTab({
  onTabNameChange,
  dockerPath,
  visible,
  language,
  setLanguage,
}: {
  onTabNameChange: (name: string) => void;
  dockerPath: string;
  setDockerPath: (path: string) => void;
  visible: boolean;
  language: string;
  setLanguage: (lang: string) => void;
}) {
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const testLogsContainerRef = useRef<HTMLDivElement>(null);
  const buildLogsSectionRef = useRef<HTMLDivElement>(null);
  const testLogsSectionRef = useRef<HTMLDivElement>(null);

  const [state, dispatch] = useReducer(tabReducer, defaultTabState);

  const logError = (...args: any[]) => {
    if (visible) {
      console.error(...args);
    }
  };

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
      } else if (
        cleanUrl.startsWith("https://github.dev/") ||
        cleanUrl.startsWith("http://github.dev/")
      ) {
        repoPath = cleanUrl.replace(/^https?:\/\/github\.dev\//, "");
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

  useEffect(() => {
    console.log("state.imageName", state.imageName);
    onTabNameChange(state.imageName || "Untitled");
  }, [state.imageName]);

  // Auto-generate image name when GitHub URL changes
  useEffect(() => {
    const generatedImageName = generateImageNameFromGitHubUrl(
      state.githubRepoUrl
    );
    if (generatedImageName) {
      dispatch({ type: "SET_IMAGE_NAME", payload: generatedImageName });
    }
  }, [state.githubRepoUrl]);

  // Update image name validation when imageName changes
  useEffect(() => {
    dispatch({
      type: "SET_IS_VALID_IMAGE_NAME",
      payload: validateDockerImageName(state.imageName),
    });
  }, [state.imageName]);

  // Check if image exists when image name changes
  useEffect(() => {
    if (state.imageName && state.isValidImageName) {
      checkImageExists(state.imageName);
    } else {
      dispatch({ type: "SET_IS_IMAGE_EXISTS", payload: false });
    }
  }, [state.imageName, state.isValidImageName]);

  // Generate Dockerfile from JSON spec using backend validation
  useEffect(() => {
    const generateDockerfile = async () => {
      // First, check JSON syntax
      const syntaxValid = validateJsonSyntax(state.jsonSpec);
      dispatch({ type: "SET_IS_VALID_JSON", payload: syntaxValid });

      if (!syntaxValid) {
        dispatch({
          type: "UPDATE_MULTIPLE",
          payload: {
            validationError:
              "Invalid JSON syntax. Please fix the JSON before proceeding.",
            generatedDockerfile:
              "# Invalid JSON syntax\n# Please check your JSON format",
          },
        });
        return;
      }

      // Check if we have the required inputs
      if (!state.githubRepoUrl.trim()) {
        dispatch({
          type: "UPDATE_MULTIPLE",
          payload: {
            validationError:
              "GitHub repository URL is required for Dockerfile generation.",
            generatedDockerfile:
              "# Missing GitHub repository URL\n# Please enter a GitHub repository URL",
          },
        });
        return;
      }

      const commitToUse = state.useHeadCommit
        ? state.headCommit
        : state.baseCommit;
      if (!commitToUse.trim()) {
        dispatch({
          type: "UPDATE_MULTIPLE",
          payload: {
            validationError: `${
              state.useHeadCommit ? "Head" : "Base"
            } commit is required for Dockerfile generation.`,
            generatedDockerfile: `# Missing ${
              state.useHeadCommit ? "head" : "base"
            } commit\n# Please enter a ${
              state.useHeadCommit ? "head" : "base"
            } commit hash`,
          },
        });
        return;
      }

      dispatch({ type: "SET_VALIDATION_ERROR", payload: null });

      try {
        // Call the backend validation and generation
        const result = await invoke<ValidationResult>("generate_docker_file", {
          inputJson: state.jsonSpec,
          githubRepoUrl: state.githubRepoUrl.trim(),
          commit: commitToUse.trim(),
        });

        if (result.success && result.dockerfile) {
          dispatch({
            type: "UPDATE_MULTIPLE",
            payload: {
              generatedDockerfile: result.dockerfile,
              validationError: null,
            },
          });
        } else if (result.error) {
          dispatch({
            type: "UPDATE_MULTIPLE",
            payload: {
              validationError: result.error,
              generatedDockerfile:
                "# Validation failed\n# " + result.error.replace(/\n/g, "\n# "),
            },
          });
        }
      } catch (error) {
        logError("Failed to generate Dockerfile:", error);
        dispatch({
          type: "UPDATE_MULTIPLE",
          payload: {
            validationError:
              "Failed to communicate with backend: " + String(error),
            generatedDockerfile:
              "# Backend error\n# Failed to generate Dockerfile",
          },
        });
      }
    };

    generateDockerfile();
  }, [
    state.jsonSpec,
    state.githubRepoUrl,
    state.baseCommit,
    state.headCommit,
    state.useHeadCommit,
  ]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (state.shouldAutoScroll && logsContainerRef.current) {
      logsContainerRef.current.scrollTop =
        logsContainerRef.current.scrollHeight;
    }
  }, [state.buildLogs, state.shouldAutoScroll]);

  // Auto-scroll to bottom when new test logs arrive
  useEffect(() => {
    if (state.shouldAutoScrollTest && testLogsContainerRef.current) {
      testLogsContainerRef.current.scrollTop =
        testLogsContainerRef.current.scrollHeight;
    }
  }, [state.testLogs, state.shouldAutoScrollTest]);

  // Scroll build logs section into view when build starts
  useEffect(() => {
    if (state.isBuilding && buildLogsSectionRef.current) {
      // Small delay to ensure the section is rendered
      setTimeout(() => {
        buildLogsSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 100);
    }
  }, [state.isBuilding]);

  // Scroll test logs section into view when test starts
  useEffect(() => {
    if (state.isTesting && testLogsSectionRef.current) {
      // Small delay to ensure the section is rendered
      setTimeout(() => {
        testLogsSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 100);
    }
  }, [state.isTesting]);

  // Handle scroll events to detect manual scrolling
  const handleScroll = () => {
    if (logsContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } =
        logsContainerRef.current;
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 5; // 5px threshold
      dispatch({ type: "SET_SHOULD_AUTO_SCROLL", payload: isAtBottom });
    }
  };

  // Listen for build logs
  useEffect(() => {
    const unlisten = listen<string>("build_log", (event) => {
      dispatch({ type: "ADD_BUILD_LOG", payload: event.payload });
    });

    const unlistenBuildComplete = listen<{ success: boolean; error?: string }>(
      "build_complete",
      (event) => {
        dispatch({ type: "SET_IS_BUILDING", payload: false });
        if (!event.payload.success && event.payload.error) {
          dispatch({
            type: "ADD_BUILD_LOG",
            payload: `ERROR: ${event.payload.error}`,
          });
        } else if (event.payload.success) {
          // Recheck if the image exists after successful build to enable test button
          checkImageExists(state.imageName);
        }
      }
    );

    return () => {
      unlisten.then((f) => f());
      unlistenBuildComplete.then((f) => f());
    };
  }, [state.imageName]);

  // Listen for test logs
  useEffect(() => {
    const unlistenTestLog = listen<string>("test_log", (event) => {
      dispatch({ type: "ADD_TEST_LOG", payload: event.payload });
    });

    const unlistenTestComplete = listen<{ success: boolean; error?: string }>(
      "test_complete",
      (event) => {
        dispatch({ type: "SET_IS_TESTING", payload: false });
        if (!event.payload.success && event.payload.error) {
          dispatch({
            type: "ADD_TEST_LOG",
            payload: `ERROR: ${event.payload.error}`,
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
      !state.isValidImageName ||
      state.isBuilding ||
      !state.isValidJson ||
      state.validationError !== null
    )
      return;

    dispatch({
      type: "UPDATE_MULTIPLE",
      payload: {
        isBuilding: true,
        shouldAutoScroll: true,
      },
    });
    dispatch({ type: "CLEAR_BUILD_LOGS" });
    dispatch({ type: "CLEAR_TEST_LOGS" });

    const commitToUse = state.useHeadCommit
      ? state.headCommit
      : state.baseCommit;

    try {
      await invoke("build_docker_image", {
        dockerfileContent: state.generatedDockerfile,
        imageName: state.imageName.trim(),
        githubRepoUrl: state.githubRepoUrl.trim(),
        commit: commitToUse.trim(),
        dockerPath: dockerPath.trim(),
      });
    } catch (error) {
      dispatch({ type: "SET_IS_BUILDING", payload: false });
      dispatch({ type: "ADD_BUILD_LOG", payload: `ERROR: ${error}` });
      logError("Build failed:", error);
    }
  };

  const handleStopBuild = async () => {
    try {
      await invoke("stop_docker_build");
      dispatch({ type: "SET_IS_BUILDING", payload: false });
    } catch (error) {
      logError("Failed to stop build:", error);
    }
  };

  const handleTest = async () => {
    if (!state.isImageExists || state.isTesting) return;

    // Extract test_cmd from the JSON spec
    let testCmd = "";
    try {
      const parsedSpec = JSON.parse(state.jsonSpec);
      testCmd = parsedSpec.test_cmd || "";
    } catch (error) {
      logError("Failed to parse JSON spec:", error);
      return;
    }

    if (!testCmd.trim()) {
      logError("No test command found in JSON spec");
      return;
    }

    dispatch({
      type: "UPDATE_MULTIPLE",
      payload: {
        isTesting: true,
        shouldAutoScrollTest: true,
      },
    });
    dispatch({ type: "CLEAR_TEST_LOGS" });

    try {
      await invoke("run_docker_test", {
        imageName: state.imageName.trim(),
        testCmd: testCmd.trim(),
        testFilePaths: state.testFiles.trim(),
        dockerPath: dockerPath.trim(),
      });
    } catch (error) {
      dispatch({ type: "SET_IS_TESTING", payload: false });
      dispatch({ type: "ADD_TEST_LOG", payload: `ERROR: ${error}` });
      logError("Test failed:", error);
    }
  };

  const handleStopTest = async () => {
    try {
      await invoke("stop_docker_test");
      dispatch({ type: "SET_IS_TESTING", payload: false });
    } catch (error) {
      logError("Failed to stop test:", error);
    }
  };

  // Handle scroll events for test logs
  const handleTestScroll = () => {
    if (testLogsContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } =
        testLogsContainerRef.current;
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 5; // 5px threshold
      dispatch({ type: "SET_SHOULD_AUTO_SCROLL_TEST", payload: isAtBottom });
    }
  };

  const checkImageExists = async (imageNameToCheck: string) => {
    if (
      !imageNameToCheck.trim() ||
      !validateDockerImageName(imageNameToCheck)
    ) {
      dispatch({ type: "SET_IS_IMAGE_EXISTS", payload: false });
      return;
    }

    dispatch({ type: "SET_IS_CHECKING_IMAGE", payload: true });
    try {
      const exists = await invoke<boolean>("check_docker_image_exists", {
        imageName: imageNameToCheck.trim(),
        dockerPath: dockerPath.trim(),
      });
      dispatch({ type: "SET_IS_IMAGE_EXISTS", payload: exists });
    } catch (error) {
      logError("Failed to check if image exists:", error);
      dispatch({ type: "SET_IS_IMAGE_EXISTS", payload: false });
    } finally {
      dispatch({ type: "SET_IS_CHECKING_IMAGE", payload: false });
    }
  };

  if (!visible) return null;

  return (
    <div
      className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6"
      // hidden={!visible}
    >
      <div className="max-w-6xl mx-auto space-y-6 pb-16">
        <RepositoryForm
          githubRepoUrl={state.githubRepoUrl}
          setGithubRepoUrl={(url) =>
            dispatch({ type: "SET_GITHUB_REPO_URL", payload: url })
          }
          baseCommit={state.baseCommit}
          setBaseCommit={(commit) =>
            dispatch({ type: "SET_BASE_COMMIT", payload: commit })
          }
          headCommit={state.headCommit}
          setHeadCommit={(commit) =>
            dispatch({ type: "SET_HEAD_COMMIT", payload: commit })
          }
          jsonSpec={state.jsonSpec}
          setJsonSpec={(spec) =>
            dispatch({ type: "SET_JSON_SPEC", payload: spec })
          }
          isDockerfileExpanded={state.isDockerfileExpanded}
          setIsDockerfileExpanded={(expanded) =>
            dispatch({ type: "SET_DOCKERFILE_EXPANDED", payload: expanded })
          }
          generatedDockerfile={state.generatedDockerfile}
          validationError={state.validationError}
          isValidJson={state.isValidJson}
          useHeadCommit={state.useHeadCommit}
          setUseHeadCommit={(useHead) =>
            dispatch({ type: "SET_USE_HEAD_COMMIT", payload: useHead })
          }
          language={language}
          setLanguage={setLanguage}
        />

        <BuildSection
          imageName={state.imageName}
          setImageName={(name) =>
            dispatch({ type: "SET_IMAGE_NAME", payload: name })
          }
          isBuilding={state.isBuilding}
          buildLogs={state.buildLogs}
          shouldAutoScroll={state.shouldAutoScroll}
          setShouldAutoScroll={(scroll) =>
            dispatch({ type: "SET_SHOULD_AUTO_SCROLL", payload: scroll })
          }
          handleBuild={handleBuild}
          handleStopBuild={handleStopBuild}
          isValidImageName={state.isValidImageName}
          generatedDockerfile={state.generatedDockerfile}
          isValidJson={state.isValidJson}
          validationError={state.validationError}
          logsContainerRef={logsContainerRef}
          buildLogsSectionRef={buildLogsSectionRef}
          handleScroll={handleScroll}
        />

        <TestSection
          testFiles={state.testFiles}
          setTestFiles={(files) =>
            dispatch({ type: "SET_TEST_FILES", payload: files })
          }
          isTesting={state.isTesting}
          testLogs={state.testLogs}
          shouldAutoScrollTest={state.shouldAutoScrollTest}
          setShouldAutoScrollTest={(scroll) =>
            dispatch({ type: "SET_SHOULD_AUTO_SCROLL_TEST", payload: scroll })
          }
          handleTest={handleTest}
          handleStopTest={handleStopTest}
          isImageExists={state.isImageExists}
          isCheckingImage={state.isCheckingImage}
          testLogsContainerRef={testLogsContainerRef}
          testLogsSectionRef={testLogsSectionRef}
          handleTestScroll={handleTestScroll}
        />
      </div>
    </div>
  );
}
