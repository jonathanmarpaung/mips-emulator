# MIPS32 Web IDE & Emulator

A state-of-the-art, purely browser-based MIPS32 architecture emulator and Integrated Development Environment (IDE). Designed for students, educators, and low-level programming enthusiasts, this project bridges the gap between classic microprocessor architecture and modern web user experience.

Write, compile, debug, and execute MIPS assembly code seamlessly without installing any external tools.

## ✨ Key Features

### 🖥️ Modern Workspace & IDE

* **Virtual File System (VFS):** A robust, persistent local file system supporting directories, file creation, deletion, and drag-and-drop file moving.
* **Multi-Tab Editor:** Edit multiple `.s` files concurrently. Features intuitive drag-and-drop tab reordering and persistent state.
* **Frictionless UI/UX:** Built with a dark-themed, glassmorphism-inspired interface. Fully responsive—experience a resizable multi-panel layout on desktop and a highly optimized, touch-friendly flex layout on mobile.
* **Smart Notifications:** Non-intrusive, elegant toast notifications for build statuses, runtime exceptions, and system alerts.

### ⚙️ Precision Emulator & CPU

* **MIPS32 Instruction Set:** Comprehensive support for core ALU operations, branching, memory access, and system calls.
* **Coprocessor 1 (FPU):** Built-in Floating Point Unit support for single-precision arithmetic operations (`add.s`, `sub.s`, `mul.s`, `div.s`) and data transfers (`mfc1`, `mtc1`).
* **Memory Management:** Accurately mapped memory segments including `.text` (Instruction Memory), `.data` (Static Data), `heap`, and `stack`.
* **Live Register Tracking:** Real-time monitoring of all 32 general-purpose registers, `HI`/`LO` registers, and 32 FPU registers.

### 🛠️ Powerful Two-Pass Assembler

* **Preprocessor Directives:** Full support for `.include "filename.s"`, allowing you to modularize your code across multiple files. Includes circular-dependency protection.
* **Macro Prediction:** Intelligent expansion of pseudo-instructions (e.g., `la`, `li`, `bge`, `blt`) into raw MIPS machine code.
* **Data Allocation:** Automatic memory alignment for `.word`, `.float`, and `.asciiz` directives.
* **Stict Security Gates:** Deep syntax validation and error catching before the code even reaches the CPU.

### 🐞 Advanced Debugging Arsenal

* **Interactive Disassembly:** View your compiled machine code, opcodes, and corresponding memory addresses side-by-side with your original assembly text.
* **Memory Hex Editor:** A professional-grade memory dump view with ASCII translations, manual address searching, and quick-jump buttons to specific memory segments.
* **Execution Control:** Toggle breakpoints, step through instructions line-by-line, pause execution, or run at full speed.
* **Cycle Throttling:** Configurable CPU cycles per frame to prevent infinite loops from crashing your browser.

## 🚀 Supported Instructions

The assembler currently supports a wide array of instructions, including but not limited to:

* **Arithmetic & Logic:** `add`, `sub`, `and`, `or`, `slt`, `addi`, `addiu`, `andi`, `ori`
* **Data Transfer:** `lw`, `sw`, `lwc1`, `swc1`, `move`, `la`, `li`
* **Control Flow:** `j`, `jal`, `jr`, `beq`, `bne`, `bge`, `blt`
* **Floating Point:** `add.s`, `sub.s`, `mul.s`, `div.s`, `mfc1`, `mtc1`
* **System:** `syscall`, `nop`

## 💻 Quick Start

1. **Write Code:** Open the Explorer and create a `main.s` file.
2. **Modularize (Optional):** Create a `utils/math.s` file and use `.include "utils/math.s"` in your main file to inject external functions.
3. **Build:** Click the **Build** button (or the hammer icon) to compile your assembly into machine code. The Memory and Disassembly views will populate automatically.
4. **Debug & Run:** Set breakpoints by clicking on the line numbers in the Disassembly view. Click **Step** to execute one instruction at a time, or **Run** to execute continuously.
5. **Monitor:** Watch your outputs in the Terminal and monitor state changes in the Registers and Memory tabs.

## 🏗️ Technology Stack

This application runs entirely on the client side, leveraging the power of modern web technologies:

* **Framework:** Next.js & React
* **Styling:** Tailwind CSS
* **UI Components:** Shadcn UI & Radix Primitives
* **Layout Engine:** React Resizable Panels
* **Icons:** Lucide React
* **Core Logic:** Pure TypeScript (Custom MIPS Assembler & CPU architecture)

**Built with passion for low-level architecture and high-level web design.**