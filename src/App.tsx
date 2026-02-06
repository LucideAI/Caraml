import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useStore } from './store';
import { DashboardPage } from './pages/DashboardPage';
import { IDEPage } from './pages/IDEPage';
import { SharedPage } from './pages/SharedPage';
import { LearnOcamlExercisesPage } from './pages/LearnOcamlExercisesPage';
import { LearnOcamlExercisePage } from './pages/LearnOcamlExercisePage';
import { Notifications } from './components/Notifications';

export default function App() {
  const { checkAuth, isAuthLoading } = useStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  if (isAuthLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-ide-bg">
        <div className="flex flex-col items-center gap-4">
          <div className="text-4xl">🐫</div>
          <div className="text-brand-400 font-semibold text-lg">CamelCode</div>
          <div className="spinner border-brand-400 w-6 h-6" />
        </div>
      </div>
    );
  }

  return (
    <>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/ide/:projectId" element={<IDEPage />} />
        <Route path="/shared/:shareId" element={<SharedPage />} />
        <Route path="/learn-ocaml" element={<LearnOcamlExercisesPage />} />
        <Route path="/learn-ocaml/exercise/*" element={<LearnOcamlExercisePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Notifications />
    </>
  );
}
