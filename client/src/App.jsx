import Host from './Host.jsx';
import Player from './Player.jsx';

// Two views: /host is the shared screen, everything else is the phone.
export default function App() {
  return window.location.pathname.startsWith('/host') ? <Host /> : <Player />;
}
