import DxfParser from 'dxf-parser';
import * as THREE from 'three';

export function parseDXF(dxfString) {
    const parser = new DxfParser();
    try {
        const dxf = parser.parseSync(dxfString);
        return dxf;
    } catch (err) {
        console.error("DXF parse error:", err);
        return null;
    }
}

function getPoint(entity, type) {
    if (entity.type === 'LINE') {
        if (type === 'start') return new THREE.Vector2(entity.vertices[0].x, entity.vertices[0].y);
        if (type === 'end') return new THREE.Vector2(entity.vertices[1].x, entity.vertices[1].y);
    } else if (entity.type === 'ARC') {
        const cx = entity.center.x;
        const cy = entity.center.y;
        const r = entity.radius;
        if (type === 'start') {
            return new THREE.Vector2(
                cx + r * Math.cos(entity.startAngle),
                cy + r * Math.sin(entity.startAngle)
            );
        }
        if (type === 'end') {
            return new THREE.Vector2(
                cx + r * Math.cos(entity.endAngle),
                cy + r * Math.sin(entity.endAngle)
            );
        }
    }
    return null;
}

const EPSILON = 0.001;

function arePointsEqual(p1, p2) {
    return p1.distanceTo(p2) < EPSILON;
}

export function convertEntitiesToShape(entities) {
    // Filter supported entities
    const segments = entities.filter(e => e.type === 'LINE' || e.type === 'ARC').map(e => {
        return {
            entity: e,
            start: getPoint(e, 'start'),
            end: getPoint(e, 'end'),
            used: false
        };
    });

    if (segments.length === 0) return null;

    const shape = new THREE.Shape();
    
    // Start with the first segment
    let currentSegment = segments[0];
    currentSegment.used = true;
    let currentPoint = currentSegment.end;

    // Move to start of first segment
    shape.moveTo(currentSegment.start.x, currentSegment.start.y);
    addSegmentToShape(shape, currentSegment.entity, false);

    let count = 1;
    while (count < segments.length) {
        // Find next segment starting at currentPoint
        let next = segments.find(s => !s.used && arePointsEqual(s.start, currentPoint));
        let reverse = false;

        if (!next) {
            // Try finding one that ends at currentPoint (needed if lines are flipped)
            next = segments.find(s => !s.used && arePointsEqual(s.end, currentPoint));
            if (next) reverse = true;
        }

        if (next) {
            next.used = true;
            addSegmentToShape(shape, next.entity, reverse);
            currentPoint = reverse ? next.start : next.end;
            count++;
        } else {
            console.warn("Could not find connected segment. Shape might be open or disjoint.");
            break; 
        }
    }

    return shape;
}

function addSegmentToShape(shape, entity, reverse) {
    if (entity.type === 'LINE') {
        const target = reverse ? entity.vertices[0] : entity.vertices[1];
        shape.lineTo(target.x, target.y);
    } else if (entity.type === 'ARC') {
        const cx = entity.center.x;
        const cy = entity.center.y;
        const r = entity.radius;
        let startAngle = entity.startAngle;
        let endAngle = entity.endAngle;
        
        // DXF arcs are always CCW?
        // three.js absarc: x, y, radius, startAngle, endAngle, clockwise
        
        if (reverse) {
            // If we are traversing the arc backwards (End -> Start)
            // We want to go from EndAngle to StartAngle.
            // But absarc draws in a specific direction (CW or CCW).
            // DXF Angle increases CCW. 
            // If we traverse normal: Start -> End (CCW). clockwise = false.
            // If we traverse reverse: End -> Start (CW). clockwise = true.
            shape.absarc(cx, cy, r, endAngle, startAngle, true);
        } else {
            shape.absarc(cx, cy, r, startAngle, endAngle, false);
        }
    }
}
