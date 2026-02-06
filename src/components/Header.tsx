import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import {
  ArrowLeft, Save, Share2, Play, Loader2, Settings, LogOut, User, FolderOpen,
  PanelLeftClose, PanelLeftOpen, PanelBottomClose, PanelBottomOpen, BrainCircuit,
  Keyboard, AlignLeft, Server, Cpu, GraduationCap,
} from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

interface HeaderProps {
  mode?: 'dashboard' | 'ide' | 'shared';
  onRun?: () => void;
  onFormat?: () => void;
  projectName?: string;
}

export function Header({ mode = 'dashboard', onRun, onFormat, projectName }: HeaderProps) {
  const navigate = useNavigate();
  const {
    user, logout, saveProject, isDirty, isRunning, lastSaved,
    showFileTree, showConsole, showMemoryPanel,
    toggleFileTree, toggleConsole, toggleMemoryPanel,
    setShowAuthModal, setShowShareModal, currentProject,
    editorFontSize, setEditorFontSize,
    capabilities, learnOcaml,
  } = useStore();

  const [showSettings, setShowSettings] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) setShowSettings(false);
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setShowUserMenu(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="h-12 flex items-center justify-between px-3 bg-ide-sidebar border-b border-ide-border shrink-0 z-40">
      {/* Left side */}
      <div className="flex items-center gap-2">
        {mode === 'ide' || mode === 'shared' ? (
          <button
            onClick={() => navigate('/')}
            className="btn-icon"
            title="Back to Dashboard"
          >
            <ArrowLeft size={18} />
          </button>
        ) : null}

        <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
          <span className="text-xl">🐫</span>
          <span className="font-bold text-base text-gradient hidden sm:block">Caraml</span>
        </div>

        {mode === 'ide' && (
          <>
            <span className="text-slate-600 mx-1">/</span>
            <span className="text-sm font-medium text-slate-300 truncate max-w-[200px]">
              {projectName || currentProject?.name || 'Untitled'}
            </span>
            {isDirty && <span className="w-2 h-2 rounded-full bg-amber-500" title="Unsaved changes" />}
          </>
        )}
      </div>

      {/* Center - IDE Controls */}
      {mode === 'ide' && (
        <div className="flex items-center gap-1">
          <button onClick={onRun} disabled={isRunning} className="btn-primary btn-sm gap-1.5" title="Run (Ctrl+Enter)">
            {isRunning ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            <span className="hidden sm:inline">Run</span>
          </button>
          <button onClick={saveProject} className="btn-secondary btn-sm gap-1.5" title="Save (Ctrl+S)">
            <Save size={14} />
            <span className="hidden sm:inline">Save</span>
          </button>
          {capabilities.ocamlformat && onFormat && (
            <button onClick={onFormat} className="btn-ghost btn-sm gap-1.5" title="Format (Ctrl+Shift+F)">
              <AlignLeft size={14} />
              <span className="hidden sm:inline">Format</span>
            </button>
          )}
          {user && currentProject && (
            <button onClick={() => setShowShareModal(true)} className="btn-ghost btn-sm gap-1.5" title="Share">
              <Share2 size={14} />
              <span className="hidden sm:inline">Share</span>
            </button>
          )}

          <div className="w-px h-6 bg-ide-border mx-1" />

          <button onClick={toggleFileTree} className={`btn-icon ${showFileTree ? 'text-brand-400' : ''}`} title="File Tree">
            {showFileTree ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
          </button>
          <button onClick={toggleConsole} className={`btn-icon ${showConsole ? 'text-brand-400' : ''}`} title="Console">
            {showConsole ? <PanelBottomClose size={16} /> : <PanelBottomOpen size={16} />}
          </button>
          <button onClick={toggleMemoryPanel} className={`btn-icon ${showMemoryPanel ? 'text-brand-400' : ''}`} title="Memory Viewer">
            <BrainCircuit size={16} className={showMemoryPanel ? 'text-brand-400' : ''} />
          </button>
        </div>
      )}

      {/* Right side */}
      <div className="flex items-center gap-2">
        {lastSaved && mode === 'ide' && (
          <span className="text-xs text-slate-500 hidden md:block">
            Saved {new Date(lastSaved).toLocaleTimeString()}
          </span>
        )}

        {mode === 'ide' && (
          <div className="relative" ref={settingsRef}>
            <button onClick={() => setShowSettings(!showSettings)} className="btn-icon" title="Settings">
              <Settings size={16} />
            </button>
            {showSettings && (
              <div className="absolute right-0 top-full mt-1 w-64 bg-slate-800 border border-slate-700 rounded-lg shadow-xl p-3 z-50 animate-fade-in">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Editor Settings</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-slate-300">Font Size</label>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEditorFontSize(Math.max(10, editorFontSize - 1))}
                        className="btn-xs bg-slate-700 hover:bg-slate-600"
                      >-</button>
                      <span className="text-sm text-slate-200 w-8 text-center">{editorFontSize}</span>
                      <button
                        onClick={() => setEditorFontSize(Math.min(24, editorFontSize + 1))}
                        className="btn-xs bg-slate-700 hover:bg-slate-600"
                      >+</button>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-slate-700 space-y-2">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Keyboard size={12} />
                      <span>Ctrl+Enter = Run | Ctrl+S = Save</span>
                    </div>
                    {capabilities.ocamlformat && (
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Keyboard size={12} />
                        <span>Ctrl+Shift+F = Format</span>
                      </div>
                    )}
                    <div className="pt-2 border-t border-slate-700">
                      <div className="text-[10px] uppercase tracking-wider text-slate-600 mb-1.5">Backend</div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-xs">
                          <div className={`w-1.5 h-1.5 rounded-full ${capabilities.ocaml ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                          <span className={capabilities.ocaml ? 'text-slate-300' : 'text-slate-600'}>
                            {capabilities.ocaml ? `OCaml ${capabilities.ocamlVersion?.match(/\d+\.\d+\.\d+/)?.[0] || ''}` : 'OCaml (browser only)'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <div className={`w-1.5 h-1.5 rounded-full ${capabilities.merlin ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                          <span className={capabilities.merlin ? 'text-slate-300' : 'text-slate-600'}>Merlin</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <div className={`w-1.5 h-1.5 rounded-full ${capabilities.ocamlformat ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                          <span className={capabilities.ocamlformat ? 'text-slate-300' : 'text-slate-600'}>ocamlformat</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Learn OCaml indicator */}
        {learnOcaml.connection && mode === 'dashboard' && (
          <button
            onClick={() => navigate('/learn-ocaml')}
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs text-orange-400 hover:bg-orange-500/10 transition-colors"
            title="Learn OCaml Exercises"
          >
            <GraduationCap size={14} />
            <span className="hidden sm:inline">Exercises</span>
          </button>
        )}

        {user ? (
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-xs"
                style={{ backgroundColor: user.avatar_color }}
              >
                {user.username[0].toUpperCase()}
              </div>
              <span className="text-sm text-slate-300 hidden sm:block">{user.username}</span>
            </button>
            {showUserMenu && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 animate-fade-in overflow-hidden">
                <div className="px-3 py-2 border-b border-slate-700">
                  <p className="text-sm font-medium text-slate-200">{user.username}</p>
                  <p className="text-xs text-slate-500">{user.email}</p>
                </div>
                <button
                  onClick={() => { navigate('/'); setShowUserMenu(false); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
                >
                  <FolderOpen size={14} />
                  My Projects
                </button>
                <button
                  onClick={() => { logout(); setShowUserMenu(false); navigate('/'); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-rose-400 hover:bg-slate-700 transition-colors"
                >
                  <LogOut size={14} />
                  Sign Out
                </button>
              </div>
            )}
          </div>
        ) : (
          <button onClick={() => setShowAuthModal(true)} className="btn-primary btn-sm">
            <User size={14} />
            <span>Sign In</span>
          </button>
        )}
      </div>
    </header>
  );
}
