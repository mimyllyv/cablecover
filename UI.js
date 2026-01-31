export class UIManager {
    constructor(railSystem) {
        this.railSystem = railSystem;
        this.state = {
            isAngledMode: false,
            length: 100,
            holeCount: 2,
            holeDiameter: 4,
            angle: 90,
            len1: 100,
            len2: 100,
            radius: 20,
            turnAxis: 'horizontal',
            showCutters: true
        };

        this.initListeners();
    }

    update() {
        this.railSystem.generate(this.state);
        this.railSystem.updateCuttersVisibility(this.state.showCutters);
    }

    initListeners() {
        // Mode Buttons
        document.getElementById('add-straight')?.addEventListener('click', () => {
            this.state.isAngledMode = false;
            this.update();
        });
        document.getElementById('create-angled')?.addEventListener('click', () => {
            this.state.isAngledMode = true;
            this.update();
        });

        // Inputs
        const bindInput = (id, key, parser = parseFloat) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', (e) => {
                const val = parser(e.target.value);
                if (!isNaN(val)) {
                    this.state[key] = val;
                    this.update();
                }
            });
        };

        bindInput('length-input', 'length');
        bindInput('hole-count', 'holeCount', parseInt);
        bindInput('hole-diameter', 'holeDiameter');
        bindInput('angle-val', 'angle');
        bindInput('len1-val', 'len1');
        bindInput('len2-val', 'len2');
        bindInput('radius-val', 'radius');

        document.getElementById('turn-axis')?.addEventListener('change', (e) => {
            this.state.turnAxis = e.target.value;
            this.update();
        });

        document.getElementById('show-holes')?.addEventListener('change', (e) => {
            this.state.showCutters = e.target.checked;
            this.railSystem.updateCuttersVisibility(this.state.showCutters);
        });

        // Exports
        document.getElementById('export-rail')?.addEventListener('click', () => this.railSystem.exportSTL('rail'));
        document.getElementById('export-cover')?.addEventListener('click', () => this.railSystem.exportSTL('cover'));
    }
}
