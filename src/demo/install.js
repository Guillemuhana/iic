// Se importa primero en main.jsx. Solo hace algo en la compilación de demo.
import { installDemo } from './mock';

if (import.meta.env.VITE_DEMO === '1') installDemo();
