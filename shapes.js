import * as THREE from 'three';

// Debug helper
function log(msg, val) {
    if (val !== undefined) {
        console.log(`[ShapeDebug] ${msg}:`, val);
        if (typeof val === 'number' && isNaN(val)) {
            console.error(`[ShapeDebug] NAN DETECTED: ${msg}`);
        }
    } else {
        console.log(`[ShapeDebug] ${msg}`);
    }
}

export function createRailShape(innerWidth, innerHeight) {
    // ... existing rail code (omitted for brevity, assume it works as Rail didn't throw NaN)
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

export function createCoverShape(innerWidth, innerHeight) {
    console.group("createCoverShape Debug Trace");
    log("Inputs", { innerWidth, innerHeight });

    const shape = new THREE.Shape();
    
    const halfIW = innerWidth / 2;
    const halfOW = halfIW + 1.2; 
    const yBead = innerHeight;
    const topY = yBead + 2.3; 
    const bottomY = yBead + 1.1; 
    
    const clipR = 1.1;
    const ribR = 2.3;
    const clawOffset = 0.5;

    log("Calculated Constants", { halfIW, halfOW, yBead, topY, bottomY, clipR, ribR, clawOffset });

    // Start Top Center
    log("moveTo", { x: 0, y: topY });
    shape.moveTo(0, topY);
    
    // --- RIGHT SIDE ---
    log("lineTo (Top Right)", { x: halfOW - 0.8, y: topY });
    shape.lineTo(halfOW - 0.8, topY);

    log("absarc (Top Right Corner)", { x: halfOW - 0.8, y: topY - 0.8, radius: 0.8, start: Math.PI/2, end: 0 });
    shape.absarc(halfOW - 0.8, topY - 0.8, 0.8, Math.PI / 2, 0, true);

    log("lineTo (Outer Wall Bottom)", { x: halfOW, y: bottomY });
    shape.lineTo(halfOW, bottomY);
    
    // Connect Outer Wall to Hook Start
    const rightClawX = halfIW - clawOffset;
    log("lineTo (Right Hook Start)", { x: rightClawX, y: bottomY });
    shape.lineTo(rightClawX, bottomY);
    
    // Right Hook Inner Curve (R1.1)
    const angleStartRight = Math.PI / 2;
    const angleEndRight = 250 * Math.PI / 180;
    log("absarc (Right Hook Inner)", { x: rightClawX, y: yBead, r: clipR, start: angleStartRight, end: angleEndRight });
    shape.absarc(rightClawX, yBead, clipR, angleStartRight, angleEndRight, false);
    
    // Connect Tip R1.1 to Tip R2.3
    const tipAngleRad = angleEndRight;
    const tipX = rightClawX + ribR * Math.cos(tipAngleRad);
    const tipY = yBead + ribR * Math.sin(tipAngleRad);
    log("lineTo (Right Rib Tip)", { x: tipX, y: tipY });
    shape.lineTo(tipX, tipY);
    
    // Right Rib Outer Curve (R2.3)
    const asinVal = 1.1/2.3;
    log("Math.asin(1.1/2.3)", asinVal);
    const asinRes = Math.asin(asinVal);
    log("Asin Result", asinRes);
    
    const endAngleRight = Math.PI - asinRes;
    log("absarc (Right Rib Outer)", { x: rightClawX, y: yBead, r: ribR, start: tipAngleRad, end: endAngleRight });
    shape.absarc(rightClawX, yBead, ribR, tipAngleRad, endAngleRight, true);
    
    // Connect to Center Span
    log("lineTo (Center Span)", { x: 0, y: bottomY });
    shape.lineTo(0, bottomY);
    
    // --- LEFT SIDE ---
    const leftClawX = -halfIW + clawOffset;
    const startAngleLeft = asinRes;
    const leftRibStartX = leftClawX + ribR * Math.cos(startAngleLeft);
    const leftRibStartY = yBead + ribR * Math.sin(startAngleLeft); // Should be bottomY
    
    log("Left Side Calc", { leftClawX, startAngleLeft, leftRibStartX, leftRibStartY });
    
    log("lineTo (Left Rib Start)", { x: leftRibStartX, y: bottomY });
    shape.lineTo(leftRibStartX, bottomY);
    
    // Left Rib Curve (R2.3)
    const leftTipAngleRad = -70 * Math.PI / 180;
    log("absarc (Left Rib Outer)", { x: leftClawX, y: yBead, r: ribR, start: startAngleLeft, end: leftTipAngleRad });
    shape.absarc(leftClawX, yBead, ribR, startAngleLeft, leftTipAngleRad, true);
    
    // Connect Tip R2.3 to Tip R1.1
    const leftInnerTipX = leftClawX + clipR * Math.cos(leftTipAngleRad);
    const leftInnerTipY = yBead + clipR * Math.sin(leftTipAngleRad);
    log("lineTo (Left Inner Tip)", { x: leftInnerTipX, y: leftInnerTipY });
    shape.lineTo(leftInnerTipX, leftInnerTipY);
    
    // Left Hook Inner Curve (R1.1)
    log("absarc (Left Hook Inner)", { x: leftClawX, y: yBead, r: clipR, start: leftTipAngleRad, end: Math.PI/2 });
    shape.absarc(leftClawX, yBead, clipR, leftTipAngleRad, Math.PI / 2, false);
    
    // Back to Outer Wall
    log("lineTo (Left Outer Wall Bottom)", { x: -halfOW, y: bottomY });
    shape.lineTo(-halfOW, bottomY);
    
    // Left Wall Up
    log("lineTo (Left Wall Top)", { x: -halfOW, y: topY - 0.8 });
    shape.lineTo(-halfOW, topY - 0.8);

    log("absarc (Top Left Corner)", { x: -halfOW + 0.8, y: topY - 0.8, r: 0.8, start: Math.PI, end: Math.PI/2 });
    shape.absarc(-halfOW + 0.8, topY - 0.8, 0.8, Math.PI, Math.PI / 2, true);
    
    // Close
    log("lineTo (Close Top)", { x: 0, y: topY });
    shape.lineTo(0, topY);

    console.groupEnd();
    return shape;
}
