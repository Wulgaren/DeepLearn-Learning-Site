import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ArtRouteProvider } from './contexts/ArtRouteContext';
import ProtectedRoute from './components/ProtectedRoute';
import ConditionalArtRouteLayout from './components/ConditionalArtRouteLayout';
import Layout from './components/Layout';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Home from './pages/Home';
import Feed from './pages/Feed';
import Thread from './pages/Thread';
import NewThread from './pages/NewThread';
import Art from './pages/Art';
import ArtArtist from './pages/ArtArtist';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route
            path="/thread/new"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<NewThread />} />
          </Route>
          <Route path="/thread/:threadId" element={<ArtRouteProvider><Layout /></ArtRouteProvider>}>
            <Route index element={<Thread />} />
          </Route>
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <ConditionalArtRouteLayout>
                  <Layout />
                </ConditionalArtRouteLayout>
              </ProtectedRoute>
            }
          >
            <Route index element={<Home />} />
            <Route path="topics" element={<Feed />} />
            <Route path="art" element={<Outlet />}>
              <Route index element={<Art />} />
              <Route path="artist/:source/:externalId" element={<ArtArtist />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
