import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { Header } from '../components/Header';
import { AuthModal } from '../components/AuthModal';
import { NewProjectModal } from '../components/NewProjectModal';
import { LearnOcamlModal } from '../components/LearnOcamlModal';
import {
  Plus, FolderOpen, Trash2, Share2, Clock, Code, Loader2,
  Search, BookOpen, Sparkles, ArrowRight, ExternalLink,
  GraduationCap, Zap, Globe, CheckCircle2, ChevronRight, Trophy,
} from 'lucide-react';

export function DashboardPage() {
  const navigate = useNavigate();
  const {
    user, projects, loadProjects, deleteProject, isProjectLoading,
    setShowAuthModal, setShowNewProjectModal, addNotification,
    learnOcaml, setShowLearnOcamlModal, learnOcamlRestoreConnection,
    learnOcamlLoadExercises,
  } = useStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (user) loadProjects();
    // Restore Learn OCaml connection from localStorage
    learnOcamlRestoreConnection();
  }, [user, loadProjects]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Delete this project? This action cannot be undone.')) return;
    setDeletingId(id);
    try {
      await deleteProject(id);
      addNotification('success', 'Project deleted');
    } catch {
      addNotification('error', 'Failed to delete project');
    } finally {
      setDeletingId(null);
    }
  };

  const filteredProjects = projects.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  };

  return (
    <div className="h-screen flex flex-col bg-ide-bg">
      <Header mode="dashboard" />

      <div className="flex-1 overflow-auto">
        {!user ? (
          /* Landing page for unauthenticated users */
          <div className="max-w-6xl mx-auto px-4 py-12">
            {/* Hero */}
            <div className="text-center mb-16">
              <div className="text-6xl mb-6">🐫</div>
              <h1 className="text-4xl sm:text-5xl font-bold text-slate-100 mb-4">
                <span className="text-gradient">CamelCode</span>
              </h1>
              <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-8">
                Professional OCaml IDE in your browser. Write, run, debug, and share
                OCaml code with memory visualization — no setup required.
              </p>
              <div className="flex items-center justify-center gap-4">
                <button onClick={() => setShowAuthModal(true)} className="btn-primary text-base px-8 py-3">
                  Get Started <ArrowRight size={18} />
                </button>
              </div>
            </div>

            {/* Features */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
              {[
                {
                  icon: Code,
                  title: 'VSCode-like Editor',
                  description: 'Monaco-powered editor with syntax highlighting, autocomplete, and error detection.',
                  color: 'text-brand-400',
                },
                {
                  icon: Zap,
                  title: 'Instant Execution',
                  description: 'Run OCaml code directly in your browser with our built-in interpreter.',
                  color: 'text-amber-400',
                },
                {
                  icon: BookOpen,
                  title: 'Memory Visualization',
                  description: 'Visualize stack frames, heap objects, and variable bindings in real time.',
                  color: 'text-emerald-400',
                },
                {
                  icon: FolderOpen,
                  title: 'Project Management',
                  description: 'Create, save, and organize your OCaml projects with multiple files.',
                  color: 'text-violet-400',
                },
                {
                  icon: Share2,
                  title: 'Share & Collaborate',
                  description: 'Share projects with a public link. Fork shared projects to build on others\' work.',
                  color: 'text-rose-400',
                },
                {
                  icon: GraduationCap,
                  title: 'Learn OCaml',
                  description: 'Perfect for students and professionals learning functional programming.',
                  color: 'text-orange-400',
                },
              ].map((feature, i) => {
                const Icon = feature.icon;
                return (
                  <div key={i} className="panel p-6 hover:border-slate-600 transition-colors">
                    <Icon size={24} className={`${feature.color} mb-3`} />
                    <h3 className="font-semibold text-slate-200 mb-2">{feature.title}</h3>
                    <p className="text-sm text-slate-400">{feature.description}</p>
                  </div>
                );
              })}
            </div>

            {/* Example Code */}
            <div className="panel p-6 max-w-2xl mx-auto">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles size={16} className="text-brand-400" />
                <h3 className="font-semibold text-slate-200">Try it out</h3>
              </div>
              <pre className="font-mono text-sm text-slate-400 leading-relaxed">
                <code>{`(* Pattern matching & recursion *)
let rec fibonacci = function
  | 0 -> 0
  | 1 -> 1
  | n -> fibonacci (n - 1) + fibonacci (n - 2)

let () =
  List.init 10 fibonacci
  |> List.iter (fun n ->
    Printf.printf "%d " n);
  print_newline ()`}</code>
              </pre>
            </div>
          </div>
        ) : (
          /* Dashboard for authenticated users */
          <div className="max-w-6xl mx-auto px-4 py-8">
            {/* ── Learn OCaml Section ──────────────────────────────────────── */}
            <div className="mb-8">
              {learnOcaml.connection ? (
                /* Connected: show quick access card */
                <div
                  onClick={() => navigate('/learn-ocaml')}
                  className="panel p-5 cursor-pointer hover:border-orange-500/30 hover:glow-sm transition-all group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center">
                        <GraduationCap size={24} className="text-orange-400" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-200 flex items-center gap-2">
                          Learn OCaml
                          <span className="badge badge-success text-[10px]">
                            <CheckCircle2 size={10} className="mr-0.5" /> Connected
                          </span>
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {learnOcaml.connection.serverUrl.replace(/https?:\/\//, '')}
                          {learnOcaml.connection.nickname && (
                            <span className="text-slate-400"> &middot; {learnOcaml.connection.nickname}</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {Object.keys(learnOcaml.grades).length > 0 && (
                        <div className="flex items-center gap-2 text-sm text-slate-400">
                          <Trophy size={14} className="text-amber-400" />
                          <span>
                            {Object.values(learnOcaml.grades).filter((g) => g >= 100).length} completed
                          </span>
                        </div>
                      )}
                      <ChevronRight
                        size={18}
                        className="text-slate-600 group-hover:text-orange-400 transition-colors"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                /* Not connected: show connect prompt */
                <div className="panel p-5 border-dashed">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center">
                        <GraduationCap size={24} className="text-orange-400/60" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-300">Learn OCaml Integration</h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Connect your university Learn OCaml account to access exercises and submit directly from CamelCode
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowLearnOcamlModal(true); }}
                      className="btn-secondary btn-sm shrink-0"
                    >
                      <Globe size={14} />
                      Connect
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Header section */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
              <div>
                <h1 className="text-2xl font-bold text-slate-100">Your Projects</h1>
                <p className="text-sm text-slate-400 mt-1">
                  {projects.length} project{projects.length !== 1 ? 's' : ''}
                </p>
              </div>
              <button
                onClick={() => setShowNewProjectModal(true)}
                className="btn-primary"
              >
                <Plus size={16} />
                New Project
              </button>
            </div>

            {/* Search */}
            {projects.length > 3 && (
              <div className="relative mb-6">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input pl-10 max-w-md"
                  placeholder="Search projects..."
                />
              </div>
            )}

            {/* Loading */}
            {isProjectLoading && projects.length === 0 ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="animate-spin text-brand-400" size={32} />
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="text-center py-20">
                {searchQuery ? (
                  <>
                    <Search size={48} className="mx-auto text-slate-700 mb-4" />
                    <p className="text-lg text-slate-400">No projects matching "{searchQuery}"</p>
                  </>
                ) : (
                  <>
                    <FolderOpen size={48} className="mx-auto text-slate-700 mb-4" />
                    <p className="text-lg text-slate-400 mb-4">No projects yet</p>
                    <button
                      onClick={() => setShowNewProjectModal(true)}
                      className="btn-primary"
                    >
                      <Plus size={16} />
                      Create Your First Project
                    </button>
                  </>
                )}
              </div>
            ) : (
              /* Project Grid */
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredProjects.map((project) => (
                  <div
                    key={project.id}
                    onClick={() => navigate(`/ide/${project.id}`)}
                    className="panel p-5 cursor-pointer hover:border-slate-600 hover:glow-sm transition-all group"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Code size={16} className="text-orange-400" />
                        <h3 className="font-semibold text-slate-200 truncate">{project.name}</h3>
                      </div>
                      {project.is_public ? (
                        <span className="badge-info text-[10px]">
                          <ExternalLink size={10} className="mr-0.5" /> Shared
                        </span>
                      ) : null}
                    </div>

                    {project.description && (
                      <p className="text-sm text-slate-500 mb-3 line-clamp-2">{project.description}</p>
                    )}

                    <div className="flex items-center justify-between mt-auto pt-3 border-t border-slate-800">
                      <div className="flex items-center gap-1 text-xs text-slate-600">
                        <Clock size={12} />
                        <span>{formatDate(project.updated_at)}</span>
                      </div>

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => handleDelete(e, project.id)}
                          disabled={deletingId === project.id}
                          className="p-1.5 rounded-md text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                          title="Delete"
                        >
                          {deletingId === project.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Trash2 size={14} />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <AuthModal />
      <NewProjectModal />
      <LearnOcamlModal />
    </div>
  );
}
