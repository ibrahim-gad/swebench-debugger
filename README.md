# SWEBench Debugger

A Tauri-based desktop application for debugging SWEBench issues with React frontend and Rust backend.

## Prerequisites

### Installing Rust

Rust is required to build the Tauri application. Install it using the official installer:

**Windows, macOS, and Linux:**
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

After installation, restart your terminal and verify the installation:
```bash
rustc --version
cargo --version
```

### Installing pnpm

pnpm is the recommended package manager for this project. Install it globally:

**Using npm:**
```bash
npm install -g pnpm
```

**Using curl (Unix-like systems):**
```bash
curl -fsSL https://get.pnpm.io/install.sh | sh -
```

**Using PowerShell (Windows):**
```powershell
iwr https://get.pnpm.io/install.ps1 -useb | iex
```

Verify the installation:
```bash
pnpm --version
```

## Building the Application

### 1. Install Dependencies

First, install the frontend dependencies:
```bash
pnpm install
```

### 2. Build for Production

Build the application for your platform:
```bash
pnpm tauri build
```

This command will:
- Build the React frontend for production
- Compile the Rust backend
- Create platform-specific bundles

## Finding Your Built Application

After running `pnpm tauri build`, you can find the built application in the following locations:

### Windows
**Location:** `src-tauri/target/release/bundle/`

**Available formats:**
- **MSI Installer:** `msi/swebench-debugger_[version]_x64_en-US.msi`
- **NSIS Installer:** `nsis/swebench-debugger_[version]_x64-setup.exe`

**To install:** Run either the MSI or NSIS installer to install the application system-wide.

### macOS
**Location:** `src-tauri/target/release/bundle/`

**Available formats:**
- **App Bundle:** `macos/swebench-debugger.app`
- **DMG Installer:** `dmg/swebench-debugger_[version]_x64.dmg`

**To install:** 
- Double-click the `.app` file to run directly, or
- Open the `.dmg` file and drag the app to your Applications folder

### Linux
**Location:** `src-tauri/target/release/bundle/`

**Available formats:**
- **AppImage:** `appimage/swebench-debugger_[version]_amd64.AppImage`
- **Debian Package:** `deb/swebench-debugger_[version]_amd64.deb`
- **RPM Package:** `rpm/swebench-debugger-[version]-1.x86_64.rpm`

**To install:**
- **AppImage:** Make executable and run directly: `chmod +x *.AppImage && ./swebench-debugger_*.AppImage`
- **Debian/Ubuntu:** `sudo dpkg -i swebench-debugger_*.deb`
- **RPM-based distros:** `sudo rpm -i swebench-debugger-*.rpm`

## Development

To run the application in development mode:
```bash
pnpm tauri dev
```

## Troubleshooting

### Linux Dependencies
If you encounter build errors on Linux, install the required system dependencies:

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

**Fedora:**
```bash
sudo dnf install webkit2gtk4.1-devel build-essential curl wget file openssl-devel libayatana-appindicator3-devel librsvg2-devel
```

**Arch Linux:**
```bash
sudo pacman -S webkit2gtk-4.1 base-devel curl wget file openssl libayatana-appindicator librsvg
```

### macOS Dependencies
Make sure you have Xcode command line tools installed:
```bash
xcode-select --install
```

### Windows Dependencies
Ensure you have:
- Microsoft Visual Studio C++ Build Tools
- WebView2 runtime (usually pre-installed on Windows 10/11)

## License

This project is licensed under the MIT License.
