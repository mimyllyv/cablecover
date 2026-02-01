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
            // MODIFICATION: Add step/indent to clear Cover Claws.
            
            const indent = 0.8; 
            // Define Taper Zone
            const yTaperTop = innerHeight - 1.5; // Where full indent is reached
            const yTaperBottom = innerHeight - 2.5; // Where taper starts

            // Dimensions
            w_out = halfIW - outerOffset;
            top_out = yCoverInnerTop - outerOffset;
            bottom_out = 0; 

            w_in = halfIW - innerOffset;
            top_in = yCoverInnerTop - innerOffset;
            bottom_in = 0;

            r_out_top = Math.max(0.1, 1.0 - outerOffset); 
            r_in_top = Math.max(0.1, 1.0 - innerOffset);

            // Draw CCW Outer Path
            shape.moveTo(w_out, bottom_out);
            shape.lineTo(w_out, yTaperBottom); // Up to Taper Start
            shape.lineTo(w_out - indent, yTaperTop); // Taper In
            shape.lineTo(w_out - indent, top_out - r_out_top); // Up to Top Arc start
            
            // Top Right Arc
            shape.absarc((w_out - indent) - r_out_top, top_out - r_out_top, r_out_top, 0, Math.PI / 2, false);
            shape.lineTo(-((w_out - indent) - r_out_top), top_out);
            
            // Top Left Arc
            shape.absarc(-((w_out - indent) - r_out_top), top_out - r_out_top, r_out_top, Math.PI / 2, Math.PI, false);
            
            shape.lineTo(-(w_out - indent), yTaperTop); // Down to Taper Top
            shape.lineTo(-w_out, yTaperBottom); // Taper Out
            shape.lineTo(-w_out, bottom_out); // Down to Bottom
            
            // Connect to Inner Path
            shape.lineTo(-w_in, bottom_in);
            
            // Draw CW Inner Path (Reverse)
            shape.lineTo(-w_in, yTaperBottom); // Up to Taper Start
            shape.lineTo(-(w_in - indent), yTaperTop); // Taper In
            
            shape.lineTo(-(w_in - indent), top_in - r_in_top); // Up to Arc
            
            // Top Left Arc (CW)
            shape.absarc(-((w_in - indent) - r_in_top), top_in - r_in_top, r_in_top, Math.PI, Math.PI / 2, true);
            shape.lineTo((w_in - indent) - r_in_top, top_in);
            
            // Top Right Arc (CW)
            shape.absarc((w_in - indent) - r_in_top, top_in - r_in_top, r_in_top, Math.PI / 2, 0, true);
            
            shape.lineTo(w_in - indent, yTaperTop); // Down to Taper Top
            shape.lineTo(w_in, yTaperBottom); // Taper Out
            shape.lineTo(w_in, bottom_in); // Down to Bottom
            
            // Close
            shape.lineTo(w_out, bottom_out);
        }
        return shape;
    };

    // 3. Generate Specific Shapes
    
    // Taper/Indent Settings
    const indent = 0.8; 
    const yTaperTop = innerHeight - 1.5; 
    const yTaperBottom = innerHeight - 2.5;

    // Outer Sleeve
    const outerSleeve = createUProfile(connClearance + connWallT, connClearance, 'outer');
    
    // Inner Sleeve
    const innerSleeve = createUProfile(connClearance, connClearance + connWallT, 'inner');
    
    // Center Solid Profile
    const centerShape = new THREE.Shape();
    // Trace OuterSleeve Outer Boundary (CCW)
    const w_out_c = halfOW + (connClearance + connWallT);
    const top_out_c = yCoverTop + (connClearance + connWallT);
    const bottom_out_c = -1.2;
    const r_out_top_c = 0.8 + (connClearance + connWallT);
    
    centerShape.moveTo(w_out_c, bottom_out_c);
    centerShape.lineTo(w_out_c, top_out_c - r_out_top_c);
    centerShape.absarc(w_out_c - r_out_top_c, top_out_c - r_out_top_c, r_out_top_c, 0, Math.PI / 2, false);
    centerShape.lineTo(-(w_out_c - r_out_top_c), top_out_c);
    centerShape.absarc(-(w_out_c - r_out_top_c), top_out_c - r_out_top_c, r_out_top_c, Math.PI / 2, Math.PI, false);
    centerShape.lineTo(-w_out_c, bottom_out_c);
    
    // Connect to Inner Boundary (Inner Sleeve Inner Wall)
    // Inner Boundary params
    const off_in_c = connClearance + connWallT;
    const cx_left_c = -(halfIW - 1.0);
    const cx_right_c = halfIW - 1.0;
    const cy_bottom_c = 1.0;
    const w_in_c = halfIW - off_in_c;
    const top_in_c = yCoverInnerTop - off_in_c;
    const r_in_c = Math.max(0.1, 1.0 - off_in_c);
    
    centerShape.lineTo(cx_left_c, 0); 
    
    // Trace Inner Path (CW) with Taper
    // Bottom Left Arc
    centerShape.absarc(cx_left_c, cy_bottom_c, r_in_c, 1.5 * Math.PI, Math.PI, true);
    
    // Up to Taper
    centerShape.lineTo(-w_in_c, yTaperBottom);
    // Taper In
    centerShape.lineTo(-(w_in_c - indent), yTaperTop);
    
    // Up to Top Left Arc
    centerShape.lineTo(-(w_in_c - indent), top_in_c - r_in_c);
    centerShape.absarc(-((w_in_c - indent) - r_in_c), top_in_c - r_in_c, r_in_c, Math.PI, Math.PI / 2, true);
    
    // Across Top
    centerShape.lineTo((w_in_c - indent) - r_in_c, top_in_c);
    
    // Top Right Arc
    centerShape.absarc((w_in_c - indent) - r_in_c, top_in_c - r_in_c, r_in_c, Math.PI / 2, 0, true);
    
    // Down to Taper
    centerShape.lineTo(w_in_c - indent, yTaperTop);
    // Taper Out
    centerShape.lineTo(w_in_c, yTaperBottom);
    
    // Down to Bottom Right Arc
    centerShape.lineTo(w_in_c, cy_bottom_c);
    centerShape.absarc(cx_right_c, cy_bottom_c, r_in_c, 0, -Math.PI/2, true);
    
    // Close
    centerShape.lineTo(w_out_c, bottom_out_c);

    return {
        center: centerShape,
        outerSleeve: outerSleeve,
        innerSleeve: innerSleeve
    };
}