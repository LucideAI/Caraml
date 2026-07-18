import { useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useStore } from './store';
import { DashboardPage } from './pages/DashboardPage';
import { Notifications } from './components/Notifications';

// Route-level code splitting: the Monaco-based pages are heavy, so they are
// loaded on demand and the dashboard stays lightweight.
const IDEPage = lazy(() => import('./pages/IDEPage').then((m) => ({ default: m.IDEPage })));
const SharedPage = lazy(() => import('./pages/SharedPage').then((m) => ({ default: m.SharedPage })));
const LearnOcamlExercisesPage = lazy(() =>
  import('./pages/LearnOcamlExercisesPage').then((m) => ({ default: m.LearnOcamlExercisesPage }))
);
const LearnOcamlExercisePage = lazy(() =>
  import('./pages/LearnOcamlExercisePage').then((m) => ({ default: m.LearnOcamlExercisePage }))
);

function LoadingScreen() {
  return (
    <div className="h-screen flex items-center justify-center bg-ide-bg">
      <div className="flex flex-col items-center gap-4">
        <div className="text-4xl">🐫</div>
        <div className="text-brand-400 font-semibold text-lg">Caraml</div>
        <div className="spinner border-brand-400 w-6 h-6" />
      </div>
    </div>
  );
}

export default function App() {
  const { checkAuth, isAuthLoading, learnOcamlRestoreConnection } = useStore();

  useEffect(() => {
    checkAuth();
    // Restore the Learn OCaml session from localStorage on any entry route
    learnOcamlRestoreConnection();
  }, [checkAuth, learnOcamlRestoreConnection]);

  if (isAuthLoading) {
    return <LoadingScreen />;
  }

  return (
    <>
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/ide/:projectId" element={<IDEPage />} />
          <Route path="/shared/:shareId" element={<SharedPage />} />
          <Route path="/learn-ocaml" element={<LearnOcamlExercisesPage />} />
          <Route path="/learn-ocaml/exercise/*" element={<LearnOcamlExercisePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <Notifications />
    </>
  );
}
