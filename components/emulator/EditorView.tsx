import React, { useRef, useEffect } from 'react';
import Editor, { useMonaco } from '@monaco-editor/react';

interface EditorViewProps {
  code: string;
  setCode: (code: string) => void;
  setIsCompiled: (v: boolean) => void;
  editorBreakpoints: Set<number>;
  setEditorBreakpoints: (bps: Set<number> | ((prev: Set<number>) => Set<number>)) => void;
  isMobile: boolean;
}

export function EditorView({ code, setCode, setIsCompiled, editorBreakpoints, setEditorBreakpoints, isMobile }: EditorViewProps) {
  const monaco = useMonaco();
  const editorRef = useRef<any>(null);

  // ---------------------------------------------------------------------------
  // 1. PEMBUNGKAM ERROR NEXT.JS TINGKAT TINGGI
  // Mencegat log 'operation is manually canceled' dari Web Worker Monaco
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const originalConsoleError = console.error;
    console.error = (...args: any[]) => {
      const msg = args[0];
      if (typeof msg === 'string' && msg.includes('operation is manually canceled')) return;
      if (msg && msg.msg === 'operation is manually canceled') return;
      originalConsoleError(...args);
    };

    const handleRejection = (e: PromiseRejectionEvent) => {
      if (e.reason && (e.reason.message === 'Canceled' || e.reason.message === 'operation is manually canceled')) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    
    window.addEventListener('unhandledrejection', handleRejection);
    return () => {
      console.error = originalConsoleError;
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // 2. SYNTAX HIGHLIGHTING MIPS
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (monaco) {
      monaco.languages.register({ id: 'mips' });
      monaco.languages.setMonarchTokensProvider('mips', {
        tokenizer: {
          root: [
            [/#.*/, 'comment'],
            [/\.(data|text|globl|asciiz|word|float|space|align|byte|half)/, 'keyword'],
            [/\$[a-zA-Z0-9]+/, 'variable.predefined'],
            [/[a-zA-Z_][a-zA-Z0-9_]*:/, 'type.identifier'],
            [/\b(add|addi|addiu|sub|mul|div|and|andi|or|ori|xor|nor|slt|slti|sll|srl|sra|lw|sw|lwc1|swc1|lb|sb|lh|sh|beq|bne|bge|blt|bgt|ble|j|jal|jr|syscall|li|la|move|mfhi|mflo)\b/, 'keyword.control'],
            [/"([^"\\]|\\.)*"/, 'string'],
            [/-?\d+(\.\d+)?([eE][+-]?\d+)?/, 'number'],
          ]
        }
      });
    }
  }, [monaco]);

  const handleEditorDidMount = (editor: any, monacoInstance: any) => {
    editorRef.current = editor;

    // Menangani klik margin untuk Breakpoint
    editor.onMouseDown((e: any) => {
      if (e.target.type === 2) { 
        const line = e.target.position.lineNumber;
        setEditorBreakpoints((prev: Set<number>) => {
          const newBps = new Set(prev);
          if (newBps.has(line)) newBps.delete(line);
          else newBps.add(line);
          return newBps;
        });
      }
    });
  };

  // ---------------------------------------------------------------------------
  // 3. PENCEGAH KURSOR MELOMPAT (Semi-Controlled Pattern)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (editorRef.current && code !== editorRef.current.getValue()) {
      editorRef.current.setValue(code);
    }
  }, [code]);

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
       setCode(value);
       setIsCompiled(false);
    }
  };

  // ---------------------------------------------------------------------------
  // 4. PEMBARUAN VISUAL BREAKPOINT
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (editorRef.current && monaco) {
        const decorations = Array.from(editorBreakpoints).map(line => ({
          range: new monaco.Range(line, 1, line, 1),
          options: {
            isWholeLine: false,
            glyphMarginClassName: 'breakpoint-glyph',
            glyphMarginHoverMessage: { value: 'Breakpoint' }
          }
        }));
        editorRef.current.__decorations = editorRef.current.deltaDecorations(editorRef.current.__decorations || [], decorations);
    }
  }, [editorBreakpoints, monaco]);

  return (
    <div className="w-full h-full relative bg-[#1e1e1e]">
      <Editor
        height="100%"
        language="mips"
        theme="vs-dark"
        defaultValue={code} 
        onChange={handleEditorChange}
        onMount={handleEditorDidMount}
        options={{
          // REKAYASA EDITOR UNTUK MOBILE & DESKTOP
          fontSize: isMobile ? 12 : 14,
          minimap: { enabled: !isMobile },
          wordWrap: 'on',
          lineNumbers: 'on',
          glyphMargin: true,
          folding: false,
          
          // Menghemat ruang di HP
          lineDecorationsWidth: isMobile ? 5 : 10,
          lineNumbersMinChars: isMobile ? 3 : 5,
          
          automaticLayout: true,
          scrollBeyondLastLine: false,
          
          // PENTING: Aktifkan contextmenu agar menu Copy/Paste Monaco muncul saat Long Press di HP!
          contextmenu: true, 
          
          // Mematikan fitur berat yang memicu error Worker di Mobile
          quickSuggestions: false,
          parameterHints: { enabled: false },
          suggestOnTriggerCharacters: false,
          acceptSuggestionOnEnter: "off",
          tabCompletion: "off",
          
          // Mematikan hover tooltip di HP karena sering "nyangkut" di layar sentuh
          hover: { enabled: (!isMobile ? "on" : "off") }, 
          
          scrollbar: {
            useShadows: false,
            verticalScrollbarSize: isMobile ? 6 : 10,
            horizontalScrollbarSize: isMobile ? 6 : 10,
            alwaysConsumeMouseWheel: false,
          }
        }}
      />
    </div>
  );
}