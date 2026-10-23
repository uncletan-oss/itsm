import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import ResourceList from './components/ResourceList.jsx';
import ResourceForm from './components/ResourceForm.jsx';
import ResourceDetail from './components/ResourceDetail.jsx';
import { Empty } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import MyWork from './pages/MyWork.jsx';
import Reports from './pages/Reports.jsx';
import Kpi from './pages/Kpi.jsx';
import Portal from './pages/Portal.jsx';
import Compliance from './pages/Compliance.jsx';
import Settings from './pages/Settings.jsx';
import Access from './pages/Access.jsx';
import Users from './pages/Users.jsx';
import AuditLog from './pages/AuditLog.jsx';
import Platform from './pages/Platform.jsx';
import Catalog from './pages/Catalog.jsx';

/** Halaman non-modul dijaga sesuai peran (cermin shared/permissions.mjs PAGES). */
function Guard({ page, children }) {
  const { canPage } = useAuth();
  return canPage(page) ? children : <div className="card"><Empty icon="lock" title="Anda tidak memiliki akses ke halaman ini" /></div>;
}

export default function App() {
  const { user, loading, isPlatform } = useAuth();
  if (loading) return <div className="center" style={{ padding: 60 }}><div className="logo" style={{ margin: '0 auto' }}>IT</div></div>;
  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }
  if (isPlatform) {
    return (
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Platform />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    );
  }
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="my-work" element={<MyWork />} />
        <Route path="portal" element={<Portal />} />
        <Route path="m/:resource" element={<ResourceList />} />
        <Route path="m/:resource/new" element={<ResourceForm />} />
        <Route path="m/:resource/:id" element={<ResourceDetail />} />
        <Route path="catalog" element={<Catalog />} />
        <Route path="kpi" element={<Guard page="kpi"><Kpi /></Guard>} />
        <Route path="reports" element={<Guard page="reports"><Reports /></Guard>} />
        <Route path="compliance" element={<Guard page="compliance"><Compliance /></Guard>} />
        <Route path="audit" element={<Guard page="audit"><AuditLog /></Guard>} />
        <Route path="users" element={<Guard page="users"><Users /></Guard>} />
        <Route path="access" element={<Guard page="access"><Access /></Guard>} />
        <Route path="settings" element={<Guard page="settings"><Settings /></Guard>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
