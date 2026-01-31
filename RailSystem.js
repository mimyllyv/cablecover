import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createRailShape, createCoverShape } from './shapes.js';

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
        const coverShape = createCoverShape(params.innerWidth, params.innerHeight);

        this.clearMeshes();

        let railGeometry, coverGeometry;
        let path = null;

        if (params.isAngledMode) {
            path = this.createRoundedPath(params.len1, params.len2, params.angle, params.radius, params.turnAxis);
            const extrudeSettings = { steps: 200, extrudePath: path, bevelEnabled: false };
            railGeometry = new THREE.ExtrudeGeometry(railShape, extrudeSettings);
            coverGeometry = new THREE.ExtrudeGeometry(coverShape, extrudeSettings);
        } else {
            const extrudeSettings = { steps: 1, depth: params.length, bevelEnabled: false };
            railGeometry = new THREE.ExtrudeGeometry(railShape, extrudeSettings);
            railGeometry.computeBoundingBox();
            const zOffset = -params.length / 2;
            const yOffset = -railGeometry.boundingBox.min.y;
            railGeometry.translate(-10, yOffset, zOffset);
            
            coverGeometry = new THREE.ExtrudeGeometry(coverShape, extrudeSettings);
            coverGeometry.translate(-10, yOffset, zOffset);
        }

        const checkNaN = (geo) => {
            if (!geo || !geo.attributes.position) return false;
            const array = geo.attributes.position.array;
            for (let i = 0; i < array.length; i++) {
                if (isNaN(array[i])) return true;
            }
            return false;
        };

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
        const mesh = type === 'rail' ? this.meshes.rail : this.meshes.cover;
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
        
        // 4. Ensure normals are correct
        this._fixNormals(exportMesh);
    
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
}
