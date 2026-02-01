import * as THREE from 'three';

export function createRailShape(innerWidth, innerHeight) {
    const shape = new THREE.Shape();
    const wallT = 1.2;
    const floorT = 1.2;
    const beadR = 1.0;
    const halfIW = innerWidth / 2;
    const halfOW = halfIW + wallT;
    const yInnerFloor = 0;
    const yOuterFloor = -floorT;
    const yBeadCenter = innerHeight;
    const yTopFlat = yBeadCenter + beadR;
    shape.moveTo(-halfOW, yOuterFloor);
    shape.lineTo(halfOW, yOuterFloor);
    shape.lineTo(halfOW, yTopFlat);
    shape.lineTo(halfIW, yTopFlat);
    shape.absarc(halfIW, yBeadCenter, beadR, Math.PI / 2, 3 * Math.PI / 2, false);
    shape.lineTo(halfIW, yInnerFloor + 1.0);
    shape.absarc(halfIW - 1.0, yInnerFloor + 1.0, 1.0, 0, -Math.PI / 2, true);
    shape.lineTo(-(halfIW - 1.0), yInnerFloor);
    shape.absarc(-(halfIW - 1.0), yInnerFloor + 1.0, 1.0, -Math.PI / 2, -Math.PI, true);
    shape.lineTo(-halfIW, yBeadCenter - 1.0);
    shape.absarc(-halfIW, yBeadCenter, beadR, 3 * Math.PI / 2, Math.PI / 2, false);
    shape.lineTo(-halfOW, yTopFlat);
    shape.lineTo(-halfOW, yOuterFloor);
    return shape;
}

export function createCoverShape(innerWidth, innerHeight, clearance = 0.25) {
    const shape = new THREE.Shape();
    
    const halfIW = innerWidth / 2;
    const halfOW = halfIW + 1.2; 
    const yBead = innerHeight;
    const topY = yBead + 2.3; 
    const bottomY = yBead + 1.1; 
    
    const clipR = 1.1;
    const ribR = 2.3;
    const clawOffset = clearance - 0.1;

    // Start at Top Center and go Left (CCW)
    shape.moveTo(0, topY);
    shape.lineTo(-(halfOW - 0.8), topY);
    shape.absarc(-(halfOW - 0.8), topY - 0.8, 0.8, Math.PI / 2, Math.PI, false);
    shape.lineTo(-halfOW, bottomY);
    
    const leftClawX = -halfIW + clawOffset;
    const angleStartLeft = Math.PI / 2;
    const angleEndLeft = -70 * Math.PI / 180;
    shape.absarc(leftClawX, yBead, clipR, angleStartLeft, angleEndLeft, true);
    
    const leftTipX = leftClawX + ribR * Math.cos(angleEndLeft);
    const leftTipY = yBead + ribR * Math.sin(angleEndLeft);
    shape.lineTo(leftTipX, leftTipY);
    
    const leftEndAngle = Math.asin(1.1/2.3);
    shape.absarc(leftClawX, yBead, ribR, angleEndLeft, leftEndAngle, false);
    
    shape.lineTo(0, bottomY);
    
    const rightClawX = halfIW - clawOffset;
    const rightRibStartX = rightClawX + ribR * Math.cos(Math.PI - Math.asin(1.1/2.3));
    
    shape.lineTo(rightRibStartX, bottomY);
    
    const rightTipAngle = 250 * Math.PI / 180;
    shape.absarc(rightClawX, yBead, ribR, Math.PI - Math.asin(1.1/2.3), rightTipAngle, false);
    
    const rightInnerTipX = rightClawX + clipR * Math.cos(rightTipAngle);
    const rightInnerTipY = yBead + clipR * Math.sin(rightTipAngle);
    shape.lineTo(rightInnerTipX, rightInnerTipY);
    
    shape.absarc(rightClawX, yBead, clipR, rightTipAngle, Math.PI / 2, true);
    
    shape.lineTo(halfOW, bottomY);
    shape.lineTo(halfOW, topY - 0.8);
    shape.absarc(halfOW - 0.8, topY - 0.8, 0.8, 0, Math.PI / 2, false);
    shape.lineTo(0, topY);

    return shape;
}

export function createConnectorShapes(innerWidth, innerHeight, connClearance, connWallT) {
    // 1. Define Basic Dimensions of the Assembly
    const halfIW = innerWidth / 2;
    const halfOW = halfIW + 1.2; 
    const yRailBottom = -1.2;
    const yRailInnerFloor = 0;
    const yCoverTop = innerHeight + 2.3;
    const yCoverInnerTop = innerHeight + 1.1; // Approximation of inner ceiling
    
    // 2. Define Contours
    // Outer Contour of Assembly (Rail + Cover)
    const createOuterContour = (offset) => {
        const shape = new THREE.Shape();
        const w = halfOW + offset;
        const top = yCoverTop + offset;
        const bottom = yRailBottom - offset;
        const r = 0.8 + offset; // Approximate corner radius scaling
        
        shape.moveTo(-w, bottom);
        shape.lineTo(w, bottom);
        shape.lineTo(w, top - r);
        shape.absarc(w - r, top - r, r, 0, Math.PI / 2, false);
        shape.lineTo(-(w - r), top);
        shape.absarc(-(w - r), top - r, r, Math.PI / 2, Math.PI, false);
        shape.lineTo(-w, bottom);
        return shape;
    };

    // Inner Contour of Assembly (The Tunnel)
    // Used for generating the U-shape paths.
    // Returns a list of commands/points? No, let's just use the shape drawing logic directly.

    // Helper to draw a U-Profile
    // outerOffset: offset for the outer boundary of the wall
    // innerOffset: offset for the inner boundary of the wall
    // type: 'outer' (Outer Sleeve) or 'inner' (Inner Sleeve)
    const createUProfile = (outerOffset, innerOffset, type) => {
        const shape = new THREE.Shape();
        
        // Define Dimensions
        // Outer Sleeve Reference: halfOW, yRailBottom (-1.2), yCoverTop
        // Inner Sleeve Reference: halfIW, yRailInnerFloor (0), yCoverInnerTop
        
        let w_out, top_out, bottom_out, r_out_top, r_out_bottom;
        let w_in, top_in, bottom_in, r_in_top, r_in_bottom;

        if (type === 'outer') {
            // Outer Sleeve Geometry (Box-like)
            w_out = halfOW + outerOffset;
            top_out = yCoverTop + outerOffset;
            bottom_out = yRailBottom - outerOffset; // Outer offset moves down? No, offset adds material outwards.
            // Wait, for 'bottom', 'outwards' means 'down'?
            // The Rail Bottom is Flat. 
            // If we offset 'outwards', we go lower?
            // Usually 'offset' is normal to surface.
            // Let's assume the Connector stops flush at y = -1.2.
            bottom_out = -1.2;
            
            w_in = halfOW + innerOffset;
            top_in = yCoverTop + innerOffset;
            bottom_in = -1.2;

            r_out_top = 0.8 + outerOffset;
            r_in_top = 0.8 + innerOffset;
            
            // Draw CCW Outer Path
            shape.moveTo(w_out, bottom_out);
            shape.lineTo(w_out, top_out - r_out_top);
            shape.absarc(w_out - r_out_top, top_out - r_out_top, r_out_top, 0, Math.PI / 2, false);
            shape.lineTo(-(w_out - r_out_top), top_out);
            shape.absarc(-(w_out - r_out_top), top_out - r_out_top, r_out_top, Math.PI / 2, Math.PI, false);
            shape.lineTo(-w_out, bottom_out);
            
            // Connect to Inner Path
            shape.lineTo(-w_in, bottom_in);
            
            // Draw CW Inner Path (Reverse)
            shape.lineTo(-w_in, top_in - r_in_top);
            shape.absarc(-(w_in - r_in_top), top_in - r_in_top, r_in_top, Math.PI, Math.PI / 2, true);
            shape.lineTo(w_in - r_in_top, top_in);
            shape.absarc(w_in - r_in_top, top_in - r_in_top, r_in_top, Math.PI / 2, 0, true);
            shape.lineTo(w_in, bottom_in);
            
            // Close
            shape.lineTo(w_out, bottom_out);

        } else {
            // Inner Sleeve Geometry (Rounded Box-like)
            // User requested: "Rounded parts facing the same end" (Top).
            // So we treat it like the Outer Sleeve: Rounded Top, Flat Bottom.
            
            // Dimensions
            // Outer Boundary of Inner Sleeve (Interface with Rail Inner Wall)
            w_out = halfIW - outerOffset;
            top_out = yCoverInnerTop - outerOffset;
            bottom_out = 0; // Flat bottom at Floor

            // Inner Boundary of Inner Sleeve (Free Surface)
            w_in = halfIW - innerOffset;
            top_in = yCoverInnerTop - innerOffset;
            bottom_in = 0;

            // Radii at Top
            // Cover Top Radius is 0.8. 
            // Let's use a similar radius for the inner sleeve top to match the look,
            // or derive it. 
            // If the outer sleeve has r = 0.8 + offset, 
            // the inner sleeve (inside) should have r = 0.8 - offset?
            // Let's assume a default radius of 1.0 for the arch.
            r_out_top = Math.max(0.1, 1.0 - outerOffset);
            r_in_top = Math.max(0.1, 1.0 - innerOffset);

            // Draw CCW Outer Path
            shape.moveTo(w_out, bottom_out);
            shape.lineTo(w_out, top_out - r_out_top);
            shape.absarc(w_out - r_out_top, top_out - r_out_top, r_out_top, 0, Math.PI / 2, false);
            shape.lineTo(-(w_out - r_out_top), top_out);
            shape.absarc(-(w_out - r_out_top), top_out - r_out_top, r_out_top, Math.PI / 2, Math.PI, false);
            shape.lineTo(-w_out, bottom_out);
            
            // Connect to Inner Path
            shape.lineTo(-w_in, bottom_in);
            
            // Draw CW Inner Path (Reverse)
            shape.lineTo(-w_in, top_in - r_in_top);
            shape.absarc(-(w_in - r_in_top), top_in - r_in_top, r_in_top, Math.PI, Math.PI / 2, true);
            shape.lineTo(w_in - r_in_top, top_in);
            shape.absarc(w_in - r_in_top, top_in - r_in_top, r_in_top, Math.PI / 2, 0, true);
            shape.lineTo(w_in, bottom_in);
            
            // Close
            shape.lineTo(w_out, bottom_out);
        }
        return shape;
    };

    // 3. Generate Specific Shapes
    
    // Outer Sleeve
    // Outer Offset: Clearance + Wall (Larger)
    // Inner Offset: Clearance (Smaller)
    const outerSleeve = createUProfile(connClearance + connWallT, connClearance, 'outer');
    
    // Inner Sleeve
    const innerSleeve = createUProfile(connClearance, connClearance + connWallT, 'inner');
    
    // Center Solid Profile
    // Fills the space from Outer Sleeve Outer Boundary to Inner Sleeve Inner Boundary.
    // Effectively a "Super U".
    // Outer Boundary: same as OuterSleeve (offset = connClearance + connWallT)
    // Inner Boundary: same as InnerSleeve (offset = connClearance + connWallT)
    // Wait, Center Outer = OuterSleeve Outer.
    // Center Inner = InnerSleeve Inner.
    // So we use 'outer' type logic for outer, 'inner' type logic for inner.
    // Let's manually compose it or make createUProfile flexible?
    // It's easier to just construct it.
    
    const centerShape = new THREE.Shape();
    // Trace OuterSleeve Outer Boundary (CCW)
    // It's the first part of createUProfile('outer', ...).
    const dummyOuter = createUProfile(connClearance + connWallT, 0, 'outer'); 
    // Extract points? No, just copy logic.
    
    // Reuse dimensions from before
    const w_out = halfOW + (connClearance + connWallT);
    const top_out = yCoverTop + (connClearance + connWallT);
    const bottom_out = -1.2;
    const r_out_top = 0.8 + (connClearance + connWallT);
    
    centerShape.moveTo(w_out, bottom_out);
    centerShape.lineTo(w_out, top_out - r_out_top);
    centerShape.absarc(w_out - r_out_top, top_out - r_out_top, r_out_top, 0, Math.PI / 2, false);
    centerShape.lineTo(-(w_out - r_out_top), top_out);
    centerShape.absarc(-(w_out - r_out_top), top_out - r_out_top, r_out_top, Math.PI / 2, Math.PI, false);
    centerShape.lineTo(-w_out, bottom_out);
    
    // Connect to Inner Boundary (Inner Sleeve Inner Wall)
    // This is the 'inner' type Inner Path logic.
    // offset = connClearance + connWallT
    const off_in = connClearance + connWallT;
    const cx_left = -(halfIW - 1.0);
    const cx_right = halfIW - 1.0;
    const cy_bottom = 1.0;
    const w_in = halfIW - off_in;
    const top_in = yCoverInnerTop - off_in;
    const r_in = Math.max(0.1, 1.0 - off_in);
    
    // Line to Inner Bottom Left
    // The Outer ended at (-w_out, -1.2).
    // The Inner starts at (cx_left, 0) + arc adjustment? 
    // Inner Sleeve Inner Path starts at bottom of arc: (cx_left, 0).
    // So we line to (-w_out, 0)? No.
    // We line to (-w_in_box, 0)?
    // The Inner Sleeve starts at the Floor (y=0).
    // The Outer Sleeve starts at the Outer Floor (y=-1.2).
    // So we line from (-w_out, -1.2) to (-w_out, 0) then in?
    // Or just line directly to the Inner start point.
    centerShape.lineTo(cx_left, 0); // Gap closes
    
    // Trace Inner Path (CW)
    centerShape.absarc(cx_left, cy_bottom, r_in, 1.5 * Math.PI, Math.PI, true);
    centerShape.lineTo(-w_in, top_in);
    centerShape.lineTo(w_in, top_in);
    centerShape.lineTo(w_in, cy_bottom);
    centerShape.absarc(cx_right, cy_bottom, r_in, 0, -Math.PI/2, true);
    
    // Close
    centerShape.lineTo(w_out, bottom_out);

    return {
        center: centerShape,
        outerSleeve: outerSleeve,
        innerSleeve: innerSleeve
    };
}