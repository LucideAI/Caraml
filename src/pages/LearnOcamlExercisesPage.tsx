import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { Header } from '../components/Header';
import { LearnOcamlModal } from '../components/LearnOcamlModal';
import type { LearnOcamlExerciseGroup, LearnOcamlExerciseIndexEntry } from '../types';
import {
  ArrowLeft, Loader2, RefreshCw, ChevronRight, ChevronDown,
  Star, CheckCircle2, Circle, AlertCircle, GraduationCap,
  BookOpen, Search, Unplug, Globe, Trophy, BarChart3,
} from 'lucide-react';

// ── Helpers ──────────────────────────────────────────────────────────────────

function isGroup(item: LearnOcamlExerciseGroup | LearnOcamlExerciseIndexEntry): item is LearnOcamlExerciseGroup {
  return 'children' in item && 'title' in item && !('id' in item);
}

function isExercise(item: LearnOcamlExerciseGroup | LearnOcamlExerciseIndexEntry): item is LearnOcamlExerciseIndexEntry {
  return 'id' in item;
}

function flattenExercises(items: (LearnOcamlExerciseGroup | LearnOcamlExerciseIndexEntry)[]): LearnOcamlExerciseIndexEntry[] {
  const result: LearnOcamlExerciseIndexEntry[] = [];
  for (const item of items) {
    if (isExercise(item)) {
      result.push(item);
    } else if (isGroup(item) && item.children) {
      result.push(...flattenExercises(item.children));
    }
  }
  return result;
}

// ── Stars Component ──────────────────────────────────────────────────────────

function DifficultyStars({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4].map((i) => (
        <Star
          key={i}
          size={10}
          className={i <= count ? 'text-amber-400 fill-amber-400' : 'text-slate-700'}
        />
      ))}
    </div>
  );
}

// ── Grade Badge ──────────────────────────────────────────────────────────────

function GradeBadge({ grade }: { grade?: number | null }) {
  if (grade === null || grade === undefined) {
    return (
      <span className="flex items-center gap-1 text-xs text-slate-600">
        <Circle size={12} />
        Not attempted
      </span>
    );
  }
  if (grade >= 100) {
    return (
      <span className="flex items-center gap-1 text-xs text-emerald-400 font-medium">
        <CheckCircle2 size={12} className="fill-emerald-400/20" />
        {Math.round(grade)}%
      </span>
    );
  }
  if (grade > 0) {
    return (
      <span className="flex items-center gap-1 text-xs text-amber-400 font-medium">
        <AlertCircle size={12} />
        {Math.round(grade)}%
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs text-rose-400 font-medium">
      <AlertCircle size={12} />
      {Math.round(grade)}%
    </span>
  );
}

// ── Exercise Group Component ─────────────────────────────────────────────────

function ExerciseGroup({
  group,
  grades,
  searchQuery,
  onExerciseClick,
  depth = 0,
}: {
  group: LearnOcamlExerciseGroup;
  grades: Record<string, number>;
  searchQuery: string;
  onExerciseClick: (id: string) => void;
  depth?: number;
}) {
  const [isOpen, setIsOpen] = useState(depth < 2);

  // Count stats for this group
  const allExercises = flattenExercises(group.children);
  const completed = allExercises.filter((e) => (grades[e.id] ?? -1) >= 100).length;
  const attempted = allExercises.filter((e) => grades[e.id] !== undefined && grades[e.id] !== null).length;
  const total = allExercises.length;

  // Filter by search
  const hasMatchingChildren = searchQuery
    ? allExercises.some(
        (e) =>
          e.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (e.title || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : true;

  if (!hasMatchingChildren) return null;

  return (
    <div className={depth > 0 ? 'ml-3 border-l border-slate-800 pl-3' : ''}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 w-full py-2.5 px-3 rounded-lg hover:bg-slate-800/50 transition-colors group text-left"
      >
        {isOpen ? (
          <ChevronDown size={14} className="text-slate-500 shrink-0" />
        ) : (
          <ChevronRight size={14} className="text-slate-500 shrink-0" />
        )}
        <BookOpen size={14} className="text-brand-400 shrink-0" />
        <span className="text-sm font-medium text-slate-200 flex-1 truncate">
          {group.title}
        </span>
        <span className="text-xs text-slate-500 shrink-0">
          {completed}/{total}
        </span>
        {total > 0 && (
          <div className="w-16 h-1.5 bg-slate-800 rounded-full shrink-0 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${(completed / total) * 100}%` }}
            />
          </div>
        )}
      </button>

      {isOpen && (
        <div className="mt-1 space-y-0.5">
          {group.children.map((child, i) => {
            if (isGroup(child)) {
              return (
                <ExerciseGroup
                  key={`group-${i}`}
                  group={child}
                  grades={grades}
                  searchQuery={searchQuery}
                  onExerciseClick={onExerciseClick}
                  depth={depth + 1}
                />
              );
            }
            if (isExercise(child)) {
              // Filter by search
              if (
                searchQuery &&
                !child.id.toLowerCase().includes(searchQuery.toLowerCase()) &&
                !(child.title || '').toLowerCase().includes(searchQuery.toLowerCase())
              ) {
                return null;
              }

              const grade = grades[child.id];

              return (
                <button
                  key={child.id}
                  onClick={() => onExerciseClick(child.id)}
                  className="flex items-center gap-3 w-full py-2.5 px-3 ml-5 rounded-lg hover:bg-slate-800/60 hover:border-slate-700 transition-all group text-left border border-transparent"
                >
                  {/* Grade indicator */}
                  <div className="shrink-0">
                    {grade !== undefined && grade !== null && grade >= 100 ? (
                      <CheckCircle2 size={16} className="text-emerald-400" />
                    ) : grade !== undefined && grade !== null && grade > 0 ? (
                      <div className="relative">
                        <Circle size={16} className="text-amber-500" />
                        <div className="absolute inset-0 flex items-center justify-center text-[7px] font-bold text-amber-500">
                          {Math.round(grade)}
                        </div>
                      </div>
                    ) : (
                      <Circle size={16} className="text-slate-700 group-hover:text-slate-600" />
                    )}
                  </div>

                  {/* Exercise info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-slate-300 group-hover:text-slate-100 truncate">
                      {child.title || child.id}
                    </div>
                    {child.short_description && (
                      <div className="text-xs text-slate-500 truncate mt-0.5">
                        {child.short_description}
                      </div>
                    )}
                  </div>

                  {/* Difficulty */}
                  {child.stars !== undefined && child.stars > 0 && (
                    <DifficultyStars count={child.stars} />
                  )}

                  {/* Arrow */}
                  <ChevronRight
                    size={14}
                    className="text-slate-700 group-hover:text-slate-400 shrink-0 transition-colors"
                  />
                </button>
              );
            }
            return null;
          })}
        </div>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export function LearnOcamlExercisesPage() {
  const navigate = useNavigate();
  const {
    learnOcaml, learnOcamlLoadExercises, setShowLearnOcamlModal,
  } = useStore();
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (learnOcaml.connection && learnOcaml.exercises.length === 0) {
      learnOcamlLoadExercises();
    }
  }, [learnOcaml.connection]);

  // If not connected, show connect prompt
  if (!learnOcaml.connection) {
    return (
      <div className="h-screen flex flex-col bg-ide-bg">
        <Header mode="dashboard" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 rounded-2xl bg-orange-500/20 flex items-center justify-center mx-auto mb-4">
              <GraduationCap size={32} className="text-orange-400" />
            </div>
            <h2 className="text-xl font-bold text-slate-100 mb-2">Connect to Learn OCaml</h2>
            <p className="text-sm text-slate-400 mb-6">
              Connect your Learn OCaml account to access exercises, submit your answers,
              and track your progress directly from Caraml.
            </p>
            <button
              onClick={() => setShowLearnOcamlModal(true)}
              className="btn-primary"
            >
              <Globe size={16} />
              Connect Your Account
            </button>
          </div>
        </div>
        <LearnOcamlModal />
      </div>
    );
  }

  // Compute stats
  const allExercises = flattenExercises(learnOcaml.exercises);
  const totalExercises = allExercises.length;
  const completedExercises = allExercises.filter(
    (e) => (learnOcaml.grades[e.id] ?? -1) >= 100
  ).length;
  const attemptedExercises = allExercises.filter(
    (e) => learnOcaml.grades[e.id] !== undefined && learnOcaml.grades[e.id] !== null
  ).length;
  const avgGrade = attemptedExercises > 0
    ? Math.round(
        Object.values(learnOcaml.grades).reduce((a, b) => a + (b || 0), 0) / attemptedExercises
      )
    : 0;

  return (
    <div className="h-screen flex flex-col bg-ide-bg">
      <Header mode="dashboard" />

      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <button onClick={() => navigate('/')} className="btn-icon">
                <ArrowLeft size={18} />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
                  <GraduationCap size={24} className="text-orange-400" />
                  Learn OCaml Exercises
                </h1>
                <p className="text-sm text-slate-500 mt-1">
                  {learnOcaml.connection.serverUrl.replace(/https?:\/\//, '')}
                  {learnOcaml.connection.nickname && (
                    <span className="text-slate-400"> &middot; {learnOcaml.connection.nickname}</span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => learnOcamlLoadExercises()}
                disabled={learnOcaml.isLoadingExercises}
                className="btn-secondary btn-sm"
              >
                <RefreshCw size={14} className={learnOcaml.isLoadingExercises ? 'animate-spin' : ''} />
                Refresh
              </button>
              <button
                onClick={() => setShowLearnOcamlModal(true)}
                className="btn-ghost btn-sm"
              >
                <Unplug size={14} />
                Settings
              </button>
            </div>
          </div>

          {/* Stats cards */}
          {totalExercises > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <div className="panel p-4 text-center">
                <BookOpen size={18} className="text-brand-400 mx-auto mb-1" />
                <div className="text-lg font-bold text-slate-100">{totalExercises}</div>
                <div className="text-xs text-slate-500">Exercises</div>
              </div>
              <div className="panel p-4 text-center">
                <CheckCircle2 size={18} className="text-emerald-400 mx-auto mb-1" />
                <div className="text-lg font-bold text-emerald-400">{completedExercises}</div>
                <div className="text-xs text-slate-500">Completed</div>
              </div>
              <div className="panel p-4 text-center">
                <BarChart3 size={18} className="text-amber-400 mx-auto mb-1" />
                <div className="text-lg font-bold text-amber-400">{attemptedExercises}</div>
                <div className="text-xs text-slate-500">Attempted</div>
              </div>
              <div className="panel p-4 text-center">
                <Trophy size={18} className="text-violet-400 mx-auto mb-1" />
                <div className="text-lg font-bold text-violet-400">{avgGrade}%</div>
                <div className="text-xs text-slate-500">Avg Grade</div>
              </div>
            </div>
          )}

          {/* Progress bar */}
          {totalExercises > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-slate-500">Overall Progress</span>
                <span className="text-xs text-slate-400 font-medium">
                  {completedExercises}/{totalExercises} ({Math.round((completedExercises / totalExercises) * 100)}%)
                </span>
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand-500 to-emerald-500 transition-all duration-500"
                  style={{ width: `${(completedExercises / totalExercises) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Search */}
          {totalExercises > 3 && (
            <div className="relative mb-4">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input pl-10"
                placeholder="Search exercises..."
              />
            </div>
          )}

          {/* Loading */}
          {learnOcaml.isLoadingExercises && learnOcaml.exercises.length === 0 ? (
            <div className="flex items-center justify-center py-20">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="animate-spin text-brand-400" size={32} />
                <p className="text-sm text-slate-400">Loading exercises...</p>
              </div>
            </div>
          ) : learnOcaml.exercises.length === 0 ? (
            <div className="text-center py-20">
              <BookOpen size={48} className="mx-auto text-slate-700 mb-4" />
              <p className="text-lg text-slate-400 mb-2">No exercises found</p>
              <p className="text-sm text-slate-500">
                This server may not have any exercises configured yet.
              </p>
            </div>
          ) : (
            /* Exercise Tree */
            <div className="space-y-1">
              {learnOcaml.exercises.map((item, i) => {
                if (isGroup(item)) {
                  return (
                    <ExerciseGroup
                      key={`group-${i}`}
                      group={item}
                      grades={learnOcaml.grades}
                      searchQuery={searchQuery}
                      onExerciseClick={(id) => navigate(`/learn-ocaml/exercise/${id}`)}
                    />
                  );
                }
                if (isExercise(item)) {
                  // Filter by search
                  if (
                    searchQuery &&
                    !item.id.toLowerCase().includes(searchQuery.toLowerCase()) &&
                    !(item.title || '').toLowerCase().includes(searchQuery.toLowerCase())
                  ) {
                    return null;
                  }

                  const grade = learnOcaml.grades[item.id];
                  return (
                    <button
                      key={item.id}
                      onClick={() => navigate(`/learn-ocaml/exercise/${item.id}`)}
                      className="flex items-center gap-3 w-full py-3 px-4 rounded-lg hover:bg-slate-800/60 transition-all group text-left border border-transparent hover:border-slate-700"
                    >
                      <div className="shrink-0">
                        {grade !== undefined && grade !== null && grade >= 100 ? (
                          <CheckCircle2 size={18} className="text-emerald-400" />
                        ) : grade !== undefined && grade !== null && grade > 0 ? (
                          <Circle size={18} className="text-amber-500" />
                        ) : (
                          <Circle size={18} className="text-slate-700" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-200">
                          {item.title || item.id}
                        </div>
                        {item.short_description && (
                          <div className="text-xs text-slate-500 mt-0.5">{item.short_description}</div>
                        )}
                      </div>
                      {item.stars !== undefined && item.stars > 0 && <DifficultyStars count={item.stars} />}
                      <GradeBadge grade={grade} />
                      <ChevronRight size={14} className="text-slate-700 group-hover:text-slate-400 shrink-0" />
                    </button>
                  );
                }
                return null;
              })}
            </div>
          )}
        </div>
      </div>

      <LearnOcamlModal />
    </div>
  );
}
