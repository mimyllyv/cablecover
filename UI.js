import { ProfilePreview } from './ProfilePreview.js';

export class UIManager {
    constructor(railSystem) {
        this.railSystem = railSystem;
        this.preview = new ProfilePreview('profile-canvas');
        this.updateTimeout = null;
        this.state = {
            isAngledMode: false,
            length: 100,
            holeCount: 2,
            holeDiameter: 3.0,
            angle: 90,
            len1: 100,
            len2: 100,
            radius: 20,
            turnAxis: 'horizontal',
            showCutters: true,
            showRail: true,
            showCover: true,
            innerWidth: 8.0,
            innerHeight: 9.0,
            clearance: 0.25,
            connClearance: 0.15,
            connLength: 5.0,
            connWall: 0.8
        };

        this.initListeners();
    }

    update(immediate = false) {
        this.preview.update(this.state);

        if (this.updateTimeout) clearTimeout(this.updateTimeout);

        if (immediate) {
             this.railSystem.generate(this.state, false).then(() => {
                 this.updateVisibility();
             });
        } else {
            this.railSystem.generate(this.state, true).then(() => {
                this.updateVisibility();
            });

            this.updateTimeout = setTimeout(() => {
                this.railSystem.generate(this.state, false).then(() => {
                    this.updateVisibility();
                });
            }, 1000);
        }
    }

    updateVisibility() {
        this.railSystem.updateCuttersVisibility(this.state.showCutters);
        this.railSystem.updateComponentVisibility(this.state.showRail, this.state.showCover);
    }

    initListeners() {
        // Toggle Panels
        document.querySelectorAll('.panel-header').forEach(header => {
            header.addEventListener('click', () => {
                const panel = header.parentElement;
                panel.classList.toggle('collapsed');
            });
        });

        document.getElementById('add-straight')?.addEventListener('click', () => {
            this.state.isAngledMode = false;
            this.update();
        });
        
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
        
        bindInput('inner-width', 'innerWidth');
        bindInput('inner-height', 'innerHeight');
        bindInput('clearance-val', 'clearance');
        
        bindInput('conn-clearance', 'connClearance');
        bindInput('conn-length', 'connLength');
        bindInput('conn-wall', 'connWall');

        document.getElementById('show-holes')?.addEventListener('change', (e) => {
            this.state.showCutters = e.target.checked;
            this.updateVisibility();
        });

        document.getElementById('show-rail')?.addEventListener('change', (e) => {
            this.state.showRail = e.target.checked;
            this.updateVisibility();
        });

        document.getElementById('show-cover')?.addEventListener('change', (e) => {
            this.state.showCover = e.target.checked;
            this.updateVisibility();
        });

        document.getElementById('export-rail')?.addEventListener('click', () => this.railSystem.exportSTL('rail', this.state));
        document.getElementById('export-cover')?.addEventListener('click', () => this.railSystem.exportSTL('cover', this.state));
        document.getElementById('export-connector')?.addEventListener('click', () => this.railSystem.exportSTL('connector', this.state));

        document.getElementById('preview-rail-btn')?.addEventListener('click', () => {
            this.preview.setMode('rail');
            this.preview.update(this.state);
        });
        document.getElementById('preview-cover-btn')?.addEventListener('click', () => {
            this.preview.setMode('cover');
            this.preview.update(this.state);
        });
        document.getElementById('preview-connector-btn')?.addEventListener('click', () => {
            this.preview.setMode('connector');
            this.preview.update(this.state);
        });
    }
}