import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
import { SWEBenchTab } from "./components/Tab";
import { FiSettings, FiSun, FiMoon } from "react-icons/fi";

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
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const settingsDrawerRef = useRef<HTMLDivElement>(null);
  const tabBarRef = useRef<HTMLDivElement>(null);
  const [defaultLanguage, setDefaultLanguage] = useState<string>("Javascript");
  const [tabLanguages, setTabLanguages] = useState<{ [tabId: string]: string }>({ "1": "Javascript" });
  const [dockerPathLoaded, setDockerPathLoaded] = useState(false);
  const [defaultLanguageLoaded, setDefaultLanguageLoaded] = useState(false);
  const [themeLoaded, setThemeLoaded] = useState(false);
  const [scrollPositions, setScrollPositions] = useState<{ [tabId: string]: number }>({});
  const scrollableRefs = useRef<{ [tabId: string]: HTMLDivElement | null }>({});

  function getSystemTheme() {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  }

  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>("system");

  // Load all config values on mount
  useEffect(() => {
    const loadAllConfig = async () => {
      try {
        const savedDockerPath = await invoke<string>("load_config", { key: "docker_path" });
        setDockerPath(savedDockerPath);
        setDockerPathLoaded(true);
      } catch (error) {
        console.error("Failed to load Docker path:", error);
        setDockerPathLoaded(true);
      }
      try {
        const savedLanguage = await invoke<string>("load_config", { key: "default_language" });
        setDefaultLanguage(savedLanguage || "Javascript");
        setTabLanguages({ "1": savedLanguage || "Javascript" });
        setDefaultLanguageLoaded(true);
      } catch (error) {
        console.error("Failed to load default language:", error);
        setDefaultLanguageLoaded(true);
      }
      try {
        const savedTheme = await invoke<string>("load_config", { key: "theme" });
        if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system') {
          setTheme(savedTheme);
          let applied = savedTheme;
          if (savedTheme === 'system') {
            applied = getSystemTheme();
          }
          if (applied === 'dark') {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
        } else {
          // Default to system theme
          setTheme('system');
          const systemTheme = getSystemTheme();
          if (systemTheme === 'dark') {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
        }
        setThemeLoaded(true);
      } catch (error) {
        console.error("Failed to load theme:", error);
        setThemeLoaded(true);
      }
    };
    loadAllConfig();
    // eslint-disable-next-line
  }, []);

  // Save Docker path when it changes, but only after loaded
  useEffect(() => {
    if (!dockerPathLoaded) return;
    const saveDockerPath = async () => {
      try {
        if (dockerPath !== undefined) {
          await invoke("save_config", { key: "docker_path", value: dockerPath.trim() });
        }
      } catch (error) {
        console.error("Failed to save Docker path:", error);
      }
    };
    saveDockerPath();
  }, [dockerPath, dockerPathLoaded]);

  // Save default language when it changes, but only after loaded
  useEffect(() => {
    if (!defaultLanguageLoaded) return;
    const saveDefaultLanguage = async () => {
      try {
        if (defaultLanguage !== undefined) {
          await invoke("save_config", { key: "default_language", value: defaultLanguage });
        }
      } catch (error) {
        console.error("Failed to save default language:", error);
      }
    };
    saveDefaultLanguage();
  }, [defaultLanguage, defaultLanguageLoaded]);

  // Save theme when it changes, but only after loaded
  useEffect(() => {
    if (!themeLoaded) return;
    let applied = theme;
    if (theme === 'system') {
      applied = getSystemTheme();
    }
    if (applied === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (theme === 'system') {
        const newSystemTheme = getSystemTheme();
        if (newSystemTheme === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      }
    };
    mediaQuery.addEventListener('change', handleChange);
    // Save theme to backend
    const saveTheme = async () => {
      try {
        await invoke("save_config", { key: "theme", value: theme });
      } catch (error) {
        console.error("Failed to save theme:", error);
      }
    };
    saveTheme();
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme, themeLoaded]);

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
    setTabLanguages((prev) => ({ ...prev, [newTabId]: defaultLanguage }));
  };

  // Close tab
  const closeTab = (tabId: string) => {
    if (tabs.length <= 1) return; // Don't close the last tab

    setTabs((prevTabs) => prevTabs.filter((tab) => tab.id !== tabId));
    setTabLanguages((prev) => {
      const newLangs = { ...prev };
      delete newLangs[tabId];
      return newLangs;
    });

    // If we're closing the active tab, switch to the previous tab
    if (activeTabId === tabId) {
      const currentIndex = tabs.findIndex((tab) => tab.id === tabId);
      const newActiveTab = tabs[currentIndex - 1] || tabs[currentIndex + 1];
      if (newActiveTab) {
        setActiveTabId(newActiveTab.id);
      }
    }
  };

  // Handle mouse wheel to scroll tab bar horizontally
  const handleTabBarWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (tabBarRef.current) {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        tabBarRef.current.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    }
  };

  // Handler to update scroll position for a tab
  const handleUpdateScrollPosition = useCallback((tabId: string, pos: number) => {
    setScrollPositions((prev) => ({ ...prev, [tabId]: pos }));
  }, []);

  // Handler to get scroll position for a tab
  const getScrollPosition = useCallback((tabId: string) => {
    return scrollPositions[tabId] || 0;
  }, [scrollPositions]);

  // Save scroll position before switching tabs
  const handleTabClick = (tabId: string) => {
    if (tabId !== activeTabId) {
      const currentRef = scrollableRefs.current[activeTabId];
      if (currentRef) {
        handleUpdateScrollPosition(activeTabId, currentRef.scrollTop);
      }
      setActiveTabId(tabId);
    }
  };

  // Pass a ref to each tab's scrollable container
  const getOrCreateScrollableRef = (tabId: string) => {
    if (!scrollableRefs.current[tabId]) {
      scrollableRefs.current[tabId] = null;
    }
    return (el: HTMLDivElement | null) => {
      scrollableRefs.current[tabId] = el;
    };
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* App Bar/Header */}
      <div className="sticky top-0 z-20 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 shadow-sm flex items-center h-14 px-4 gap-2 shrink-0">
        {/* App Name/Logo */}
        <div className="flex items-center font-bold text-lg text-blue-700 dark:text-blue-300 mr-6 select-none whitespace-nowrap">
          <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" strokeWidth="2" /><path d="M8 12l2 2 4-4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Swebench Debugger
        </div>
        {/* Tabs (center, scrollable) */}
        <div className="flex-1 flex justify-center min-w-0 items-start">
          {/* Scrollable tabs */}
          <div
            className="flex items-start space-x-0 overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-700 px-2 min-w-0 max-w-full pb-3"
            ref={tabBarRef}
            onWheel={handleTabBarWheel}
            style={{ maxWidth: '100%' }}
          >
            {tabs.map((tab, idx) => (
              <div
                key={tab.id}
                className={`flex items-center space-x-2 px-5 py-1.5${idx !== 0 ? ' ml-1' : ''} cursor-pointer transition-colors border-b-2 border-transparent select-none rounded-lg whitespace-nowrap`
                  + (activeTabId === tab.id
                      ? " bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 border-b-blue-500 dark:border-b-blue-400 font-semibold shadow"
                      : " bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600")
                }
                onClick={() => handleTabClick(tab.id)}
                style={{ minWidth: 100, maxWidth: 200 }}
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
          </div>
          {/* + Button always visible at the end */}
          <div
            className="flex items-center justify-center px-5 py-1.5 ml-1 cursor-pointer transition-colors bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg border-b-2 border-transparent whitespace-nowrap"
            onClick={addTab}
            title="New Tab"
            style={{ minWidth: 40 }}
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
        {/* Theme Toggle Button */}
        <div className="flex items-center gap-1 ml-6">
          <button
            className="p-2 text-gray-600 dark:text-gray-300 hover:text-yellow-500 dark:hover:text-yellow-300 focus:outline-none"
            title={theme === 'dark' || (theme === 'system' && getSystemTheme() === 'dark') ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={() => {
              const currentlyDark = theme === 'dark' || (theme === 'system' && getSystemTheme() === 'dark');
              setTheme(currentlyDark ? 'light' : 'dark');
            }}
          >
            {theme === 'dark' || (theme === 'system' && getSystemTheme() === 'dark') ? <FiSun size={22} /> : <FiMoon size={22} />}
          </button>
          <button
            className="p-2 text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 focus:outline-none"
            title="App Settings"
            onClick={() => setIsSettingsOpen(true)}
          >
            <FiSettings size={22} />
          </button>
        </div>
      </div>

      {/* Settings Drawer */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-40 flex justify-end">
          {/* Overlay */}
          <div
            className="fixed inset-0 bg-black bg-opacity-30 transition-opacity"
            onClick={() => setIsSettingsOpen(false)}
          />
          {/* Drawer */}
          <div
            ref={settingsDrawerRef}
            className="relative w-full max-w-sm h-full bg-white dark:bg-gray-900 shadow-xl border-l border-gray-200 dark:border-gray-700 p-6 flex flex-col"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">App Settings</h2>
              <button
                className="p-1 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
                onClick={() => setIsSettingsOpen(false)}
                title="Close"
              >
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="mb-2 text-sm text-gray-600 dark:text-gray-400">
              These settings apply to the entire app and all tabs.
            </div>
            <div className="flex flex-col gap-4 mt-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Docker Path
                </label>
                <input
                  type="text"
                  value={dockerPath}
                  onChange={(e) => setDockerPath(e.target.value)}
                  className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                  placeholder="Leave empty to use system PATH"
                />
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {dockerPath.trim()
                    ? `Using custom Docker path: ${dockerPath.trim()}`
                    : "Using Docker from system PATH"}
                </div>
              </div>
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Default Language
                </label>
                <div className="relative">
                  <select
                    value={defaultLanguage}
                    onChange={e => setDefaultLanguage(e.target.value)}
                    className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:!bg-gray-800 text-gray-700 dark:text-white transition-colors pr-8 appearance-none"
                  >
                    <option value="Javascript">Javascript</option>
                    <option value="Rust">Rust</option>
                    <option value="C/CPP">C/CPP</option>
                  </select>
                  <span className="pointer-events-none absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 dark:text-gray-300 text-base">
                    ▼
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {tabs.map((tab) => (
          <SWEBenchTab
            key={tab.id}
            tabId={tab.id}
            visible={activeTabId === tab.id}
            onTabNameChange={(name) =>
              updateTabData(activeTabId, { title: name })
            }
            dockerPath={dockerPath}
            setDockerPath={setDockerPath}
            language={tabLanguages[tab.id] || defaultLanguage}
            setLanguage={(lang) => setTabLanguages((prev) => ({ ...prev, [tab.id]: lang }))}
            scrollPosition={getScrollPosition(tab.id)}
            scrollableRef={getOrCreateScrollableRef(tab.id)}
          />
        ))}
      </div>
    </div>
  );
}

export default App;
