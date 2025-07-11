import { ChangeEvent } from "react";
import Editor from "@monaco-editor/react";
import { FiChevronDown, FiChevronRight, FiCopy } from "react-icons/fi";

interface RepositoryFormProps {
  githubRepoUrl: string;
  setGithubRepoUrl: (value: string) => void;
  baseCommit: string;
  setBaseCommit: (value: string) => void;
  headCommit: string;
  setHeadCommit: (value: string) => void;
  jsonSpec: string;
  setJsonSpec: (value: string) => void;
  isDockerfileExpanded: boolean;
  setIsDockerfileExpanded: (value: boolean) => void;
  generatedDockerfile: string;
  validationError: string | null;
  isValidJson: boolean;
  useHeadCommit: boolean;
  setUseHeadCommit: (value: boolean) => void;
  language: string;
  setLanguage: (lang: string) => void;
}

export default function RepositoryForm({
  githubRepoUrl,
  setGithubRepoUrl,
  baseCommit,
  setBaseCommit,
  headCommit,
  setHeadCommit,
  jsonSpec,
  setJsonSpec,
  isDockerfileExpanded,
  setIsDockerfileExpanded,
  generatedDockerfile,
  validationError,
  isValidJson,
  useHeadCommit,
  setUseHeadCommit,
  language,
  setLanguage,
}: RepositoryFormProps) {
  const handleCopyDockerfile = async () => {
    try {
      await navigator.clipboard.writeText(generatedDockerfile);
    } catch (err) {
      console.error('Failed to copy dockerfile:', err);
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
    } catch (err) {
      console.error('Failed to copy JSON spec:', err);
      const textArea = document.createElement('textarea');
      textArea.value = jsonSpec;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
  };

  return (
    <div className="space-y-6">
      {/* First Row: Language and GitHub Repo URL */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 min-w-[100px]">
            Language
          </label>
          <div className="relative flex-1">
            <select
              value={language}
              onChange={e => setLanguage(e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:!bg-gray-800 text-gray-700 dark:text-white transition-colors pr-8 appearance-none"
              style={{ minWidth: 0 }}
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
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 min-w-[100px]">
            GitHub Repo URL
          </label>
          <input
            type="text"
            value={githubRepoUrl}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setGithubRepoUrl(e.target.value)}
            className="flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-700 dark:text-white transition-colors"
            placeholder="Enter GitHub repository URL..."
          />
        </div>
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


    </div>
  );
} 