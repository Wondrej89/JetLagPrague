import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {Simulator} from './Simulator';
createRoot(document.getElementById('root')!).render(<StrictMode><Simulator/></StrictMode>);
