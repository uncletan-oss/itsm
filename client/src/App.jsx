import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import ResourceList from './components/ResourceList.jsx';
import ResourceForm from './components/ResourceForm.jsx';
import ResourceDetail from './components/ResourceDetail.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Portal from './pages/Portal.jsx';
import Compliance from './pages/Compliance.jsx';
import Settings from './pages/Settings.jsx';
import Users from './pages/Users.jsx';
import AuditLog from './pages/AuditLog.jsx';

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <div className="center pad">Memuat…</div>;
  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="portal" element={<Portal />} />
        <Route path="m/:resource" element={<ResourceList />} />
        <Route path="m/:resource/new" element={<ResourceForm />} />
        <Route path="m/:resource/:id" element={<ResourceDetail />} />
        <Route path="compliance" element={<Compliance />} />
        <Route path="settings" element={<Settings />} />
        <Route path="users" element={<Users />} />
        <Route path="audit" element={<AuditLog />} />
        <Route path="login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
