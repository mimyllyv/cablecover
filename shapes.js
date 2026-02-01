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

export function createCoverShape(innerWidth, innerHeight, tolerance = 0.6) {
    const shape = new THREE.Shape();
    
    const halfIW = innerWidth / 2;
    const halfOW = halfIW + 1.2; 
    const yBead = innerHeight;
    const topY = yBead + 2.3; 
    const bottomY = yBead + 1.1; 
    
    const clipR = 1.1;
    const ribR = 2.3;
    const clawOffset = tolerance - 0.1;

    shape.moveTo(0, topY);
    shape.lineTo(halfOW - 0.8, topY);
    shape.absarc(halfOW - 0.8, topY - 0.8, 0.8, Math.PI / 2, 0, true);
    shape.lineTo(halfOW, bottomY);
    
    const rightClawX = halfIW - clawOffset;
    const angleStartRight = Math.PI / 2;
    const angleEndRight = 250 * Math.PI / 180;
    shape.absarc(rightClawX, yBead, clipR, angleStartRight, angleEndRight, false);
    
    const tipAngleRad = angleEndRight;
    const tipX = rightClawX + ribR * Math.cos(tipAngleRad);
    const tipY = yBead + ribR * Math.sin(tipAngleRad);
    shape.lineTo(tipX, tipY);
    
    const endAngleRight = Math.PI - Math.asin(1.1/2.3);
    shape.absarc(rightClawX, yBead, ribR, tipAngleRad, endAngleRight, true);
    
    shape.lineTo(0, bottomY);
    
    const leftClawX = -halfIW + clawOffset;
    const startAngleLeft = Math.asin(1.1/2.3);
    const leftRibStartX = leftClawX + ribR * Math.cos(startAngleLeft);
    
    shape.lineTo(leftRibStartX, bottomY);
    
    const leftTipAngleRad = -70 * Math.PI / 180;
    shape.absarc(leftClawX, yBead, ribR, startAngleLeft, leftTipAngleRad, true);
    
    const leftInnerTipX = leftClawX + clipR * Math.cos(leftTipAngleRad);
    const leftInnerTipY = yBead + clipR * Math.sin(leftTipAngleRad);
    shape.lineTo(leftInnerTipX, leftInnerTipY);
    
    shape.absarc(leftClawX, yBead, clipR, leftTipAngleRad, Math.PI / 2, false);
    
    shape.lineTo(-halfOW, bottomY);
    shape.lineTo(-halfOW, topY - 0.8);
    shape.absarc(-halfOW + 0.8, topY - 0.8, 0.8, Math.PI, Math.PI / 2, true);
    shape.lineTo(0, topY);

    return shape;
}