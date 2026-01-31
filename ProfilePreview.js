import { createRailShape, createCoverShape } from './shapes.js';

export class ProfilePreview {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.scale = 8.0; // Zoom level
        this.offsetX = this.canvas.width / 2;
        this.offsetY = this.canvas.height / 2 + 40; // Shift up/down to center
        this.mode = 'rail'; // Default mode
    }

    setMode(mode) {
        this.mode = mode;
    }

    update(params) {
        if (!this.canvas) return;
        
        // Clear
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = "#222";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Generate Shapes
        const railShape = createRailShape(params.innerWidth, params.innerHeight);
        const coverShape = createCoverShape(params.innerWidth, params.innerHeight);

        if (this.mode === 'rail') {
            // Draw Rail (Green)
            this.drawShape(railShape, "#00ff00");
        } else {
            // Draw Cover (Blue)
            this.drawShape(coverShape, "#00aaff");
        }
    }

    drawShape(shape, color) {
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();

        const points = shape.getPoints();
        
        if (points.length > 0) {
            const start = this.transform(points[0].x, points[0].y);
            this.ctx.moveTo(start.x, start.y);

            for (let i = 1; i < points.length; i++) {
                const p = this.transform(points[i].x, points[i].y);
                this.ctx.lineTo(p.x, p.y);
            }
        }
        
        this.ctx.stroke();
    }

    transform(x, y) {
        return {
            x: this.offsetX + x * this.scale,
            y: this.offsetY - y * this.scale
        };
    }
}