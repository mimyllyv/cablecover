import { createRailShape, createCoverShape } from './shapes.js';

export class ProfilePreview {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.mode = 'rail'; 
    }

    setMode(mode) {
        this.mode = mode;
    }

    update(params) {
        if (!this.canvas) return;
        
        const width = this.canvas.width;
        const height = this.canvas.height;

        // Clear
        this.ctx.clearRect(0, 0, width, height);
        this.ctx.fillStyle = "#222";
        this.ctx.fillRect(0, 0, width, height);

        // Generate Shapes
        const railShape = createRailShape(params.innerWidth, params.innerHeight);
        const coverShape = createCoverShape(params.innerWidth, params.innerHeight);

        const activeShape = (this.mode === 'rail') ? railShape : coverShape;
        const color = (this.mode === 'rail') ? "#00ff00" : "#00aaff";

        // 1. Calculate Bounds for Auto-Fit
        const points = activeShape.getPoints();
        if (points.length === 0) return;

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        points.forEach(p => {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
        });

        // Add padding (Increased to fit labels)
        const padding = 35;
        const geoW = maxX - minX;
        const geoH = maxY - minY;
        
        // Compute Scale to fit
        const scaleX = (width - padding * 2) / geoW;
        const scaleY = (height - padding * 2) / geoH;
        this.scale = Math.min(scaleX, scaleY);

        // Center Offset
        // Canvas Center (Shifted slightly Left/Up to give space for Bottom/Right labels)
        const cx = width / 2 - 10;
        const cy = height / 2 - 10;
        
        // Geometry Center (in Geom coords)
        const gcx = (minX + maxX) / 2;
        const gcy = (minY + maxY) / 2;

        // Transform: screenX = cx + (geoX - gcx) * scale
        // screenY = cy - (geoY - gcy) * scale (Flip Y)
        this.transform = (x, y) => ({
            x: cx + (x - gcx) * this.scale,
            y: cy - (y - gcy) * this.scale
        });

        // 2. Draw Shape
        this.drawShape(points, color);

        // 3. Draw Measurements
        this.drawMeasurements(params, minX, maxX, minY, maxY);
    }

    drawShape(points, color) {
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();

        const start = this.transform(points[0].x, points[0].y);
        this.ctx.moveTo(start.x, start.y);

        for (let i = 1; i < points.length; i++) {
            const p = this.transform(points[i].x, points[i].y);
            this.ctx.lineTo(p.x, p.y);
        }
        
        this.ctx.stroke();
    }

    drawMeasurements(params, minX, maxX, minY, maxY) {
        this.ctx.strokeStyle = "#ffffff";
        this.ctx.fillStyle = "#ffffff";
        this.ctx.lineWidth = 1;
        this.ctx.font = "12px sans-serif";
        this.ctx.textAlign = "center";
        
        // Draw Inner Width Dimension (Horizontal)
        // For Rail: Inner Width is the gap between walls at top? Or bottom?
        // It's params.innerWidth.
        // Let's draw it at the top or center.
        // Let's draw Outer Width at the very bottom.
        
        // Draw Outer Width (maxX - minX)
        // Position: Bottom of shape + 5px
        const bottomY = minY; // In Geom coords
        const dimY = bottomY - (10 / this.scale); // Shift down 10px in screen space? No, 10/scale units.
        
        this.drawDimLine(minX, dimY, maxX, dimY, `W: ${(maxX-minX).toFixed(1)}`);

        // Draw Height (maxY - minY)
        // Position: Right of shape + 5px
        const rightX = maxX + (10 / this.scale);
        this.drawDimLine(rightX, minY, rightX, maxY, `H: ${(maxY-minY).toFixed(1)}`, true);
        
        // Draw Inner Width explicitly?
        // Center X = 0. Range: -innerWidth/2 to innerWidth/2.
        // Draw at Y = Center.
        const iw = params.innerWidth;
        const ih = params.innerHeight;
        
        // Inner Width Dim (Green)
        this.ctx.strokeStyle = "#ffff00";
        this.ctx.fillStyle = "#ffff00";
        // Draw near top or wherever inner cavity is.
        // Rail Bead is at `ih`. Inner Floor 0.
        // Let's draw at Y = ih/2.
        this.drawDimLine(-iw/2, ih/2, iw/2, ih/2, `Inner: ${iw}`);
    }

    drawDimLine(x1, y1, x2, y2, text, vertical = false) {
        const p1 = this.transform(x1, y1);
        const p2 = this.transform(x2, y2);
        
        this.ctx.beginPath();
        this.ctx.moveTo(p1.x, p1.y);
        this.ctx.lineTo(p2.x, p2.y);
        this.ctx.stroke();
        
        // Ticks
        const tickLen = 3;
        // P1 Tick
        this.ctx.beginPath();
        if (vertical) {
            this.ctx.moveTo(p1.x - tickLen, p1.y); this.ctx.lineTo(p1.x + tickLen, p1.y);
            this.ctx.moveTo(p2.x - tickLen, p2.y); this.ctx.lineTo(p2.x + tickLen, p2.y);
        } else {
            this.ctx.moveTo(p1.x, p1.y - tickLen); this.ctx.lineTo(p1.x, p1.y + tickLen);
            this.ctx.moveTo(p2.x, p2.y - tickLen); this.ctx.lineTo(p2.x, p2.y + tickLen);
        }
        this.ctx.stroke();

        // Text
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        
        // Background for text
        const textMetrics = this.ctx.measureText(text);
        const tw = textMetrics.width;
        
        this.ctx.save();
        this.ctx.fillStyle = "rgba(0,0,0,0.7)";
        
        if (vertical) {
            // Rotate text? Or just place to right.
            // Simple placement to the right
            this.ctx.fillRect(midX + 2, midY - 6, tw + 4, 12);
            this.ctx.fillStyle = this.ctx.strokeStyle;
            this.ctx.textAlign = "left";
            this.ctx.fillText(text, midX + 4, midY + 4);
        } else {
            this.ctx.fillRect(midX - tw/2 - 2, midY - 6 - 8, tw + 4, 12);
            this.ctx.fillStyle = this.ctx.strokeStyle;
            this.ctx.fillText(text, midX, midY - 4);
        }
        this.ctx.restore();
    }
}
