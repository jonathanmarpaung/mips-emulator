import React, { useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Button } from "@/components/ui/button";

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex flex-col items-center justify-center bg-[#0d0d0d]">
      <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3"></div>
      <span className="text-[10px] text-zinc-500 font-mono animate-pulse uppercase tracking-widest">Starting Editor...</span>
    </div>
  )
});

interface EditorViewProps {
  code: string;
  setCode: (c: string) => void;
  setIsCompiled: (v: boolean) => void;
  editorBreakpoints: Set<number>;
  setEditorBreakpoints: React.Dispatch<React.SetStateAction<Set<number>>>;
  isMobile: boolean;
}

export function EditorView({ code, setCode, setIsCompiled, editorBreakpoints, setEditorBreakpoints, isMobile }: EditorViewProps) {
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const decorationsRef = useRef<string[]>([]);

  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return;
    const newDecorations = Array.from(editorBreakpoints).map(line => ({
      range: new monacoRef.current.Range(line, 1, line, 1),
      options: { isWholeLine: false, glyphMarginClassName: 'breakpoint-glyph' }
    }));
    decorationsRef.current = editorRef.current.deltaDecorations(decorationsRef.current, newDecorations);
  }, [editorBreakpoints]);

  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    
    monaco.editor.defineTheme('mips-dark', {
      base: 'vs-dark', inherit: true,
      rules: [{ background: '0d0d0d' }],
      colors: { 'editor.background': '#0d0d0d', 'editor.lineHighlightBackground': '#1a1a1a', 'editorLineNumber.foreground': '#52525b' }
    });
    monaco.editor.setTheme('mips-dark');

    editor.onMouseDown((e: any) => {
      if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
        const lineNo = e.target.position.lineNumber;
        setEditorBreakpoints((prev: Set<number>) => {
          const nw = new Set(prev);
          if (nw.has(lineNo)) nw.delete(lineNo); else nw.add(lineNo);
          return nw;
        });
      }
    });
  };

  const insertText = (text: string) => {
    if (editorRef.current && monacoRef.current) {
      const editor = editorRef.current;
      const position = editor.getPosition();
      editor.executeEdits('shortcut-bar', [{
        range: new monacoRef.current.Range(position.lineNumber, position.column, position.lineNumber, position.column),
        text: text,
        forceMoveMarkers: true
      }]);
      editor.focus(); 
    }
  };

  return (
    <div className="flex-1 flex flex-col w-full h-full min-h-0 bg-[#0d0d0d]">
      <div className="flex-1 relative min-h-0 w-full h-full">
        <MonacoEditor 
          height="100%" 
          language="mips" 
          theme="mips-dark" 
          value={code} 
          onChange={(val) => { setCode(val || ""); setIsCompiled(false); }} 
          onMount={handleEditorDidMount} 
          options={{ minimap: { enabled: false }, fontSize: 13, wordWrap: "on" }} 
        />
      </div>
      
      {/* QUICK KEYS SHORTCUT BAR UNTUK MOBILE */}
      {isMobile && (
        <div className="h-12 bg-[#09090b] border-t border-zinc-900 flex items-center gap-1.5 px-2 overflow-x-auto hide-scrollbar shrink-0 shadow-[0_-4px_10px_rgba(0,0,0,0.2)] z-10 w-full">
          {['\t', '$', ':', ',', '#', '.', '(', ')', '%', '"'].map((char, i) => (
            <Button key={i} onClick={() => insertText(char)} variant="secondary" className="h-8 min-w-10 px-3 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 text-xs font-mono rounded">
              {char === '\t' ? 'TAB' : char}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
