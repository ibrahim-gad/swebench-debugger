import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
import { SWEBenchTab } from "./components/Tab";

interface TabsState {
  id: string;
  title: string;
}

// Main App component with tab management
function App() {
  const [tabs, setTabs] = useState<TabsState[]>([
    {
      id: "1",
      title: "Untitled",
    },
  ]);
  const [activeTabId, setActiveTabId] = useState("1");
  const [dockerPath, setDockerPath] = useState("");
  const [isDockerPathExpanded, setIsDockerPathExpanded] = useState(false);

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
  const updateTabData = (tabId: string, updates: Partial<TabsState>) => {
    setTabs((prevTabs) =>
      prevTabs.map((tab) => (tab.id === tabId ? { ...tab, ...updates } : tab))
    );
  };

  // Add new tab
  const addTab = () => {
    const newTabId = Date.now().toString();
    const newTab: TabsState = {
      id: newTabId,
      title: "Untitled",
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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Tab Bar */}
      <div className="border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="flex items-center justify-between">
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
                <span className="text-sm font-medium truncate max-w-64">
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

      {/* Docker Configuration Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 m-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Docker Configuration
          </h2>
          <button
            onClick={() => setIsDockerPathExpanded(!isDockerPathExpanded)}
            className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors"
          >
            {isDockerPathExpanded ? "Hide" : "Show"} Advanced
          </button>
        </div>

        {isDockerPathExpanded && (
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

      {/* Tab Content */}
      {tabs.map((tab) => (
        <SWEBenchTab
          key={tab.id}
          visible={activeTabId === tab.id}
          onTabNameChange={(name) =>
            updateTabData(activeTabId, { title: name })
          }
          dockerPath={dockerPath}
          setDockerPath={setDockerPath}
        />
      ))}
    </div>
  );
}

export default App;
