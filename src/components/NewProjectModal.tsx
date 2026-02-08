import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { X, Loader2, FolderPlus, Code, Sparkles, BookOpen } from 'lucide-react';

const templates = [
  {
    id: 'blank',
    name: 'Blank Project',
    description: 'Start from scratch',
    icon: FolderPlus,
    color: 'text-t-muted',
  },
  {
    id: 'algorithms',
    name: 'Algorithms',
    description: 'Data structures & algorithms',
    icon: Code,
    color: 'text-emerald-400',
  },
  {
    id: 'functional',
    name: 'Functional Patterns',
    description: 'FP patterns & techniques',
    icon: Sparkles,
    color: 'text-violet-400',
  },
];

export function NewProjectModal() {
  const navigate = useNavigate();
  const { showNewProjectModal, setShowNewProjectModal, createProject, addNotification } = useStore();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [template, setTemplate] = useState('blank');
  const [isLoading, setIsLoading] = useState(false);

  if (!showNewProjectModal) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsLoading(true);
    try {
      const project = await createProject(
        name.trim(),
        description.trim(),
        template !== 'blank' ? template : undefined
      );
      setShowNewProjectModal(false);
      setName('');
      setDescription('');
      setTemplate('blank');
      addNotification('success', 'Project created!');
      navigate(`/ide/${project.id}`);
    } catch (err: any) {
      addNotification('error', err.message || 'Failed to create project');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={() => setShowNewProjectModal(false)}>
      <div className="modal-content w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 pb-4">
          <div>
            <h2 className="text-xl font-bold text-t-primary">New Project</h2>
            <p className="text-sm text-t-muted mt-1">Create a new OCaml project</p>
          </div>
          <button onClick={() => setShowNewProjectModal(false)} className="btn-icon">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleCreate} className="px-6 pb-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-t-secondary mb-1.5">Project Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              placeholder="My OCaml Project"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-t-secondary mb-1.5">Description (optional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input"
              placeholder="A brief description..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-t-secondary mb-2">Template</label>
            <div className="grid grid-cols-3 gap-2">
              {templates.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTemplate(t.id)}
                    className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-all text-center ${
                      template === t.id
                        ? 'border-brand-500 bg-brand-500/10'
                        : 'border-ide-border hover:border-surface-3 bg-surface-1'
                    }`}
                  >
                    <Icon size={20} className={template === t.id ? 'text-brand-400' : t.color} />
                    <div>
                      <div className="text-xs font-medium text-t-secondary">{t.name}</div>
                      <div className="text-[10px] text-t-faint mt-0.5">{t.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <button type="submit" disabled={isLoading || !name.trim()} className="btn-primary w-full py-3">
            {isLoading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <>
                <FolderPlus size={16} />
                Create Project
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
