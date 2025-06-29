import { useState, useEffect } from "react";
import Editor from "@monaco-editor/react";
import { FiChevronDown, FiChevronRight } from "react-icons/fi";
import "./App.css";

interface JsonSpec {
  base_image?: string;
  packages?: string[];
  commands?: string[];
  environment?: Record<string, string>;
}

function App() {
  const [baseCommit, setBaseCommit] = useState("");
  const [headCommit, setHeadCommit] = useState("");
  const [jsonSpec, setJsonSpec] = useState<string>('{\n  "base_image": "ubuntu:20.04",\n  "packages": ["python3", "git"],\n  "commands": ["pip install -r requirements.txt"],\n  "environment": {\n    "PYTHONPATH": "/app"\n  }\n}');
  const [imageName, setImageName] = useState("");
  const [testFiles, setTestFiles] = useState("");
  const [isDockerfileExpanded, setIsDockerfileExpanded] = useState(false);
  const [generatedDockerfile, setGeneratedDockerfile] = useState("");

  // Generate Dockerfile from JSON spec
  useEffect(() => {
    try {
      const spec: JsonSpec = JSON.parse(jsonSpec);
      let dockerfile = "";
      
      if (spec.base_image) {
        dockerfile += `FROM ${spec.base_image}\n\n`;
      }
      
      dockerfile += "WORKDIR /app\n\n";
      
      if (spec.packages && spec.packages.length > 0) {
        dockerfile += "RUN apt-get update && apt-get install -y \\\n";
        dockerfile += spec.packages.map(pkg => `    ${pkg}`).join(" \\\n");
        dockerfile += " \\\n    && rm -rf /var/lib/apt/lists/*\n\n";
      }
      
      if (spec.environment) {
        Object.entries(spec.environment).forEach(([key, value]) => {
          dockerfile += `ENV ${key}=${value}\n`;
        });
        dockerfile += "\n";
      }
      
      dockerfile += "COPY . .\n\n";
      
      if (spec.commands && spec.commands.length > 0) {
        spec.commands.forEach(command => {
          dockerfile += `RUN ${command}\n`;
        });
        dockerfile += "\n";
      }
      
      dockerfile += "CMD [\"bash\"]";
      
      setGeneratedDockerfile(dockerfile);
    } catch (error) {
      setGeneratedDockerfile("# Invalid JSON spec\n# Please check your JSON syntax");
    }
  }, [jsonSpec]);

  const handleBuild = () => {
    // TODO: Implement build functionality
    console.log("Building with:", { baseCommit, headCommit, imageName, jsonSpec });
  };

  const handleTest = () => {
    // TODO: Implement test functionality
    console.log("Testing with:", { testFiles });
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">
          SWEBench Debugger
        </h1>

        {/* First Row: Base and Head Commit */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Base Commit
            </label>
            <input
              type="text"
              value={baseCommit}
              onChange={(e) => setBaseCommit(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              placeholder="Enter base commit hash..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Head Commit
            </label>
            <input
              type="text"
              value={headCommit}
              onChange={(e) => setHeadCommit(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              placeholder="Enter head commit hash..."
            />
          </div>
        </div>

        {/* Second Row: JSON Spec */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            JSON Spec
          </label>
          <div className="border border-gray-300 dark:border-gray-600 rounded-md overflow-hidden">
            <Editor
              height="250px"
              defaultLanguage="json"
              value={jsonSpec}
              onChange={(value) => setJsonSpec(value || "")}
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

        {/* Third Row: Expandable Dockerfile */}
        <div>
          <div className="flex items-center mb-2">
            <button
              onClick={() => setIsDockerfileExpanded(!isDockerfileExpanded)}
              className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
            >
              {isDockerfileExpanded ? <FiChevronDown /> : <FiChevronRight />}
              Generated Dockerfile
            </button>
          </div>
          {isDockerfileExpanded && (
            <div className="dockerfile-container">
              {generatedDockerfile}
            </div>
          )}
        </div>

        {/* Fourth Row: Image Name and Build */}
        <div className="flex flex-col sm:flex-row gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Image Name
            </label>
            <input
              type="text"
              value={imageName}
              onChange={(e) => setImageName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              placeholder="Enter image name..."
            />
          </div>
          <button
            onClick={handleBuild}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
          >
            Build
          </button>
        </div>

        {/* Fifth Row: Test Files and Test */}
        <div className="flex flex-col sm:flex-row gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Test Files
            </label>
            <input
              type="text"
              value={testFiles}
              onChange={(e) => setTestFiles(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 dark:bg-gray-700 dark:text-white"
              placeholder="Enter test file paths..."
            />
          </div>
          <button
            onClick={handleTest}
            className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-colors"
          >
            Test
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
