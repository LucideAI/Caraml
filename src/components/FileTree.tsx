import { useState } from 'react';
import { useStore } from '../store';
import {
  FileCode, FilePlus, Trash2, Pencil, X, Check,
  FolderOpen, FileText,
} from 'lucide-react';

export function FileTree() {
  const {
    currentProject, activeFile, openFile, createFile, deleteFile, renameFile,
  } = useStore();
  const [isCreating, setIsCreating] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [renamingFile, setRenamingFile] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const files = currentProject ? Object.keys(currentProject.files).sort() : [];

  const handleCreate = () => {
    if (newFileName.trim()) {
      let name = newFileName.trim();
      if (!name.endsWith('.ml') && !name.endsWith('.mli') && !name.endsWith('.txt')) {
        name += '.ml';
      }
      createFile(name);
      setNewFileName('');
      setIsCreating(false);
    }
  };

  const handleRename = (oldName: string) => {
    if (renameValue.trim() && renameValue.trim() !== oldName) {
      renameFile(oldName, renameValue.trim());
    }
    setRenamingFile(null);
  };

  const handleDelete = (filename: string) => {
    if (files.length <= 1) return; // Don't delete last file
    if (confirm(`Delete ${filename}?`)) {
      deleteFile(filename);
    }
  };

  const getFileIcon = (filename: string) => {
    if (filename.endsWith('.ml')) return <FileCode size={14} className="text-orange-400" />;
    if (filename.endsWith('.mli')) return <FileCode size={14} className="text-blue-400" />;
    return <FileText size={14} className="text-slate-400" />;
  };

  return (
    <div className="flex flex-col h-full bg-ide-sidebar">
      <div className="panel-header">
        <div className="flex items-center gap-2">
          <FolderOpen size={12} />
          <span>Files</span>
        </div>
        <button
          onClick={() => setIsCreating(true)}
          className="btn-icon p-1"
          title="New File"
        >
          <FilePlus size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-auto py-1">
        {/* New file input */}
        {isCreating && (
          <div className="flex items-center gap-1 px-2 py-1">
            <FileCode size={14} className="text-orange-400 shrink-0" />
            <input
              type="text"
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
                if (e.key === 'Escape') setIsCreating(false);
              }}
              placeholder="filename.ml"
              className="flex-1 bg-slate-800 border border-brand-500 rounded px-1.5 py-0.5 text-xs text-slate-200 focus:outline-none"
              autoFocus
            />
            <button onClick={handleCreate} className="text-emerald-400 hover:text-emerald-300">
              <Check size={12} />
            </button>
            <button onClick={() => setIsCreating(false)} className="text-slate-400 hover:text-slate-300">
              <X size={12} />
            </button>
          </div>
        )}

        {/* File list */}
        {files.map((filename) => (
          <div
            key={filename}
            className={`group flex items-start gap-1.5 px-3 py-1.5 cursor-pointer text-sm transition-colors ${
              activeFile === filename
                ? 'bg-ide-active text-slate-100 border-r-2 border-brand-500'
                : 'text-slate-400 hover:text-slate-200 hover:bg-ide-hover'
            }`}
            onClick={() => openFile(filename)}
          >
            {getFileIcon(filename)}

            {renamingFile === filename ? (
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename(filename);
                  if (e.key === 'Escape') setRenamingFile(null);
                }}
                onBlur={() => handleRename(filename)}
                className="flex-1 bg-slate-800 border border-brand-500 rounded px-1.5 py-0 text-xs text-slate-200 focus:outline-none"
                autoFocus
              />
            ) : (
              <span className="flex-1 text-xs whitespace-normal break-words leading-4">{filename}</span>
            )}

            {/* File actions (shown on hover) */}
            {renamingFile !== filename && (
              <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setRenamingFile(filename);
                    setRenameValue(filename);
                  }}
                  className="p-0.5 text-slate-500 hover:text-slate-300 rounded"
                  title="Rename"
                >
                  <Pencil size={11} />
                </button>
                {files.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(filename);
                    }}
                    className="p-0.5 text-slate-500 hover:text-rose-400 rounded"
                    title="Delete"
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
