import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Folder as FolderIcon, File as FileIcon, Trash2, X, FilePlus, FolderPlus, FolderInput, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface FileExplorerProps {
  files: string[];
  setFiles: React.Dispatch<React.SetStateAction<string[]>>;
  activeFile: string;
  setActiveFile: (file: string) => void;
  fileContents: Record<string, string>;
  setFileContents: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  triggerAlert: (title: string, message: string, variant: "default" | "destructive") => void; // Prop Baru!
}

export function FileExplorer({
  files, setFiles, activeFile, setActiveFile, fileContents, setFileContents, triggerAlert
}: FileExplorerProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['']));
  const [selectedFolder, setSelectedFolder] = useState('');

  // States untuk Modal "Add New" (Card)
  const [showNewModal, setShowNewModal] = useState(false);
  const [modalType, setModalType] = useState<'file' | 'folder'>('file');
  const [newItemName, setNewItemName] = useState('');

  // States untuk Modal "Move To" (Card)
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [itemToMove, setItemToMove] = useState<string | null>(null);

  // States untuk Modal "Delete" (Card)
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  // Drag & Drop Feedback State (Desktop)
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);

  // =======================================================================
  // LOGIKA DRAG AND DROP (DESKTOP)
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
    if (dragOverFolder !== targetFolder) setDragOverFolder(targetFolder);
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
  // LOGIKA PEMINDAHAN (Dipakai Desktop Drag-Drop & Mobile Card)
  // =======================================================================
  const moveItem = (sourcePath: string, targetFolder: string) => {
    if (!sourcePath || sourcePath === targetFolder) return;
    
    if (targetFolder === sourcePath || targetFolder.startsWith(sourcePath + '/')) {
      triggerAlert("Action Failed", "Cannot move a folder into itself.", "destructive");
      return;
    }

    const itemName = sourcePath.split('/').pop() || '';
    const newPath = targetFolder === '' ? itemName : `${targetFolder}/${itemName}`;
    
    if (files.some(f => f === newPath || f.startsWith(newPath + '/'))) {
      triggerAlert("Conflict", "An item with the same name already exists in the destination.", "destructive");
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
    
    setShowMoveModal(false);
    setItemToMove(null);
    triggerAlert("Moved", `Successfully moved ${itemName}.`, "default");
  };

  // =======================================================================
  // LOGIKA PEMBUATAN & PENGHAPUSAN
  // =======================================================================
  const handleCreateNewItem = (e?: React.FormEvent | React.KeyboardEvent) => {
    if (e) e.preventDefault();

    const rawName = newItemName.trim();
    if (!rawName) return;
    
    let fullPath = selectedFolder ? `${selectedFolder}/${rawName}` : rawName;
    if (modalType === 'file' && !fullPath.endsWith('.s')) fullPath += '.s';
    if (modalType === 'folder') fullPath += '/.keep'; 

    if (files.includes(fullPath)) {
      triggerAlert("Duplicate Name", "File or folder already exists.", "destructive");
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
    triggerAlert("Created", `${fullPath.replace('/.keep', '')} was successfully created.`, "default");
  };

  const confirmDelete = () => {
    if (!itemToDelete) return;
    const filename = itemToDelete;

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

    setItemToDelete(null);
    triggerAlert("Deleted", `${filename.split('/').pop()} has been deleted.`, "default");
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
  // RENDER POHON DIREKTORI
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
          if (parts[0] !== '.keep') immediateFiles.add(f);
        } else {
          immediateFolders.add(prefix + parts[0]);
        }
      }
    });

    const sortedFolders = Array.from(immediateFolders).sort();
    const sortedFiles = Array.from(immediateFiles).sort();

    return (
      <div className="flex flex-col w-full" style={{ paddingLeft: level === 0 ? '0' : '14px' }}>
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
                className={`group flex items-center justify-between px-2 py-1.5 cursor-pointer transition-colors ${isDragOver ? 'bg-emerald-500/20 ring-1 ring-emerald-500 rounded' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'}`}
                onClick={(e) => toggleFolder(folder, e)}
              >
                <div className="flex items-center gap-1.5 overflow-hidden">
                  {isExpanded ? <ChevronDown size={14} className="shrink-0" /> : <ChevronRight size={14} className="shrink-0" />}
                  <FolderIcon size={14} className="text-blue-400 shrink-0" />
                  <span className="text-sm truncate select-none">{folderName}</span>
                </div>
                <div className="flex items-center gap-0.5 opacity-80 md:opacity-0 md:group-hover:opacity-100 bg-[#09090b] pl-2 shrink-0">
                  <button onClick={(e) => { e.stopPropagation(); setItemToMove(folder); setShowMoveModal(true); }} className="hover:text-blue-400 p-1" title="Move Folder"><FolderInput size={13}/></button>
                  <button onClick={(e) => { e.stopPropagation(); setSelectedFolder(folder); setModalType('file'); setShowNewModal(true); }} className="hover:text-emerald-400 p-1" title="New File"><FilePlus size={13}/></button>
                  <button onClick={(e) => { e.stopPropagation(); setSelectedFolder(folder); setModalType('folder'); setShowNewModal(true); }} className="hover:text-emerald-400 p-1" title="New Folder"><FolderPlus size={13}/></button>
                  <button onClick={(e) => { e.stopPropagation(); setItemToDelete(folder); }} className="hover:text-red-400 p-1" title="Delete Folder"><Trash2 size={13}/></button>
                </div>
              </div>
              {isExpanded && renderFileTree(folder, level + 1)}
            </div>
          );
        })}
        
        {sortedFiles.map(file => {
          const fileName = file.split('/').pop();
          const isActive = activeFile === file;
          return (
            <div 
              key={file} 
              draggable
              onDragStart={(e) => handleDragStart(e, file)}
              onClick={() => setActiveFile(file)}
              className={`group flex items-center justify-between px-2 py-1.5 cursor-pointer transition-colors ${isActive ? 'bg-emerald-500/10 text-emerald-400' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'}`}
            >
              <div className="flex items-center gap-1.5 overflow-hidden pl-5">
                <FileIcon size={13} className={`shrink-0 ${isActive ? "text-emerald-500" : "text-zinc-500"}`} />
                <span className="text-sm truncate select-none">{fileName}</span>
              </div>
              <div className="flex items-center gap-0.5 opacity-80 md:opacity-0 md:group-hover:opacity-100 bg-[#09090b] pl-2 shrink-0">
                <button onClick={(e) => { e.stopPropagation(); setItemToMove(file); setShowMoveModal(true); }} className="hover:text-blue-400 p-1" title="Move File"><FolderInput size={13}/></button>
                <button onClick={(e) => { 
                  e.stopPropagation(); 
                  if (files.length === 1 && files[0] === file) triggerAlert("Error", "Cannot delete the last remaining file.", "destructive");
                  else setItemToDelete(file); 
                }} className="hover:text-red-400 p-1" title="Delete File"><Trash2 size={13}/></button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const allFolders = Array.from(new Set(
    files.map(f => {
      const parts = f.split('/');
      parts.pop(); 
      return parts.join('/');
    }).filter(Boolean)
  )).sort();

  return (
    <>
      {/* 1. MODAL (SHADCN CARD) UNTUK NEW ITEM */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in" onClick={() => setShowNewModal(false)}>
          <Card className="w-full max-w-sm bg-[#121214] border-zinc-800 text-zinc-200 shadow-2xl" onClick={e => e.stopPropagation()}>
            <CardHeader className="pb-3 border-b border-zinc-800/50">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-lg">Create New {modalType === 'file' ? 'File' : 'Folder'}</CardTitle>
                  <CardDescription className="text-zinc-500 mt-1">
                    {selectedFolder ? `Location: ${selectedFolder}/` : 'Location: / (Root)'}
                  </CardDescription>
                </div>
                <button onClick={() => setShowNewModal(false)} className="text-zinc-500 hover:text-zinc-300 bg-zinc-900/50 p-1 rounded-full"><X size={16}/></button>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <form onSubmit={handleCreateNewItem} className="flex flex-col gap-4">
                <Input autoFocus type="text" placeholder={modalType === 'file' ? "utils.s" : "core"} value={newItemName} onChange={(e) => setNewItemName(e.target.value)} className="w-full bg-[#0a0a0a] border border-zinc-700 focus-visible:ring-emerald-500 font-mono" />
                <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-white shadow-md">Create {modalType === 'file' ? 'File' : 'Folder'}</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 2. MODAL (SHADCN CARD) UNTUK MOVE TO */}
      {showMoveModal && itemToMove && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in" onClick={() => setShowMoveModal(false)}>
          <Card className="w-full max-w-sm bg-[#121214] border-zinc-800 text-zinc-200 shadow-2xl" onClick={e => e.stopPropagation()}>
            <CardHeader className="pb-3 border-b border-zinc-800/50">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-lg">Move Item</CardTitle>
                  <CardDescription className="text-zinc-500 mt-1 break-all">
                    Moving <span className="text-emerald-400 font-mono">{itemToMove.split('/').pop()}</span>
                  </CardDescription>
                </div>
                <button onClick={() => setShowMoveModal(false)} className="text-zinc-500 hover:text-zinc-300 bg-zinc-900/50 p-1 rounded-full"><X size={16}/></button>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="flex flex-col gap-1 max-h-48 overflow-y-auto custom-scrollbar border border-zinc-800/50 rounded-md p-1 bg-[#0a0a0a]">
                <button onClick={() => moveItem(itemToMove, '')} className="flex items-center justify-between w-full px-3 py-2.5 text-xs text-left text-zinc-300 hover:bg-zinc-800 rounded transition-colors group">
                  <span className="font-mono text-zinc-400 font-semibold">/ (Root)</span>
                  <ArrowRight size={14} className="text-zinc-600 group-hover:text-emerald-500 transition-colors" />
                </button>
                {allFolders.map(folder => (
                  <button key={folder} onClick={() => moveItem(itemToMove, folder)} className="flex items-center justify-between w-full px-3 py-2.5 text-xs text-left text-zinc-300 hover:bg-zinc-800 rounded transition-colors group">
                    <span className="font-mono text-blue-400">{folder}/</span>
                    <ArrowRight size={14} className="text-zinc-600 group-hover:text-emerald-500 transition-colors" />
                  </button>
                ))}
              </div>
            </CardContent>
            <CardFooter>
              <Button variant="outline" onClick={() => setShowMoveModal(false)} className="w-full border-zinc-700 text-zinc-300 hover:bg-zinc-800">Cancel</Button>
            </CardFooter>
          </Card>
        </div>
      )}

      {/* 3. MODAL (SHADCN CARD) UNTUK DELETE CONFIRMATION */}
      {itemToDelete && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in zoom-in-95" onClick={() => setItemToDelete(null)}>
          <Card className="w-full max-w-sm bg-[#121214] border-red-900/30 text-zinc-200 shadow-2xl" onClick={e => e.stopPropagation()}>
            <CardHeader>
              <CardTitle className="text-red-400 flex items-center gap-2">
                <Trash2 size={20} /> Confirm Deletion
              </CardTitle>
              <CardDescription className="text-zinc-400 text-sm leading-relaxed mt-2">
                Are you sure you want to delete <span className="text-zinc-100 font-mono bg-zinc-800 px-1 py-0.5 rounded">{itemToDelete.split('/').pop()}</span>? 
                <br/>This action cannot be undone.
              </CardDescription>
            </CardHeader>
            <CardFooter className="flex justify-end gap-3 pt-2 bg-transparent border-none pb-4">
              <Button 
                variant="outline" 
                className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white" 
                onClick={() => setItemToDelete(null)}
              >
                Cancel
              </Button>
              <Button 
                className="bg-red-600 hover:bg-red-700 text-white border-none" 
                onClick={confirmDelete}
              >
                Delete Permanently
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}

      {/* CONTAINER EXPLORER */}
      <div className="flex flex-col h-full w-full bg-[#09090b]" onDragOver={(e) => handleDragOver(e, '')} onDragLeave={handleDragLeave} onDrop={(e) => handleDrop(e, '')}>
        <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-900 shrink-0 bg-[#0d0d0d]">
          <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Explorer</span>
          <div className="flex gap-1 text-zinc-400">
            <button onClick={() => { setSelectedFolder(''); setModalType('file'); setShowNewModal(true); }} className="hover:text-emerald-400 p-1.5 rounded bg-zinc-900/50 hover:bg-zinc-800 transition-colors border border-zinc-800/50" title="New File in Root"><FilePlus size={14} /></button>
            <button onClick={() => { setSelectedFolder(''); setModalType('folder'); setShowNewModal(true); }} className="hover:text-emerald-400 p-1.5 rounded bg-zinc-900/50 hover:bg-zinc-800 transition-colors border border-zinc-800/50" title="New Folder in Root"><FolderPlus size={14} /></button>
          </div>
        </div>
        <div className={`flex-1 overflow-y-auto py-2 custom-scrollbar ${dragOverFolder === '' ? 'bg-emerald-500/5' : ''}`}>
          {renderFileTree('')}
        </div>
      </div>
    </>
  );
}