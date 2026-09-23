import './style.css';
import { Application } from 'pixi.js';

(async () => {
  // Create a new application
  const app = new Application();

  // Initialize the application with dynamic resizing
  await app.init({
    resizeTo: window,
    backgroundColor: 0x1099bb,
  });

  // Append the application canvas to the document body
  document.body.appendChild(app.canvas);
})();
