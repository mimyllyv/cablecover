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
             // Immediate updates (e.g. visibility toggles, mode switches)
             this.railSystem.generate(this.state, false); // Generate full (or we could optimize)
             this.railSystem.updateCuttersVisibility(this.state.showCutters);
        } else {
            // Interactive updates (typing)
            // 1. Generate FAST version (no holes) immediately
            this.railSystem.generate(this.state, true);
            this.railSystem.updateCuttersVisibility(this.state.showCutters);

            // 2. Debounce FULL version (with holes)
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
            this.update(); // Mode switch can be debounced or immediate. Debounced is safer for perf.
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
                    this.update(); // Debounced
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
            // Visibility toggle should be immediate and doesn't require regen
            this.railSystem.updateCuttersVisibility(this.state.showCutters);
        });


        // Exports
        document.getElementById('export-rail')?.addEventListener('click', () => this.railSystem.exportSTL('rail'));
        document.getElementById('export-cover')?.addEventListener('click', () => this.railSystem.exportSTL('cover'));
    }
}
