import { createScene } from './Scene.js';
import { RailSystem } from './RailSystem.js';
import { UIManager } from './UI.js';

async function init() {
    // 1. Setup Scene
    const { scene, animate } = createScene();

    // 2. Setup Rail System
    const railSystem = new RailSystem(scene);
    await railSystem.loadProfiles();

    // 3. Setup UI
    const ui = new UIManager(railSystem);

    // 4. Initial Render
    ui.update();
    animate();
}

init();
