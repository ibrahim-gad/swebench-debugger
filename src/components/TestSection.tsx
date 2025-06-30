import { ChangeEvent, RefObject } from "react";
import { FiCopy, FiCheck, FiSquare } from "react-icons/fi";

interface TestSectionProps {
  testFiles: string;
  setTestFiles: (value: string) => void;
  isTesting: boolean;
  testLogs: string[];
  shouldAutoScrollTest: boolean;
  setShouldAutoScrollTest: (value: boolean) => void;
  handleTest: () => void;
  handleStopTest: () => void;
  isImageExists: boolean;
  isCheckingImage: boolean;
  testLogsContainerRef: RefObject<HTMLDivElement>;
  testLogsSectionRef: RefObject<HTMLDivElement>;
  handleTestScroll: () => void;
}

export default function TestSection({
  testFiles,
  setTestFiles,
  isTesting,
  testLogs,
  shouldAutoScrollTest,
  setShouldAutoScrollTest,
  handleTest,
  handleStopTest,
  isImageExists,
  isCheckingImage,
  testLogsContainerRef,
  testLogsSectionRef,
  handleTestScroll,
}: TestSectionProps) {
  const handleCopyTestLogs = async () => {
    const logsText = testLogs.join('\n');
    try {
      await navigator.clipboard.writeText(logsText);
    } catch (err) {
      console.error('Failed to copy test logs:', err);
      const textArea = document.createElement('textarea');
      textArea.value = logsText;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
  };

  return (
    <div className="space-y-6">
      {/* Test Files and Test Button */}
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
        <div ref={testLogsSectionRef}>
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
            className="bg-gray-900 dark:bg-gray-800 rounded-md p-4 h-96 max-h-96 overflow-y-auto"
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
  );
} 