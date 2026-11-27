import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MobilePreview } from '../../../packages/game-ui/src/Phone';
import { Rooms } from './Rooms';
import '../../../packages/game-ui/src/styles.css';
import './styles.css';

function App() {
  return <div className="game-shell">
    <header className="game-header">
      <a className="game-brand" href="./">
        <span className="brand-symbol" aria-hidden="true">J</span>
        <span>JetLagPrague</span>
      </a>
    </header>
    <main><Rooms/></main>
  </div>;
}

const role = new URLSearchParams(location.search).get('role');
createRoot(document.getElementById('root')!).render(
  <StrictMode>{role === 'hunter' || role === 'hider' ? <MobilePreview role={role}/> : <App/>}</StrictMode>,
);
