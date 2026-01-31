import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { parseDXF, convertEntitiesToShape } from './dxf-to-shape.js';

// Apply BVH extension
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export class RailSystem {
    constructor(scene) {
        this.scene = scene;
        this.csgEvaluator = new Evaluator();

        this.materials = {
            rail: new THREE.MeshStandardMaterial({ color: 0x00ff00, roughness: 0.5, metalness: 0.1, side: THREE.DoubleSide }),
            cover: new THREE.MeshStandardMaterial({ color: 0x00aaff, roughness: 0.5, metalness: 0.1, side: THREE.DoubleSide }),
            cutter: new THREE.MeshStandardMaterial({ color: 0xff0000, transparent: true, opacity: 0.5 })
        };

        this.meshes = {
            rail: null,
            cover: null,
            visuals: []
        };

        this.shapes = {
            rail: null,
            cover: null
        };
    }

    async loadProfiles() {
        try {
            const [railText, coverText] = await Promise.all([
                fetch('/rail.dxf').then(res => res.text()),
                fetch('/cover.dxf').then(res => res.text())
            ]);

            const railDxf = parseDXF(railText);
            const coverDxf = parseDXF(coverText);

            if (railDxf?.entities) this.shapes.rail = convertEntitiesToShape(railDxf.entities);
            if (coverDxf?.entities) this.shapes.cover = convertEntitiesToShape(coverDxf.entities);

            console.log("Profiles loaded");
        } catch (e) {
            console.error("Failed to load profiles:", e);
        }
    }

    clearMeshes() {
        if (this.meshes.rail) {
            this.scene.remove(this.meshes.rail);
            if (this.meshes.rail.geometry) this.meshes.rail.geometry.dispose();
            this.meshes.rail = null;
        }
        if (this.meshes.cover) {
            this.scene.remove(this.meshes.cover);
            if (this.meshes.cover.geometry) this.meshes.cover.geometry.dispose();
            this.meshes.cover = null;
        }
        this.meshes.visuals.forEach(mesh => {
            if (mesh.geometry) mesh.geometry.dispose();
            this.scene.remove(mesh);
        });
        this.meshes.visuals = [];
    }

    createRoundedPath(l1, l2, angleDeg, r, axis) {
        const theta = (angleDeg * Math.PI) / 180;
        const tanDist = r * Math.tan(theta / 2);

        if (l1 < tanDist || l2 < tanDist) {
            console.warn("Lengths too short for radius/angle");
        }

        const path = new THREE.CurvePath();

        // Start at (0,0,0) facing +Z
        const start = new THREE.Vector3(0, 0, 0);
        const seg1Len = Math.max(0, l1 - tanDist);
        const p1 = new THREE.Vector3(0, 0, seg1Len);

        path.add(new THREE.LineCurve3(start, p1));

        // Corner
        const pCorner = new THREE.Vector3(0, 0, l1);
        let dir2;

        if (axis === 'vertical') {
            dir2 = new THREE.Vector3(0, Math.sin(theta), Math.cos(theta));
        } else {
            dir2 = new THREE.Vector3(Math.sin(theta), 0, Math.cos(theta));
        }

        const p2 = pCorner.clone().add(dir2.clone().multiplyScalar(tanDist));
        path.add(new THREE.QuadraticBezierCurve3(p1, pCorner, p2));

        // Line 2
        const seg2Len = Math.max(0, l2 - tanDist);
        const end = p2.clone().add(dir2.clone().multiplyScalar(seg2Len));
        path.add(new THREE.LineCurve3(p2, end));

        return path;
    }

    generate(params, skipHoles = false) {
        if (!this.shapes.rail || !this.shapes.cover) return;

        this.clearMeshes();

        let railGeometry, coverGeometry;
        let path = null;

        if (params.isAngledMode) {
            path = this.createRoundedPath(params.len1, params.len2, params.angle, params.radius, params.turnAxis);
            const extrudeSettings = { steps: 200, extrudePath: path, bevelEnabled: false };
            railGeometry = new THREE.ExtrudeGeometry(this.shapes.rail, extrudeSettings);
            coverGeometry = new THREE.ExtrudeGeometry(this.shapes.cover, extrudeSettings);
        } else {
            const extrudeSettings = { steps: 1, depth: params.length, bevelEnabled: false };
            railGeometry = new THREE.ExtrudeGeometry(this.shapes.rail, extrudeSettings);
            railGeometry.computeBoundingBox();
            
            // Center Straight Rail
            const zOffset = -params.length / 2;
            const yOffset = -railGeometry.boundingBox.min.y;
            railGeometry.translate(-10, yOffset, zOffset);
            
            coverGeometry = new THREE.ExtrudeGeometry(this.shapes.cover, extrudeSettings);
            coverGeometry.translate(-10, yOffset, zOffset);
        }

        // --- Hole Logic ---
        if (!skipHoles && params.holeCount > 0 && params.holeDiameter > 0) {
            let railBrush = new Brush(railGeometry, this.materials.rail);
            railBrush.updateMatrixWorld();
            
            let resultBrush = railBrush;
            const cylinderGeo = new THREE.CylinderGeometry(params.holeDiameter / 2, params.holeDiameter / 2, 12.5, 32);

            for (let i = 0; i < params.holeCount; i++) {
                const holeBrush = new Brush(cylinderGeo, this.materials.rail);
                let pos = new THREE.Vector3();
                let quat = new THREE.Quaternion();

                if (params.isAngledMode) {
                    const t = (i + 0.5) / params.holeCount;
                    pos.copy(path.getPointAt(t));
                    
                                    if (params.turnAxis === 'vertical') {
                                        // Align Y -> X
                                        quat.setFromAxisAngle(new THREE.Vector3(0,0,1), -Math.PI / 2);
                                        // Shift 'Lower' (World -Y). In CSG frame (rotated -90 Z), -Y becomes -X.
                                        // So shift along -X.
                                        pos.x -= 3.0;
                                    } else {
                                        // Horizontal: Align with Curve Normal
                                        const tangent = path.getTangentAt(t);
                                        const normal = new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(0, 1, 0)).normalize();
                                        // User feedback suggests removing the -90 correction for orientation.
                                        // normal.applyAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2);
                                        
                                        quat.setFromUnitVectors(new THREE.Vector3(0,1,0), normal);
                                        
                                                            // Shift 'Lower' (World -Y). 
                                        
                                                            // In Horizontal Mode, the 'Normal' vector becomes the Vertical vector after +90 Z rotation.
                                        
                                                            // User feedback indicates -3.0 made it worse, implying direction was flipped.
                                        
                                                            // Reversing to +3.0.
                                        
                                                            pos.addScaledVector(normal, 3.0);
                                        
                                                        }                } else {
                    // Straight Mode
                    const step = params.length / params.holeCount;
                    const zPos = -params.length / 2 + step * (i + 0.5);
                    pos.set(-10, 0, zPos);
                    // Default orientation (Y-up) is correct for straight
                }

                holeBrush.position.copy(pos);
                holeBrush.quaternion.copy(quat);
                holeBrush.updateMatrixWorld();
                
                resultBrush = this.csgEvaluator.evaluate(resultBrush, holeBrush, SUBTRACTION);

                // Visual
                const visualHole = new THREE.Mesh(cylinderGeo, this.materials.cutter);
                visualHole.position.copy(pos);
                visualHole.quaternion.copy(quat);
                visualHole.visible = params.showCutters;
                this.meshes.visuals.push(visualHole);
            }
            this.meshes.rail = resultBrush;
        } else {
            this.meshes.rail = new THREE.Mesh(railGeometry, this.materials.rail);
        }

        this.meshes.cover = new THREE.Mesh(coverGeometry, this.materials.cover);

        // --- Final Orientation ---
        if (params.isAngledMode) {
            this.meshes.rail.rotation.z = Math.PI / 2;
            this.meshes.cover.rotation.z = Math.PI / 2;
            // Add visuals as children so they rotate with the rail
            this.meshes.visuals.forEach(v => this.meshes.rail.add(v));
        } else {
             // Straight mode visuals are added to scene directly
             this.meshes.visuals.forEach(v => this.scene.add(v));
        }

        this.meshes.rail.castShadow = true;
        this.meshes.rail.receiveShadow = true;
        this.meshes.cover.castShadow = true;
        this.meshes.cover.receiveShadow = true;

        // --- Fix Angled Vertical Position ---
        if (params.isAngledMode) {
            // Compute bbox to find lowest Y point
            this.meshes.rail.geometry.computeBoundingBox();
            const bbox = this.meshes.rail.geometry.boundingBox;
            
            // The mesh is rotated, so we need to account for that. 
            // Or simpler: apply the rotation to a temporary geometry copy to measure?
            // Actually, since we set rotation.z, the local bbox is still unrotated.
            // Local Min Y becomes Global Min X (rotated 90).
            // Local Min X becomes Global Min Y.
            // So we need to look at Local X.
            
            // Let's just updateMatrixWorld and use setFromObject for global box
            this.meshes.rail.updateMatrixWorld();
            const globalBox = new THREE.Box3().setFromObject(this.meshes.rail);
            const yOffset = -globalBox.min.y;
            
            this.meshes.rail.position.y += yOffset;
            this.meshes.cover.position.y += yOffset;
        }

        this.scene.add(this.meshes.rail);
        this.scene.add(this.meshes.cover);
    }

    exportSTL(type) {
        const mesh = type === 'rail' ? this.meshes.rail : this.meshes.cover;
        if (!mesh) return;

        const exportMesh = mesh.clone();
        // Crucial: Clone geometry because mesh.clone() shares the same geometry instance.
        // If we don't clone, applyMatrix4 will rotate the visible model in the scene.
        if (exportMesh.geometry) {
            exportMesh.geometry = exportMesh.geometry.clone();
        }

        exportMesh.clear(); // Remove children (cutters)

        if (!exportMesh.geometry) return;
        // Rotate +90 X for printing orientation
        exportMesh.rotation.x += Math.PI / 2;
        exportMesh.updateMatrixWorld();
        exportMesh.geometry.applyMatrix4(exportMesh.matrixWorld);
        exportMesh.rotation.set(0, 0, 0);
        exportMesh.position.set(0, 0, 0);
        exportMesh.scale.set(1, 1, 1);

        const exporter = new STLExporter();
        const result = exporter.parse(exportMesh, { binary: true });
        const blob = new Blob([result], { type: 'application/octet-stream' });

        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${type}.stl`;
        link.click();
    }

    updateCuttersVisibility(visible) {
        this.meshes.visuals.forEach(v => v.visible = visible);
    }
}
