export class UIManager {
    constructor(railSystem) {
        this.railSystem = railSystem;
        this.updateTimeout = null;
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

    update(immediate = false) {
        if (this.updateTimeout) clearTimeout(this.updateTimeout);

        if (immediate) {
             this.railSystem.generate(this.state, false); 
             this.railSystem.updateCuttersVisibility(this.state.showCutters);
        } else {
            this.railSystem.generate(this.state, true);
            this.railSystem.updateCuttersVisibility(this.state.showCutters);

            this.updateTimeout = setTimeout(() => {
                this.railSystem.generate(this.state, false);
                this.railSystem.updateCuttersVisibility(this.state.showCutters);
            }, 1000);
        }
    }

    initListeners() {
        // Mode Buttons
        document.getElementById('add-straight')?.addEventListener('click', () => {
            this.state.isAngledMode = false;
            this.update();
        });
        
        // Angled Buttons
        document.getElementById('create-horizontal')?.addEventListener('click', () => {
            this.state.isAngledMode = true;
            this.state.turnAxis = 'horizontal';
            this.update();
        });

        document.getElementById('create-vertical')?.addEventListener('click', () => {
            this.state.isAngledMode = true;
            this.state.turnAxis = 'vertical';
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

        document.getElementById('show-holes')?.addEventListener('change', (e) => {
            this.state.showCutters = e.target.checked;
            this.railSystem.updateCuttersVisibility(this.state.showCutters);
        });

        // Exports
        document.getElementById('export-rail')?.addEventListener('click', () => this.railSystem.exportSTL('rail'));
        document.getElementById('export-cover')?.addEventListener('click', () => this.railSystem.exportSTL('cover'));
    }
}