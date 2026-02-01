import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createRailShape, createCoverShape, createConnectorShapes } from './shapes.js';

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

    clearMeshes() {
        if (this.meshes.rail) {
            this.scene.remove(this.meshes.rail);
            if(this.meshes.rail.geometry) this.meshes.rail.geometry.dispose();
            this.meshes.rail = null;
        }
        if (this.meshes.cover) {
            this.scene.remove(this.meshes.cover);
            if(this.meshes.cover.geometry) this.meshes.cover.geometry.dispose();
            this.meshes.cover = null;
        }
        this.meshes.visuals.forEach(mesh => {
            if(mesh.geometry) mesh.geometry.dispose();
            this.scene.remove(mesh);
        });
        this.meshes.visuals = [];
    }

    createRoundedPath(l1, l2, angleDeg, r, axis) {
        const theta = (angleDeg * Math.PI) / 180;
        const epsilon = 0.1;
        const maxTan = Math.min(l1, l2) - epsilon;
        let tanDist = Math.abs(r * Math.tan(theta / 2));
        
        if (tanDist > maxTan) {
            tanDist = Math.max(0, maxTan);
        }
        
        if (Math.abs(angleDeg) < 0.1 || tanDist < 0.1) {
             const path = new THREE.CurvePath();
             const start = new THREE.Vector3(0,0,0);
             const corner = new THREE.Vector3(0,0,l1);
             
             let dir2;
             if (axis === 'vertical') {
                 dir2 = new THREE.Vector3(0, Math.sin(theta), Math.cos(theta));
             } else {
                 dir2 = new THREE.Vector3(Math.sin(theta), 0, Math.cos(theta));
             }
             const end = corner.clone().add(dir2.multiplyScalar(l2));
             
             path.add(new THREE.LineCurve3(start, corner));
             path.add(new THREE.LineCurve3(corner, end));
             return path;
        }
    
        const path = new THREE.CurvePath();
        const start = new THREE.Vector3(0,0,0);
        const seg1Len = Math.max(0, l1 - tanDist);
        const p1 = new THREE.Vector3(0, 0, seg1Len);
        path.add(new THREE.LineCurve3(start, p1));
    
        const pCorner = new THREE.Vector3(0, 0, l1);
        let dir2;
        if (axis === 'vertical') {
            dir2 = new THREE.Vector3(0, Math.sin(theta), Math.cos(theta));
        } else {
            dir2 = new THREE.Vector3(Math.sin(theta), 0, Math.cos(theta));
        }
        
        const p2 = pCorner.clone().add(dir2.clone().multiplyScalar(tanDist)); 
        path.add(new THREE.QuadraticBezierCurve3(p1, pCorner, p2));
    
        const seg2Len = Math.max(0, l2 - tanDist);
        const end = p2.clone().add(dir2.clone().multiplyScalar(seg2Len));
        path.add(new THREE.LineCurve3(p2, end));
    
        return path;
    }

    generate(params, skipHoles = false) {
        const railShape = createRailShape(params.innerWidth, params.innerHeight);

        this.clearMeshes();

        let railGeometry, coverGeometry;
        let path = null;

        const checkNaN = (geo) => {
            if (!geo || !geo.attributes.position) return false;
            const array = geo.attributes.position.array;
            for (let i = 0; i < array.length; i++) {
                if (isNaN(array[i])) return true;
            }
            return false;
        };

        if (params.isAngledMode) {
            path = this.createRoundedPath(params.len1, params.len2, params.angle, params.radius, params.turnAxis);
            const extrudeSettings = { steps: 200, extrudePath: path, bevelEnabled: false };
            railGeometry = new THREE.ExtrudeGeometry(railShape, extrudeSettings);
            
            // New Logic for Cover: Segments with/without claws (Angled)
            const sleeveLen = params.connLength / 3.0;
            
            // Re-calculate geometric points to define split segments
            const theta = (params.angle * Math.PI) / 180;
            // logic from createRoundedPath to get lengths
            const tanDistRaw = Math.abs(params.radius * Math.tan(theta / 2));
            const maxTan = Math.min(params.len1, params.len2) - 0.1; 
            const tanDist = (tanDistRaw > maxTan) ? Math.max(0, maxTan) : tanDistRaw;
            
            const seg1Len = Math.max(0, params.len1 - tanDist);
            const seg2Len = Math.max(0, params.len2 - tanDist);

            if (seg1Len > sleeveLen && seg2Len > sleeveLen) {
                const shapeNoClaws = createCoverShape(params.innerWidth, params.innerHeight, params.clearance, false);
                const shapeClaws = createCoverShape(params.innerWidth, params.innerHeight, params.clearance, true);

                // Vectors
                const start = new THREE.Vector3(0,0,0);
                const p1 = new THREE.Vector3(0,0, seg1Len); 
                const pCorner = new THREE.Vector3(0,0, params.len1);
                
                let dir2;
                if (params.turnAxis === 'vertical') {
                     dir2 = new THREE.Vector3(0, Math.sin(theta), Math.cos(theta));
                } else {
                     dir2 = new THREE.Vector3(Math.sin(theta), 0, Math.cos(theta));
                }
                
                const p2 = pCorner.clone().add(dir2.clone().multiplyScalar(tanDist)); 
                const end = p2.clone().add(dir2.clone().multiplyScalar(seg2Len));

                // --- Path 1: Start (No Claws) ---
                const path1 = new THREE.CurvePath();
                const pSplit1 = new THREE.Vector3(0,0, sleeveLen);
                path1.add(new THREE.LineCurve3(start, pSplit1));
                
                // --- Path 2: Middle (Claws) ---
                const path2 = new THREE.CurvePath();
                path2.add(new THREE.LineCurve3(pSplit1, p1));
                path2.add(new THREE.QuadraticBezierCurve3(p1, pCorner, p2));
                
                const pSplit2 = end.clone().sub(dir2.clone().multiplyScalar(sleeveLen));
                path2.add(new THREE.LineCurve3(p2, pSplit2));
                
                // --- Part 3: End (No Claws) ---
                // Replaced path3 with manual transform to avoid ExtrudeGeometry singularities
                const geoStart = new THREE.ExtrudeGeometry(shapeNoClaws, { steps: 1, extrudePath: path1, bevelEnabled: false });
                const geoMid = new THREE.ExtrudeGeometry(shapeClaws, { steps: 200, extrudePath: path2, bevelEnabled: false });
                
                const geoEnd = new THREE.ExtrudeGeometry(shapeNoClaws, { depth: sleeveLen, bevelEnabled: false, steps: 1 });
                
                // Explicitly rotate based on turn params to ensure correct orientation (prevent twisting)
                const q = new THREE.Quaternion();
                if (params.turnAxis === 'vertical') {
                    // Vertical turn: Rotate around X. 
                    q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -theta);
                } else {
                    // Horizontal turn: Rotate around Y.
                    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), theta);
                }
                
                // Correction: Roll -90 degrees around Z before directional rotation to match geoMid twist
                const qRoll = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2);
                q.multiply(qRoll);

                geoEnd.applyQuaternion(q);
                geoEnd.translate(pSplit2.x, pSplit2.y, pSplit2.z);
                
                coverGeometry = BufferGeometryUtils.mergeGeometries([geoStart, geoMid, geoEnd]);
            } else {
                // Too short segments -> Full No Claws
                const shapeNoClaws = createCoverShape(params.innerWidth, params.innerHeight, params.clearance, false);
                coverGeometry = new THREE.ExtrudeGeometry(shapeNoClaws, extrudeSettings);
            }
        } else {
            const extrudeSettings = { steps: 1, depth: params.length, bevelEnabled: false };
            railGeometry = new THREE.ExtrudeGeometry(railShape, extrudeSettings);
            railGeometry.computeBoundingBox();
            const zOffset = -params.length / 2;
            const yOffset = -railGeometry.boundingBox.min.y;
            railGeometry.translate(-10, yOffset, zOffset);
            
            // New Logic for Cover: Segments with/without claws
            const sleeveLen = params.connLength / 3.0;
            
            if (params.length > 2 * sleeveLen) {
                const midLen = params.length - 2 * sleeveLen;
                
                const shapeNoClaws = createCoverShape(params.innerWidth, params.innerHeight, params.clearance, false);
                const shapeClaws = createCoverShape(params.innerWidth, params.innerHeight, params.clearance, true);
                
                // 1. Start (No Claws)
                const geoStart = new THREE.ExtrudeGeometry(shapeNoClaws, { depth: sleeveLen, bevelEnabled: false, steps: 1 });
                
                // 2. Middle (Claws)
                const geoMid = new THREE.ExtrudeGeometry(shapeClaws, { depth: midLen, bevelEnabled: false, steps: 1 });
                geoMid.translate(0, 0, sleeveLen);
                
                // 3. End (No Claws)
                const geoEnd = new THREE.ExtrudeGeometry(shapeNoClaws, { depth: sleeveLen, bevelEnabled: false, steps: 1 });
                geoEnd.translate(0, 0, sleeveLen + midLen);
                
                coverGeometry = BufferGeometryUtils.mergeGeometries([geoStart, geoMid, geoEnd]);
            } else {
                // Short segment, use No Claws entirely
                 const shapeNoClaws = createCoverShape(params.innerWidth, params.innerHeight, params.clearance, false);
                 coverGeometry = new THREE.ExtrudeGeometry(shapeNoClaws, { depth: params.length, bevelEnabled: false, steps: 1 });
            }

            coverGeometry.translate(-10, yOffset, zOffset);
        }

        if (checkNaN(railGeometry) || checkNaN(coverGeometry)) {
            console.error("Generated geometry contains NaN values. Aborting mesh update.");
            return;
        }

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
                        quat.setFromAxisAngle(new THREE.Vector3(0,0,1), -Math.PI / 2);
                        pos.x -= 3.0;
                    } else {
                        const tangent = path.getTangentAt(t);
                        const normal = new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(0, 1, 0)).normalize();
                        quat.setFromUnitVectors(new THREE.Vector3(0,1,0), normal);
                        pos.addScaledVector(normal, 3.0);
                    }
                } else {
                    const step = params.length / params.holeCount;
                    const zPos = -params.length / 2 + step * (i + 0.5);
                    pos.set(-10, 0, zPos);
                }

                holeBrush.position.copy(pos);
                holeBrush.quaternion.copy(quat);
                holeBrush.updateMatrixWorld();
                resultBrush = this.csgEvaluator.evaluate(resultBrush, holeBrush, SUBTRACTION);

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

        if (params.isAngledMode) {
            this.meshes.rail.rotation.z = Math.PI / 2;
            this.meshes.cover.rotation.z = Math.PI / 2;
            this.meshes.rail.updateMatrixWorld();
            const globalBox = new THREE.Box3().setFromObject(this.meshes.rail);
            const yOffset = -globalBox.min.y;
            this.meshes.rail.position.y += yOffset;
            this.meshes.cover.position.y += yOffset;
            const zOffset = -params.len1;
            this.meshes.rail.position.z += zOffset;
            this.meshes.cover.position.z += zOffset;
            this.meshes.visuals.forEach(v => this.meshes.rail.add(v));
        } else {
             this.meshes.visuals.forEach(v => this.scene.add(v));
        }

        this.meshes.rail.castShadow = true;
        this.meshes.rail.receiveShadow = true;
        this.meshes.cover.castShadow = true;
        this.meshes.cover.receiveShadow = true;
        this.scene.add(this.meshes.rail);
        this.scene.add(this.meshes.cover);
    }

    exportSTL(type, params) {
        let mesh;
        
        if (type === 'connector') {
            mesh = this.createConnectorMesh(params);
        } else {
            mesh = type === 'rail' ? this.meshes.rail : this.meshes.cover;
        }

        if (!mesh) return;
    
        const exportMesh = mesh.clone();
        if (exportMesh.geometry) exportMesh.geometry = exportMesh.geometry.clone();
        exportMesh.clear(); 
        
        if (!exportMesh.geometry) return;
    
        // 1. Bake current scene transform
        exportMesh.updateMatrixWorld();
        exportMesh.geometry.applyMatrix4(exportMesh.matrixWorld);
        
        // 2. Reset transforms
        exportMesh.position.set(0, 0, 0);
        exportMesh.rotation.set(0, 0, 0);
        exportMesh.scale.set(1, 1, 1);
        exportMesh.updateMatrixWorld();

        // 3. Apply Printing Rotation
        if (type === 'rail') {
            exportMesh.rotation.x = Math.PI / 2;
        } else {
            exportMesh.rotation.x = -Math.PI / 2;
        }

        // Horizontal angled sections need 90 deg on blue (Z) axis
        if (params.isAngledMode && params.turnAxis === 'horizontal') {
            exportMesh.rotation.z = Math.PI / 2;
        }
        
        exportMesh.updateMatrixWorld();
        exportMesh.geometry.applyMatrix4(exportMesh.matrixWorld);
        
        // Reset after bake
        exportMesh.rotation.set(0, 0, 0);
        exportMesh.updateMatrixWorld();
        
        // 4. Final Prep
        exportMesh.geometry = BufferGeometryUtils.mergeVertices(exportMesh.geometry);
        exportMesh.geometry.computeVertexNormals();
    
        const exporter = new STLExporter();
        const result = exporter.parse(exportMesh, { binary: true });
        const blob = new Blob([result], { type: 'application/octet-stream' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${type}.stl`;
        link.click();
    }

    _fixNormals(mesh) {
        if (!mesh.geometry) return;
        if (!mesh.geometry.index) mesh.geometry = BufferGeometryUtils.mergeVertices(mesh.geometry);
        const geom = mesh.geometry;
        geom.computeBoundsTree();
        const pos = geom.attributes.position;
        const index = geom.index;
        const raycaster = new THREE.Raycaster();
        raycaster.firstHitOnly = false;
        const count = index.count / 3;
        const pA = new THREE.Vector3(), pB = new THREE.Vector3(), pC = new THREE.Vector3();
        const center = new THREE.Vector3(), normal = new THREE.Vector3(), direction = new THREE.Vector3();
        for (let i = 0; i < count; i++) {
            const a = index.getX(i * 3);
            const b = index.getX(i * 3 + 1);
            const c = index.getX(i * 3 + 2);
            pA.fromBufferAttribute(pos, a); pB.fromBufferAttribute(pos, b); pC.fromBufferAttribute(pos, c);
            center.addVectors(pA, pB).add(pC).multiplyScalar(1/3);
            const cb = new THREE.Vector3().subVectors(pC, pB);
            const ab = new THREE.Vector3().subVectors(pA, pB);
            normal.crossVectors(cb, ab).normalize();
            const start = center.clone().addScaledVector(normal, 0.001);
            direction.copy(normal);
            raycaster.set(start, direction);
            if (raycaster.intersectObject(mesh, true).length % 2 !== 0) {
                index.setX(i * 3 + 1, c);
                index.setX(i * 3 + 2, b);
            }
        }
        index.needsUpdate = true;
        geom.disposeBoundsTree();
        geom.computeVertexNormals();
    }

    updateCuttersVisibility(visible) {
        this.meshes.visuals.forEach(v => v.visible = visible);
    }

    updateComponentVisibility(showRail, showCover) {
        if (this.meshes.rail) this.meshes.rail.visible = showRail;
        if (this.meshes.cover) this.meshes.cover.visible = showCover;
    }

    createConnectorMesh(params) {
        const { center, outerSleeve, innerSleeve } = createConnectorShapes(
            params.innerWidth, 
            params.innerHeight, 
            params.connClearance, 
            params.connWall
        );

        const totalLen = params.connLength;
        const sectionLen = totalLen / 3.0;

        // 1. Center Section (Solid Stop)
        // Middle 1/3: Z = -sectionLen/2 to sectionLen/2
        const centerGeo = new THREE.ExtrudeGeometry(center, { depth: sectionLen, bevelEnabled: false, steps: 1 });
        centerGeo.translate(0, 0, -sectionLen / 2);

        // 2. Sleeves (Ends only)
        // We need Front (Z > sectionLen/2) and Back (Z < -sectionLen/2) parts.
        // Each part has length = sectionLen.
        
        // Front Sleeve (Outer + Inner)
        // Position: Z = sectionLen/2 to sectionLen/2 + sectionLen (which is totalLen/2)
        // Extrude depth = sectionLen.
        // Initial extrusion is 0 to D. Translate to sectionLen/2.
        
        const frontOuter = new THREE.ExtrudeGeometry(outerSleeve, { depth: sectionLen, bevelEnabled: false, steps: 1 });
        frontOuter.translate(0, 0, sectionLen / 2);
        
        const frontInner = new THREE.ExtrudeGeometry(innerSleeve, { depth: sectionLen, bevelEnabled: false, steps: 1 });
        frontInner.translate(0, 0, sectionLen / 2);

        // Back Sleeve (Outer + Inner)
        // Position: Z = -sectionLen/2 - sectionLen to -sectionLen/2.
        // Translate to -sectionLen/2 - sectionLen = -1.5 * sectionLen
        const backOuter = new THREE.ExtrudeGeometry(outerSleeve, { depth: sectionLen, bevelEnabled: false, steps: 1 });
        backOuter.translate(0, 0, -1.5 * sectionLen);

        const backInner = new THREE.ExtrudeGeometry(innerSleeve, { depth: sectionLen, bevelEnabled: false, steps: 1 });
        backInner.translate(0, 0, -1.5 * sectionLen);

        // Merge all 5 parts
        // Center + Front(Outer/Inner) + Back(Outer/Inner)
        // This ensures no volumetric overlap, only touching faces at Z boundaries.
        
        const mergedGeo = BufferGeometryUtils.mergeGeometries([
            centerGeo, 
            frontOuter, frontInner,
            backOuter, backInner
        ]);
        
        // Optional: mergeVertices to weld the seams
        const weldedGeo = BufferGeometryUtils.mergeVertices(mergedGeo);
        
        const mesh = new THREE.Mesh(weldedGeo, this.materials.rail); 
        
        return mesh;
    }
}
