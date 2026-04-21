import { useLocation } from 'react-router-dom';
import { ArtRouteProvider } from '../contexts/ArtRouteContext';

export default function ConditionalArtRouteLayout({ children }: { children: React.ReactNode }) {
  const loc = useLocation();
  if (!loc.pathname.startsWith('/art')) return <>{children}</>;
  return <ArtRouteProvider>{children}</ArtRouteProvider>;
}
