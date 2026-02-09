import { useState, useEffect, useRef } from 'react';
import { useStore } from '../store';
import {
  FileCode, FilePlus, Trash2, Pencil, X, Check,
  FolderOpen, FileText, AlertTriangle,
} from 'lucide-react';
import { Modal } from './Modal';

export function FileTree() {
  const {
    currentProject, activeFile, openFile, createFile, deleteFile, restoreFile, renameFile,
    addNotification, skipDeleteConfirmation, setSkipDeleteConfirmation,
  } = useStore();
  const [isCreating, setIsCreating] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [renamingFile, setRenamingFile] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const fileListRef = useRef<HTMLDivElement>(null);

  const files = currentProject ? Object.keys(currentProject.files).sort() : [];

  const generateDefaultFileName = (): string => {
    const existing = new Set(files);
    let i = 1;
    while (existing.has(`file${i}.ml`)) i++;
    return `file${i}.ml`;
  };

  const handleCreate = () => {
    let name = newFileName.trim();
    if (!name) {
      name = generateDefaultFileName();
    } else if (!name.endsWith('.ml') && !name.endsWith('.mli') && !name.endsWith('.txt')) {
      name += '.ml';
    }
    createFile(name);
    setNewFileName('');
    setIsCreating(false);
  };

  const handleRename = (oldName: string) => {
    if (renameValue.trim() && renameValue.trim() !== oldName) {
      renameFile(oldName, renameValue.trim());
    }
    setRenamingFile(null);
  };

  const executeDelete = (filename: string) => {
    if (!currentProject) return;
    const file = currentProject.files[filename];
    if (!file) return;

    const savedContent = file.content;
    const savedLanguage = file.language;
    deleteFile(filename);

    addNotification('info', `"${filename}" supprim\u00e9`, {
      duration: 3500,
      action: {
        label: 'Annuler',
        onClick: () => restoreFile(filename, savedContent, savedLanguage),
      },
    });
  };

  const requestDelete = (filename: string) => {
    if (files.length <= 1) return;
    if (skipDeleteConfirmation) {
      executeDelete(filename);
    } else {
      setDeleteTarget(filename);
      setDontAskAgain(false);
    }
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    if (dontAskAgain) setSkipDeleteConfirmation(true);
    executeDelete(deleteTarget);
    setDeleteTarget(null);
  };

  // Handle Delete key on the file list
  useEffect(() => {
    const el = fileListRef.current;
    if (!el) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' && activeFile && files.length > 1 && !renamingFile && !isCreating) {
        e.preventDefault();
        requestDelete(activeFile);
      }
    };
    el.addEventListener('keydown', onKeyDown);
    return () => el.removeEventListener('keydown', onKeyDown);
  });

  const getFileIcon = (filename: string) => {
    if (filename.endsWith('.ml')) return <FileCode size={14} className="text-orange-400 shrink-0" />;
    if (filename.endsWith('.mli')) return <FileCode size={14} className="text-blue-400 shrink-0" />;
    return <FileText size={14} className="text-t-muted shrink-0" />;
  };

  return (
    <>
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

        <div
          ref={fileListRef}
          tabIndex={0}
          className="flex-1 overflow-y-auto overflow-x-hidden py-1 focus:outline-none"
        >
          {/* New file input */}
          {isCreating && (
            <div className="flex min-w-0 items-center gap-1 px-2 py-1">
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
                className="min-w-0 flex-1 border border-brand-500 rounded px-1.5 py-0.5 text-xs text-t-secondary focus:outline-none bg-surface-1"
                autoFocus
              />
              <button onClick={handleCreate} className="text-emerald-400 hover:text-emerald-300">
                <Check size={12} />
              </button>
              <button onClick={() => setIsCreating(false)} className="text-t-muted hover:text-t-secondary">
                <X size={12} />
              </button>
            </div>
          )}

          {/* File list */}
          {files.map((filename) => (
            <div
              key={filename}
              className={`group flex min-w-0 items-center gap-1.5 px-3 py-1.5 cursor-pointer text-sm transition-colors ${activeFile === filename
                  ? 'bg-ide-active text-t-primary border-r-2 border-brand-500'
                  : 'text-t-muted hover:text-t-secondary hover:bg-ide-hover'
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
                  className="min-w-0 flex-1 border border-brand-500 rounded px-1.5 py-0 text-xs text-t-secondary focus:outline-none bg-surface-1"
                  autoFocus
                />
              ) : (
                <span className="min-w-0 flex-1 text-xs truncate leading-4">{filename}</span>
              )}

              {/* File actions (shown on hover) */}
              {renamingFile !== filename && (
                <div className="shrink-0 w-10 flex justify-end">
                  <div className="hidden group-hover:flex items-center gap-0.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenamingFile(filename);
                        setRenameValue(filename);
                      }}
                      className="p-0.5 text-t-faint hover:text-t-secondary rounded"
                      title="Rename"
                    >
                      <Pencil size={11} />
                    </button>
                    {files.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          requestDelete(filename);
                        }}
                        className="p-0.5 text-t-faint hover:text-rose-400 rounded"
                        title="Delete"
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Delete confirmation modal */}
      <Modal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Supprimer le fichier"
        icon={<div className="p-2 rounded-lg bg-rose-500/10"><AlertTriangle size={20} className="text-rose-400" /></div>}
        className="max-w-sm"
      >
        <div className="p-6 pt-4 space-y-4">
          <p className="text-sm text-t-secondary">
            Voulez-vous vraiment supprimer <strong className="text-t-primary">{deleteTarget}</strong> ?
          </p>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dontAskAgain}
              onChange={(e) => setDontAskAgain(e.target.checked)}
              className="rounded border-surface-3 bg-surface-1 text-brand-500 focus:ring-brand-500 focus:ring-offset-0 w-3.5 h-3.5"
            />
            <span className="text-xs text-t-muted">Ne plus demander</span>
          </label>
          <div className="flex justify-end gap-2">
            <button onClick={() => setDeleteTarget(null)} className="btn-secondary btn-sm">
              Annuler
            </button>
            <button onClick={confirmDelete} className="btn-danger btn-sm">
              <Trash2 size={14} />
              Supprimer
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
