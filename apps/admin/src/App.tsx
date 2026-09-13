import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { DriverDetailPage } from '@/pages/DriverDetailPage';
import { LoginPage } from '@/pages/LoginPage';
import { PendingQueuePage } from '@/pages/PendingQueuePage';
import { UnauthorizedPage } from '@/pages/UnauthorizedPage';
import { Navigate, Route, Routes } from 'react-router-dom';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<PendingQueuePage />} />
        <Route path="/drivers/:id" element={<DriverDetailPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
