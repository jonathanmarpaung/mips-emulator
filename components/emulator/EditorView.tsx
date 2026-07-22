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
  // 0. PEREDAM ERROR "CANCELED" BAWAAN MONACO
  // Ini akan mencegah terminal Next.js Anda dipenuhi log error merah.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      if (reason && (
        reason.name === 'Cancel' || 
        reason.message === 'Canceled' || 
        reason.message === 'operation is manually canceled' || 
        reason.type === 'cancelation'
      )) {
        // Hentikan pelemparan error ke konsol
        event.preventDefault(); 
      }
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    return () => window.removeEventListener('unhandledrejection', handleUnhandledRejection);
  }, []);

  // ---------------------------------------------------------------------------
  // 1. INJEKSI SYNTAX HIGHLIGHTING MIPS
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

  // ---------------------------------------------------------------------------
  // 2. PENANGANAN MOUNT & BREAKPOINTS
  // ---------------------------------------------------------------------------
  const handleEditorDidMount = (editor: any, monacoInstance: any) => {
    editorRef.current = editor;

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
  // 3. PENCEGAH KURSOR MELOMPAT
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
    <div className="w-full h-full relative bg-[#0d0d0d]">
      <Editor
        height="100%"
        language="mips"
        theme="vs-dark"
        defaultValue={code} 
        onChange={handleEditorChange}
        onMount={handleEditorDidMount}
        options={{
          fontSize: isMobile ? 12 : 14,
          minimap: { enabled: !isMobile },
          wordWrap: 'on',
          lineNumbers: 'on',
          glyphMargin: true,
          folding: false,
          lineDecorationsWidth: 10,
          automaticLayout: true,
          scrollBeyondLastLine: false,
          contextmenu: !isMobile,
          quickSuggestions: false,
          parameterHints: { enabled: false },
          codeLens: false,
          scrollbar: {
            useShadows: false,
            verticalScrollbarSize: 10,
            horizontalScrollbarSize: 10,
          }
        }}
      />
    </div>
  );
}