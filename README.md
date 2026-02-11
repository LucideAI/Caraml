# 🐫 Caraml

**Comprehensive Web-Based OCaml IDE** (React Frontend + Express Backend) featuring code execution, memory visualization, project sharing, and Learn OCaml integration.

## 📑 Table of Contents

* [Features](https://www.google.com/search?q=%23-features)
* [Technical Stack](https://www.google.com/search?q=%23-technical-stack)
* [Prerequisites](https://www.google.com/search?q=%23-prerequisites)
* [Installation](https://www.google.com/search?q=%23-installation)
* [Running the Project](https://www.google.com/search?q=%23-running-the-project)
* [Environment Variables](https://www.google.com/search?q=%23-environment-variables)
* [Project Structure](https://www.google.com/search?q=%23-project-structure)
* [Core API](https://www.google.com/search?q=%23-core-api)
* [Keyboard Shortcuts](https://www.google.com/search?q=%23-keyboard-shortcuts)
* [Important Notes](https://www.google.com/search?q=%23-important-notes)

---

## ✨ Features

* 🔐 **User Authentication:** Secure registration and login via JWT.
* 📂 **Project Management:** Create, edit, and delete multi-file OCaml projects.
* 🎨 **Monaco Editor IDE:** Syntax highlighting, code snippets, auto-completion, and type hovering.
* ⚡ **Robust OCaml Execution:**
* **Native Backend Mode:** Uses the system `ocaml` binary (if available).
* **Browser Fallback:** Seamlessly switches to an embedded in-browser OCaml interpreter if server tools are missing.


* 🛠️ **Optional Tool Integration:**
* `ocamlmerlin` for advanced completion, type inference, and error reporting.
* `ocamlformat` for automated code formatting.


* 🧠 **Memory Visualization:** Real-time inspection of the environment, stack, heap, and data types.
* 🔗 **Social Sharing:** Public project sharing via unique links with forking capabilities.
* 🎓 **Learn OCaml Integration:** Connect to instances, browse exercises, synchronize answers, and view grading reports.

---

## 🏗️ Technical Stack

### ⚛️ Frontend

* **Framework:** React 18 + TypeScript
* **Build Tool:** Vite 5
* **State Management:** Zustand
* **Editor:** Monaco Editor
* **Styling:** Tailwind CSS
* **Routing:** React Router

### 🔙 Backend

* **Runtime:** Node.js + Express
* **Database:** SQLite (`better-sqlite3`)
* **Security:** JWT (`jsonwebtoken`) & Password Hashing (`bcryptjs`)

---

## 📋 Prerequisites

* **Node.js 18+** (Recommended)
* **npm**
* **Optional** (For the full OCaml experience):
* `ocaml`
* `ocamlmerlin`
* `ocamlformat`
* `opam`



> **⚠️ Important:** Server-side detection of OCaml tools is cross-platform (Windows, macOS, Linux). If these tools are not installed, the application will gracefully degrade and remain fully functional using the browser-based fallback engine without generating system errors.

---

## ⬇️ Installation

Navigate to the `Caraml/` directory:

```bash
npm install

```

### ⚙️ Automated OCaml Toolchain Setup (Optional)

To ensure portability and reduce repository size, binary files (`ocaml`, `ocamlmerlin`, `ocamlformat`) are not versioned in Git. Instead, the project provides a reproducible installation script via `opam`.

**For Windows Users** (requires `winget`):

```powershell
winget install Git.Git OCaml.opam

```

**Run the setup script:**

```bash
npm run setup:ocaml

```

This script creates (or reuses) a local switch in `./_opam` and installs:

* `ocaml-base-compiler.5.4.0`
* `merlin.5.6.1-504`
* `ocamlformat.0.28.1`

**Script Behavior:**

* If `opam` is present but uninitialized, the script automatically executes `opam init` (using `--cygwin-internal-install` on Windows to bypass interactive prompts).
* During long-running processes (such as OCaml compilation), the script displays a periodic `still running (...)` heartbeat.

**Auto-Bootstrap System:**
Subsequently, `npm run dev` automatically detects these tools. It also performs an auto-bootstrap check (`ensure:ocaml`) on startup:

1. If the toolchain is missing and `opam` is available, it automatically triggers `setup:ocaml`.
2. On Windows, if `opam` is missing, it attempts installation via `winget`, followed by the official opam script (best-effort).
3. If installation fails, the application starts in **Browser Fallback Mode**.

**To disable auto-bootstrap:**

```bash
npm run dev:no-ocaml

```

Or via environment variables/options:

```bash
CARAML_SKIP_OCAML_AUTO_SETUP=1 npm run dev
# OR
npm run dev -- --skip-ocaml

```

**PowerShell:**

```powershell
$env:CARAML_SKIP_OCAML_AUTO_SETUP="1"; npm run dev

```

If you do not have `opam` installed, refer to the official documentation: [Install OCaml](https://opam.ocaml.org/doc/Install.html)

---

## 🚀 Running the Project

### Development Mode (Frontend + Backend)

```bash
npm run dev

```

* **Frontend:** `http://localhost:5173`
* **Backend API:** `http://localhost:3001` (Incremented automatically if port 3001 is busy)
* The frontend automatically proxies `/api` requests to the backend.
* *Graceful Degradation:* If `ocaml`, `ocamlmerlin`, or `ocamlformat` are unavailable, the server cleanly switches to fallback mode, disabling backend-specific features.

### Frontend Only

```bash
npm run dev:client

```

### Backend Only

```bash
npm run dev:server

```

### Production Build

```bash
npm run build

```

### Production Startup

```bash
npm run start

```

> **Note:** `npm run start` serves the contents of the `dist/` directory via Express. Ensure you execute `npm run build` prior to starting.

---

## 🔧 Environment Variables

The following variables can be configured:

* `JWT_SECRET` (Optional, but **highly recommended** for non-local environments).
* `CARAML_OCAML_PATH` (Optional): Explicit path to the `ocaml` binary.
* `CARAML_OCAMLMERLIN_PATH` (Optional): Explicit path to the `ocamlmerlin` binary.
* `CARAML_OCAMLFORMAT_PATH` (Optional): Explicit path to the `ocamlformat` binary.

**Bash Example:**

```bash
JWT_SECRET="change-me" \
CARAML_OCAML_PATH="/usr/local/bin/ocaml" \
CARAML_OCAMLMERLIN_PATH="/usr/local/bin/ocamlmerlin" \
CARAML_OCAMLFORMAT_PATH="/usr/local/bin/ocamlformat" \
npm run dev:server

```

**PowerShell Example:**

```powershell
$env:JWT_SECRET="change-me"
$env:CARAML_OCAML_PATH="C:\\Tools\\OCaml\\bin\\ocaml.exe"
$env:CARAML_OCAMLMERLIN_PATH="C:\\Tools\\OCaml\\bin\\ocamlmerlin.exe"
$env:CARAML_OCAMLFORMAT_PATH="C:\\Tools\\OCaml\\bin\\ocamlformat.exe"
npm run dev:server

```

*Note: The backend port is currently hardcoded to `3001` in `server.js`.*

---

## 📂 Project Structure

```text
Caraml/
|-- src/
|   |-- components/       # UI Components (Header, Editor, Console, Modals...)
|   |-- pages/            # Dashboard, IDE, Share, Learn OCaml
|   |-- services/         # Frontend API Clients
|   |-- store/            # Global Zustand Store
|   `-- interpreter/      # Browser-based OCaml Interpreter (Fallback)
|-- server.js             # Express API + SQLite + OCaml Tooling
|-- package.json
|-- tailwind.config.js
`-- vite.config.ts

```

**Local SQLite Database Files:**

* `caraml.db`
* `caraml.db-shm`
* `caraml.db-wal`

---

## 📡 Core API

### Authentication

* `POST /api/auth/register`
* `POST /api/auth/login`
* `GET /api/auth/me`

### Projects

* `GET /api/projects`
* `POST /api/projects`
* `GET /api/projects/:id`
* `PUT /api/projects/:id`
* `DELETE /api/projects/:id`

### Sharing

* `POST /api/projects/:id/share`
* `POST /api/projects/:id/unshare`
* `GET /api/shared/:shareId`
* `POST /api/shared/:shareId/fork`

### OCaml Tooling

* `GET /api/capabilities`
* `POST /api/execute`
* `POST /api/toplevel`
* `POST /api/format`
* `POST /api/merlin/complete`
* `POST /api/merlin/type`
* `POST /api/merlin/errors`

### Learn OCaml

* `POST /api/learn-ocaml/connect`
* `POST /api/learn-ocaml/exercises`
* `POST /api/learn-ocaml/exercise/*`
* `POST /api/learn-ocaml/save`
* `POST /api/learn-ocaml/sync-answer`
* `POST /api/learn-ocaml/grade`

---

## ⌨️ Keyboard Shortcuts

### Main IDE

* `Ctrl+Enter`: Run code
* `Ctrl+S`: Save project
* `Ctrl+Shift+F`: Format code (requires `ocamlformat`)

### Learn OCaml Interface

* `Ctrl+Enter`: Run code
* `Ctrl+S`: Sync answer
* `Ctrl+Shift+G`: Submit for grading

---

## ℹ️ Important Notes

1. **System Fallback:** If the `ocaml` binary is not detected, the application remains fully operational via the browser interpreter to prevent system errors.
2. **Merlin Availability:** If `ocamlmerlin` is missing, the editor reverts to local Monaco-based autocompletion.
3. **Formatting:** If `ocamlformat` is missing, the "Format" button is disabled.
4. **Security:** The default JWT secret located in `server.js` **must** be replaced with a secure environment variable for any real-world deployment.
