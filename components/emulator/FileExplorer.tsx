import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Folder as FolderIcon, File as FileIcon, Trash2, X, FilePlus, FolderPlus, FolderInput, ArrowRight } from "lucide-react";

interface FileExplorerProps {
  files: string[];
  setFiles: React.Dispatch<React.SetStateAction<string[]>>;
  activeFile: string;
  setActiveFile: (file: string) => void;
  fileContents: Record<string, string>;
  setFileContents: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}

export function FileExplorer({
  files, setFiles, activeFile, setActiveFile, fileContents, setFileContents
}: FileExplorerProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['']));
  const [showNewModal, setShowNewModal] = useState(false);
  const [modalType, setModalType] = useState<'file' | 'folder'>('file');
  const [newItemName, setNewItemName] = useState('');
  const [selectedFolder, setSelectedFolder] = useState('');

  // Drag & Drop Feedback State (Untuk Desktop)
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);

  // State Khusus Mobile: Modal Pindah File (Move To...)
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [itemToMove, setItemToMove] = useState<string | null>(null);

  // =======================================================================
  // DRAG AND DROP LOGIC (HTML5 NATIVE - DESKTOP)
  // =======================================================================
  const handleDragStart = (e: React.DragEvent, sourcePath: string) => {
    e.dataTransfer.setData('text/plain', sourcePath);
    e.dataTransfer.effectAllowed = 'move';
    e.stopPropagation();
  };

  const handleDragOver = (e: React.DragEvent, targetFolder: string) => {
    e.preventDefault(); 
    e.dataTransfer.dropEffect = 'move';
    e.stopPropagation();
    if (dragOverFolder !== targetFolder) {
      setDragOverFolder(targetFolder);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverFolder(null);
  };

  const handleDrop = (e: React.DragEvent, targetFolder: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverFolder(null);
    const sourcePath = e.dataTransfer.getData('text/plain');
    moveItem(sourcePath, targetFolder);
  };

  // =======================================================================
  // LOGIKA PEMINDAHAN INTI (Dipakai oleh Desktop Drag-Drop & Mobile Modal)
  // =======================================================================
  const moveItem = (sourcePath: string, targetFolder: string) => {
    if (!sourcePath || sourcePath === targetFolder) return;
    
    // Cegah folder masuk ke dirinya sendiri
    if (targetFolder === sourcePath || targetFolder.startsWith(sourcePath + '/')) {
      alert("Error: Tidak bisa memindahkan folder ke dalam dirinya sendiri!");
      return;
    }

    const itemName = sourcePath.split('/').pop() || '';
    const newPath = targetFolder === '' ? itemName : `${targetFolder}/${itemName}`;
    
    if (files.some(f => f === newPath || f.startsWith(newPath + '/'))) {
      alert("Error: Item dengan nama yang sama sudah ada di tujuan!");
      return;
    }

    const newFiles = files.map(f => {
      if (f === sourcePath) return newPath;
      if (f.startsWith(sourcePath + '/')) return newPath + f.substring(sourcePath.length);
      return f;
    });

    const newContents = { ...fileContents };
    let updatedActiveFile = activeFile;

    Object.keys(newContents).forEach(f => {
      if (f === sourcePath || f.startsWith(sourcePath + '/')) {
        const content = newContents[f];
        delete newContents[f];
        localStorage.removeItem(`mips_fs_${f}`);
        
        const movedPath = f === sourcePath ? newPath : newPath + f.substring(sourcePath.length);
        newContents[movedPath] = content;
        localStorage.setItem(`mips_fs_${movedPath}`, content);

        if (activeFile === f) updatedActiveFile = movedPath;
      }
    });

    setFiles(newFiles);
    setFileContents(newContents);
    setActiveFile(updatedActiveFile);
    
    // Tutup modal jika pemindahan dipicu dari Mobile
    setShowMoveModal(false);
    setItemToMove(null);
  };

  // =======================================================================
  // FILE & FOLDER CREATION LOGIC
  // =======================================================================
  const handleCreateNewItem = (e?: React.FormEvent | React.KeyboardEvent) => {
    if (e) {
      e.preventDefault();
    }

    const rawName = newItemName.trim();
    if (!rawName) return;
    
    let fullPath = selectedFolder ? `${selectedFolder}/${rawName}` : rawName;
    
    if (modalType === 'file' && !fullPath.endsWith('.s')) fullPath += '.s';
    if (modalType === 'folder') fullPath += '/.keep'; 

    if (files.includes(fullPath)) {
      alert("Item tersebut sudah ada!");
      return;
    }

    const initialCode = modalType === 'file' ? `# File: ${fullPath}\n` : '';
    setFiles(prev => [...prev, fullPath]);
    setFileContents(prev => ({ ...prev, [fullPath]: initialCode }));
    localStorage.setItem(`mips_fs_${fullPath}`, initialCode);
    
    if (modalType === 'file') setActiveFile(fullPath);
    if (selectedFolder) setExpandedFolders(prev => new Set(prev).add(selectedFolder));
    
    setShowNewModal(false);
    setNewItemName('');
  };

  const deleteFile = (filename: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (files.length === 1 && files[0] === filename) return alert("File terakhir tidak bisa dihapus.");
    
    if (confirm(`Yakin ingin menghapus ${filename}?`)) {
      const newFiles = files.filter(f => f !== filename && !f.startsWith(filename + '/'));
      const newContents = { ...fileContents };
      
      files.forEach(f => {
        if (f === filename || f.startsWith(filename + '/')) {
            delete newContents[f];
            localStorage.removeItem(`mips_fs_${f}`);
        }
      });
      
      setFiles(newFiles);
      setFileContents(newContents);
      
      if (activeFile === filename || activeFile.startsWith(filename + '/')) {
        const remainingFiles = newFiles.filter(f => !f.endsWith('.keep'));
        setActiveFile(remainingFiles.length > 0 ? remainingFiles[0] : '');
      }
    }
  };

  const toggleFolder = (folderPath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderPath)) next.delete(folderPath); else next.add(folderPath);
      return next;
    });
  };

  // =======================================================================
  // ALGORITMA REKURSIF YANG DISEMPURNAKAN (ANTI-BUG)
  // =======================================================================
  const renderFileTree = (currentPath: string, level: number = 0) => {
    const immediateFolders = new Set<string>();
    const immediateFiles = new Set<string>();

    files.forEach(f => {
      const prefix = currentPath ? currentPath + '/' : '';
      if (f.startsWith(prefix)) {
        const relativePath = f.substring(prefix.length);
        const parts = relativePath.split('/');
        
        if (parts.length === 1) {
          if (parts[0] !== '.keep') {
            immediateFiles.add(f);
          }
        } else {
          immediateFolders.add(prefix + parts[0]);
        }
      }
    });

    const sortedFolders = Array.from(immediateFolders).sort();
    const sortedFiles = Array.from(immediateFiles).sort();

    return (
      <div className="flex flex-col w-full" style={{ paddingLeft: level === 0 ? '0' : '14px' }}>
        
        {/* RENDER FOLDERS */}
        {sortedFolders.map(folder => {
          const folderName = folder.split('/').pop();
          const isExpanded = expandedFolders.has(folder);
          const isDragOver = dragOverFolder === folder;
          
          return (
            <div key={folder} className="flex flex-col w-full relative">
              <div 
                draggable
                onDragStart={(e) => handleDragStart(e, folder)}
                onDragOver={(e) => handleDragOver(e, folder)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, folder)}
                className={`group flex items-center justify-between px-2 py-1.5 cursor-pointer transition-colors ${
                  isDragOver ? 'bg-emerald-500/20 ring-1 ring-emerald-500 rounded' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                }`}
                onClick={(e) => toggleFolder(folder, e)}
              >
                <div className="flex items-center gap-1.5 overflow-hidden">
                  {isExpanded ? <ChevronDown size={14} className="shrink-0" /> : <ChevronRight size={14} className="shrink-0" />}
                  <FolderIcon size={14} className="text-blue-400 shrink-0" />
                  <span className="text-sm truncate select-none">{folderName}</span>
                </div>
                
                {/* ACTION BUTTONS (MOBILE FRIENDLY) */}
                <div className="flex items-center gap-0.5 opacity-80 md:opacity-0 md:group-hover:opacity-100 bg-[#09090b] pl-2 shrink-0">
                  <button onClick={(e) => { e.stopPropagation(); setItemToMove(folder); setShowMoveModal(true); }} className="hover:text-blue-400 p-1" title="Pindahkan"><FolderInput size={13}/></button>
                  <button onClick={(e) => { e.stopPropagation(); setSelectedFolder(folder); setModalType('file'); setShowNewModal(true); }} className="hover:text-emerald-400 p-1" title="New File"><FilePlus size={13}/></button>
                  <button onClick={(e) => { e.stopPropagation(); setSelectedFolder(folder); setModalType('folder'); setShowNewModal(true); }} className="hover:text-emerald-400 p-1" title="New Folder"><FolderPlus size={13}/></button>
                  <button onClick={(e) => deleteFile(folder, e)} className="hover:text-red-400 p-1" title="Hapus"><Trash2 size={13}/></button>
                </div>
              </div>
              {isExpanded && renderFileTree(folder, level + 1)}
            </div>
          );
        })}
        
        {/* RENDER FILES */}
        {sortedFiles.map(file => {
          const fileName = file.split('/').pop();
          const isActive = activeFile === file;
          return (
            <div 
              key={file} 
              draggable
              onDragStart={(e) => handleDragStart(e, file)}
              onClick={() => setActiveFile(file)}
              className={`group flex items-center justify-between px-2 py-1.5 cursor-pointer transition-colors ${
                isActive ? 'bg-emerald-500/10 text-emerald-400' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
              }`}
            >
              <div className="flex items-center gap-1.5 overflow-hidden pl-5">
                <FileIcon size={13} className={`shrink-0 ${isActive ? "text-emerald-500" : "text-zinc-500"}`} />
                <span className="text-sm truncate select-none">{fileName}</span>
              </div>

              {/* ACTION BUTTONS (MOBILE FRIENDLY) */}
              <div className="flex items-center gap-0.5 opacity-80 md:opacity-0 md:group-hover:opacity-100 bg-[#09090b] pl-2 shrink-0">
                <button onClick={(e) => { e.stopPropagation(); setItemToMove(file); setShowMoveModal(true); }} className="hover:text-blue-400 p-1" title="Pindahkan File"><FolderInput size={13}/></button>
                <button onClick={(e) => deleteFile(file, e)} className="hover:text-red-400 p-1" title="Hapus File"><Trash2 size={13}/></button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // Kumpulkan daftar semua folder untuk modal "Move To..."
  const allFolders = Array.from(new Set(
    files.map(f => {
      const parts = f.split('/');
      parts.pop(); // Hapus nama file atau .keep
      return parts.join('/');
    }).filter(Boolean)
  )).sort();

  return (
    <>
      {/* 1. OVERLAY MODAL CUSTOM (NEW ITEM) */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setShowNewModal(false)}>
          <div className="bg-[#121214] border border-zinc-800 rounded-lg shadow-xl p-4 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-zinc-200">New {modalType === 'file' ? 'File' : 'Folder'}</h3>
              <button onClick={() => setShowNewModal(false)} className="text-zinc-500 hover:text-zinc-300"><X size={16}/></button>
            </div>
            
            <form onSubmit={handleCreateNewItem} className="flex flex-col gap-3">
              {selectedFolder && <span className="text-xs text-zinc-500 font-mono">Location: {selectedFolder}/</span>}
              <input 
                autoFocus
                type="text" 
                placeholder={modalType === 'file' ? "math.s" : "core"}
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                className="w-full bg-[#0a0a0a] border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500 font-mono"
              />
              <button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white w-full rounded py-2 font-medium text-sm transition-colors">
                Create
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 2. OVERLAY MODAL PEMINDAHAN (MOVE TO) */}
      {showMoveModal && itemToMove && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setShowMoveModal(false)}>
          <div className="bg-[#121214] border border-zinc-800 rounded-lg shadow-xl p-4 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold text-zinc-200 text-sm">Pindahkan: <span className="text-emerald-400 font-mono">{itemToMove.split('/').pop()}</span></h3>
              <button onClick={() => setShowMoveModal(false)} className="text-zinc-500 hover:text-zinc-300"><X size={16}/></button>
            </div>
            <p className="text-xs text-zinc-400 mb-3">Pilih tujuan pemindahan:</p>
            
            <div className="flex flex-col gap-1 max-h-48 overflow-y-auto mb-3 custom-scrollbar border border-zinc-800 rounded p-1 bg-[#0a0a0a]">
              {/* Opsi Ke Root (Luar Folder) */}
              <button 
                onClick={() => moveItem(itemToMove, '')}
                className="flex items-center justify-between w-full px-3 py-2 text-xs text-left text-zinc-300 hover:bg-zinc-800 rounded transition-colors"
              >
                <span className="font-mono text-zinc-400">/ (Root Utama)</span>
                <ArrowRight size={14} className="text-emerald-500" />
              </button>

              {/* Daftar Folder Tujuan */}
              {allFolders.map(folder => (
                <button 
                  key={folder}
                  onClick={() => moveItem(itemToMove, folder)}
                  className="flex items-center justify-between w-full px-3 py-2 text-xs text-left text-zinc-300 hover:bg-zinc-800 rounded transition-colors"
                >
                  <span className="font-mono text-blue-400">{folder}/</span>
                  <ArrowRight size={14} className="text-emerald-500" />
                </button>
              ))}
            </div>
            <button onClick={() => setShowMoveModal(false)} className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded py-1.5 text-xs font-medium transition-colors">
              Batal
            </button>
          </div>
        </div>
      )}

      {/* CONTAINER EXPLORER */}
      <div 
        className="flex flex-col h-full w-full bg-[#09090b]"
        onDragOver={(e) => handleDragOver(e, '')}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, '')}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-900 shrink-0">
          <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Explorer</span>
          <div className="flex gap-1 text-zinc-400">
            <button onClick={() => { setSelectedFolder(''); setModalType('file'); setShowNewModal(true); }} className="hover:text-emerald-400 p-1 rounded transition-colors" title="New File (Root)"><FilePlus size={15} /></button>
            <button onClick={() => { setSelectedFolder(''); setModalType('folder'); setShowNewModal(true); }} className="hover:text-emerald-400 p-1 rounded transition-colors" title="New Folder (Root)"><FolderPlus size={15} /></button>
          </div>
        </div>
        <div className={`flex-1 overflow-y-auto py-2 custom-scrollbar ${dragOverFolder === '' ? 'bg-emerald-500/5' : ''}`}>
          {renderFileTree('')}
        </div>
      </div>
    </>
  );
}