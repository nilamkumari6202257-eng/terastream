import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useStoreVersion } from '@/hooks/useStoreVersion';
import IntersectObserver from '@/components/common/IntersectObserver';
import { Toaster } from '@/components/ui/sonner';

import { routes } from './routes';

// import { AuthProvider } from '@/contexts/AuthContext';
// import { RouteGuard } from '@/components/common/RouteGuard';

// When fresh admin data arrives from the server, pages re-mount so they re-read it. This is held back
// while someone is watching a video (or the admin is editing) and applied on the next navigation.
const AppRoutes: React.FC = () => {
  const version = useStoreVersion();
  const { pathname } = useLocation();
  const [applied, setApplied] = React.useState(version);
  const busy = /^\/(watch|wait|admin)/.test(pathname);
  React.useEffect(() => {
    if (!busy) setApplied(version);
  }, [version, busy, pathname]);
  return (
    <Routes key={applied}>
      {routes.map((route, index) => (
        <Route key={index} path={route.path} element={route.element} />
      ))}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

const App: React.FC = () => {
  return (
    <Router>
      {/*<AuthProvider>*/}
      {/*<RouteGuard>*/}
      <IntersectObserver />
      <div className="flex flex-col min-h-screen">
        {/*<Header />*/}
        <main className="flex-grow">
          <AppRoutes />
        </main>
      </div>
      <Toaster />
      {/*</RouteGuard>*/}
      {/*</AuthProvider>*/}
    </Router>
  );
};

export default App;
