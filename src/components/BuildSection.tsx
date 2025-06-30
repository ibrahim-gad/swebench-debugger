import { ChangeEvent, RefObject } from "react";
import { FiCopy, FiPlay, FiSquare } from "react-icons/fi";

interface BuildSectionProps {
  imageName: string;
  setImageName: (value: string) => void;
  isBuilding: boolean;
  buildLogs: string[];
  shouldAutoScroll: boolean;
  setShouldAutoScroll: (value: boolean) => void;
  handleBuild: () => void;
  handleStopBuild: () => void;
  isValidImageName: boolean;
  generatedDockerfile: string;
  isValidJson: boolean;
  validationError: string | null;
  logsContainerRef: RefObject<HTMLDivElement>;
  buildLogsSectionRef: RefObject<HTMLDivElement>;
  handleScroll: () => void;
}

export default function BuildSection({
  imageName,
  setImageName,
  isBuilding,
  buildLogs,
  shouldAutoScroll,
  setShouldAutoScroll,
  handleBuild,
  handleStopBuild,
  isValidImageName,
  generatedDockerfile,
  isValidJson,
  validationError,
  logsContainerRef,
  buildLogsSectionRef,
  handleScroll,
}: BuildSectionProps) {
  const handleCopyBuildLogs = async () => {
    const logsText = buildLogs.join('\n');
    try {
      await navigator.clipboard.writeText(logsText);
    } catch (err) {
      console.error('Failed to copy build logs:', err);
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
      {/* Image Name and Build Button Section */}
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
    </div>
  );
} 