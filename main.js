import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { parseDXF, convertEntitiesToShape } from './dxf-to-shape.js';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Apply BVH extension to BufferGeometry
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x222222);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(20, 20, 30);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(10, 20, 10);
scene.add(directionalLight);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// Grid
const size = 300;
const divisions = 300;
const gridHelper = new THREE.GridHelper(size, divisions, 0x444444, 0x333333);
scene.add(gridHelper);

// Axes Helper
const axesHelper = new THREE.AxesHelper(10);
scene.add(axesHelper);

// State
let railMesh = null;
let coverMesh = null;
let currentMeshes = []; 
let currentLength = 100;
let railShape = null;
let coverShape = null;
let holeCount = 2;
let holeDiameter = 4;
let showCutters = true;

// Angled State
let isAngledMode = false;
let angleVal = 90;
let len1Val = 100;
let len2Val = 100;
let radiusVal = 20;
let turnAxis = 'horizontal';

// CSG Evaluator
const csgEvaluator = new Evaluator();

// Function to load profiles
async function loadProfiles() {
    try {
        const railText = await fetch('/rail.dxf').then(res => res.text());
        const coverText = await fetch('/cover.dxf').then(res => res.text());

        const railDxf = parseDXF(railText);
        const coverDxf = parseDXF(coverText);

        if (railDxf && railDxf.entities) {
            railShape = convertEntitiesToShape(railDxf.entities);
        }
        if (coverDxf && coverDxf.entities) {
            coverShape = convertEntitiesToShape(coverDxf.entities);
        }

        console.log("Profiles loaded");
    } catch (e) {
        console.error("Failed to load profiles:", e);
    }
}

function createRoundedPath(l1, l2, angleDeg, r, axis) {
    const theta = (angleDeg * Math.PI) / 180;
    const tanDist = r * Math.tan(theta / 2);
    
    if (l1 < tanDist || l2 < tanDist) {
        console.warn("Lengths too short for radius/angle");
    }

    const path = new THREE.CurvePath();

    // Start at (0,0,0) facing +Z
    const start = new THREE.Vector3(0,0,0);
    const seg1Len = l1 - tanDist;
    const p1 = new THREE.Vector3(0, 0, seg1Len); // Always move along Z first
    
    // Line 1
    const line1 = new THREE.LineCurve3(start, p1);
    path.add(line1);

    // Corner Calculation
    const pCorner = new THREE.Vector3(0, 0, l1);
    
    let dir2;
    if (axis === 'vertical') {
        dir2 = new THREE.Vector3(0, Math.sin(theta), Math.cos(theta));
    } else {
        dir2 = new THREE.Vector3(Math.sin(theta), 0, Math.cos(theta));
    }
    
    const p2 = pCorner.clone().add(dir2.clone().multiplyScalar(tanDist)); 
    
    // Curve
    const curve = new THREE.QuadraticBezierCurve3(p1, pCorner, p2);
    path.add(curve);

    // Line 2
    const seg2Len = l2 - tanDist;
    const end = p2.clone().add(dir2.clone().multiplyScalar(seg2Len));
    
    const line2 = new THREE.LineCurve3(p2, end);
    path.add(line2);

    return path;
}


// Function to update shapes
function updateShapes() {
    if (!railShape || !coverShape) {
        console.warn("Shapes not loaded yet");
        return;
    }

    // Remove old meshes
    if (railMesh) scene.remove(railMesh);
    if (coverMesh) scene.remove(coverMesh);
    
    // Clean up visualization meshes
    currentMeshes.forEach(mesh => {
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) mesh.material.dispose();
        scene.remove(mesh);
    });
    currentMeshes = [];

    // Material
    const material = new THREE.MeshStandardMaterial({ color: 0x00ff00, roughness: 0.5, metalness: 0.1, side: THREE.DoubleSide });
    const coverMaterial = new THREE.MeshStandardMaterial({ color: 0x00aaff, roughness: 0.5, metalness: 0.1, side: THREE.DoubleSide });

    let railGeometry, coverGeometry;

    if (isAngledMode) {
        // Angled Generation
        const path = createRoundedPath(len1Val, len2Val, angleVal, radiusVal, turnAxis);
        
        const extrudeSettings = {
            steps: 200, 
            extrudePath: path,
            bevelEnabled: false
        };
        
        railGeometry = new THREE.ExtrudeGeometry(railShape, extrudeSettings);
        coverGeometry = new THREE.ExtrudeGeometry(coverShape, extrudeSettings);
        
        // --- Angled Holes Logic ---
        if (holeCount > 0 && holeDiameter > 0) {
            let railBrush = new Brush(railGeometry, material);
            railBrush.updateMatrixWorld();
            let resultBrush = railBrush;

            const cylinderGeo = new THREE.CylinderGeometry(holeDiameter / 2, holeDiameter / 2, 12.5, 32);
             const holeMaterial = new THREE.MeshStandardMaterial({ 
                color: 0xff0000, 
                transparent: true, 
                opacity: 0.5 
            });

            for (let i = 0; i < holeCount; i++) {
                const t = (i + 0.5) / holeCount;
                const point = path.getPointAt(t);
                
                let holeQuat = new THREE.Quaternion();
                
                if (turnAxis === 'vertical') {
                    // "oriented to green axis. No additional rotation is needed."
                    // Final rotation is +90 Z.
                    // To get Y (0,1,0) in world, we need X (1,0,0) in CSG frame.
                    // Cylinder is Y-up by default. Rotate Y to X -> -90 deg around Z.
                    holeQuat.setFromAxisAngle(new THREE.Vector3(0,0,1), -Math.PI / 2);
                } else {
                    // Horizontal Turn: User wants holes to rotate with the angle.
                    // This implies holes are aligned with the Path Normal (which rotates in XZ plane).
                    // Tangent T is in XZ. Binormal B is Y (0,1,0).
                    // Normal N = B x T (or T x B).
                    // Straight case: T=(0,0,1). Hole should be along X? (If it rotates).
                    // Let's assume Hole is along Normal.
                    
                    let tangent = path.getTangentAt(t);
                    let upRef = new THREE.Vector3(0, 1, 0); 
                    let normal = new THREE.Vector3().crossVectors(tangent, upRef).normalize();
                    
                    // User feedback suggests removing the -90 correction aligns the start holes correctly (Vertical)
                    // while keeping end holes correct (Horizontal).
                    // normal.applyAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2);
                    
                    holeQuat.setFromUnitVectors(new THREE.Vector3(0,1,0), normal);
                }

                const holeBrush = new Brush(cylinderGeo, material);
                holeBrush.position.copy(point);
                holeBrush.quaternion.copy(holeQuat);
                
                holeBrush.updateMatrixWorld();
                resultBrush = csgEvaluator.evaluate(resultBrush, holeBrush, SUBTRACTION);
                
                // Visual
                const visualHole = new THREE.Mesh(cylinderGeo, holeMaterial);
                visualHole.position.copy(holeBrush.position);
                visualHole.quaternion.copy(holeBrush.quaternion);
                visualHole.visible = showCutters;
                
                // Note: The visual hole will also be rotated by the final railMesh.rotation.z
                // We need to either add it to the railMesh group or keep it in the scene but it needs to be child of something that rotates.
                // Better: Add to a group that gets rotated.
                currentMeshes.push(visualHole);
            }
            
            railMesh = resultBrush;
        } else {
             railMesh = new THREE.Mesh(railGeometry, material);
        }

        railMesh.rotation.z = Math.PI / 2; // Correct profile orientation
        
        // Add visual holes as children of railMesh so they rotate together
        currentMeshes.forEach(vh => railMesh.add(vh));

        coverMesh = new THREE.Mesh(coverGeometry, coverMaterial);
        coverMesh.rotation.z = Math.PI / 2; // Correct profile orientation
        
    } else {
        // Straight Generation
        const extrudeSettings = {
            steps: 1,
            depth: currentLength,
            bevelEnabled: false,
        };

        railGeometry = new THREE.ExtrudeGeometry(railShape, extrudeSettings);
        railGeometry.computeBoundingBox();
        const railMinY = railGeometry.boundingBox.min.y;
        const railHeightOffset = -railMinY;
        const zOffset = -currentLength / 2;

        const railBrush = new Brush(railGeometry, material);
        railBrush.position.set(-10, railHeightOffset, zOffset);
        railBrush.rotation.z = 0;
        railBrush.updateMatrixWorld();

        if (holeCount > 0 && holeDiameter > 0) {
            let resultBrush = railBrush;
            const cylinderGeo = new THREE.CylinderGeometry(holeDiameter / 2, holeDiameter / 2, 12.5, 32);
            const holeMaterial = new THREE.MeshStandardMaterial({ 
                color: 0xff0000, 
                transparent: true, 
                opacity: 0.5 
            });
            
            for (let i = 0; i < holeCount; i++) {
                const step = currentLength / holeCount;
                const zPos = -currentLength / 2 + step * (i + 0.5);

                const holeBrush = new Brush(cylinderGeo, material);
                holeBrush.position.set(-10, 0, zPos); 
                holeBrush.updateMatrixWorld();
                resultBrush = csgEvaluator.evaluate(resultBrush, holeBrush, SUBTRACTION);

                const visualHole = new THREE.Mesh(cylinderGeo, holeMaterial);
                visualHole.position.copy(holeBrush.position);
                visualHole.visible = showCutters;
                scene.add(visualHole);
                currentMeshes.push(visualHole);
            }
            railMesh = resultBrush;
        } else {
            railMesh = new THREE.Mesh(railGeometry, material);
            railMesh.position.set(-10, railHeightOffset, zOffset);
        }
        
        coverGeometry = new THREE.ExtrudeGeometry(coverShape, extrudeSettings);
        coverMesh = new THREE.Mesh(coverGeometry, coverMaterial);
        coverMesh.position.set(-10, railHeightOffset, zOffset);
    }

    railMesh.castShadow = true;
    railMesh.receiveShadow = true;
    scene.add(railMesh);
    
    coverMesh.castShadow = true;
    coverMesh.receiveShadow = true;
    scene.add(coverMesh);
}

// Fix Normals using Raycasting
function fixNormalsWithRaycasting(mesh) {
    if (!mesh.geometry) return;
    
    if (!mesh.geometry.index) {
        mesh.geometry = BufferGeometryUtils.mergeVertices(mesh.geometry);
    }
    
    const geom = mesh.geometry;
    geom.computeBoundsTree(); 
    
    const pos = geom.attributes.position;
    const index = geom.index;
    const raycaster = new THREE.Raycaster();
    
    raycaster.firstHitOnly = false;
    
    const count = index.count / 3;
    let flippedCount = 0;

    const pA = new THREE.Vector3();
    const pB = new THREE.Vector3();
    const pC = new THREE.Vector3();
    const center = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const direction = new THREE.Vector3();
    
    for (let i = 0; i < count; i++) {
        const a = index.getX(i * 3);
        const b = index.getX(i * 3 + 1);
        const c = index.getX(i * 3 + 2);
        
        pA.fromBufferAttribute(pos, a);
        pB.fromBufferAttribute(pos, b);
        pC.fromBufferAttribute(pos, c);
        
        center.addVectors(pA, pB).add(pC).multiplyScalar(1/3);
        
        const cb = new THREE.Vector3().subVectors(pC, pB);
        const ab = new THREE.Vector3().subVectors(pA, pB);
        normal.crossVectors(cb, ab).normalize();
        
        const start = center.clone().addScaledVector(normal, 0.001);
        direction.copy(normal);
        
        raycaster.set(start, direction);
        
        const intersects = raycaster.intersectObject(mesh, true);
        
        if (intersects.length % 2 !== 0) {
            index.setX(i * 3 + 1, c);
            index.setX(i * 3 + 2, b);
            flippedCount++;
        }
    }
    
    console.log(`Fixed normals: Flipped ${flippedCount} of ${count} faces.`);
    
    index.needsUpdate = true;
    geom.disposeBoundsTree();
    geom.computeVertexNormals();
}


// Export Function
function exportSTL(mesh, name) {
    if (!mesh) return;

    const exportMesh = mesh.clone();
    
    // Remove any visualization children (like hole cutters)
    exportMesh.clear();
    
    if (!exportMesh.geometry) return;

    exportMesh.rotation.x += Math.PI / 2;
    exportMesh.updateMatrixWorld();
    exportMesh.geometry.applyMatrix4(exportMesh.matrixWorld);
    exportMesh.rotation.set(0,0,0);
    exportMesh.position.set(0,0,0);
    exportMesh.scale.set(1,1,1);
    
    fixNormalsWithRaycasting(exportMesh);

    const exporter = new STLExporter();
    const result = exporter.parse(exportMesh, { binary: true });
    const blob = new Blob([result], { type: 'application/octet-stream' });
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${name}.stl`;
    link.click();
}

// Event Listeners
const btnAddStraight = document.getElementById('add-straight');
const btnCreateAngled = document.getElementById('create-angled');

const inputLength = document.getElementById('length-input');
const inputHoleCount = document.getElementById('hole-count');
const inputHoleDiameter = document.getElementById('hole-diameter');

const inputAngle = document.getElementById('angle-val');
const inputLen1 = document.getElementById('len1-val');
const inputLen2 = document.getElementById('len2-val');
const inputRadius = document.getElementById('radius-val');
const inputTurnAxis = document.getElementById('turn-axis');

const btnExportRail = document.getElementById('export-rail');
const btnExportCover = document.getElementById('export-cover');
const inputShowCutters = document.getElementById('show-holes');

if (btnAddStraight) {
    btnAddStraight.addEventListener('click', () => {
        isAngledMode = false;
        updateShapes();
    });
}

if (btnCreateAngled) {
    btnCreateAngled.addEventListener('click', () => {
        isAngledMode = true;
        updateShapes();
    });
}

// Straight Inputs
if (inputLength) {
    inputLength.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val) && val > 0) {
            currentLength = val;
            if (railMesh ) updateShapes();
        }
    });
}

if (inputHoleCount) {
    inputHoleCount.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        if (!isNaN(val) && val >= 0) {
            holeCount = val;
            if (railMesh ) updateShapes();
        }
    });
}

if (inputHoleDiameter) {
    inputHoleDiameter.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val) && val > 0) {
            holeDiameter = val;
            if (railMesh ) updateShapes();
        }
    });
}

// Angled Inputs
if (inputAngle) {
    inputAngle.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val) && val >= 0) {
            angleVal = val;
            if (railMesh && isAngledMode) updateShapes();
        }
    });
}
if (inputLen1) {
    inputLen1.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val) && val > 0) {
            len1Val = val;
            if (railMesh && isAngledMode) updateShapes();
        }
    });
}
if (inputLen2) {
    inputLen2.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val) && val > 0) {
            len2Val = val;
            if (railMesh && isAngledMode) updateShapes();
        }
    });
}
if (inputRadius) {
    inputRadius.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val) && val > 0) {
            radiusVal = val;
            if (railMesh && isAngledMode) updateShapes();
        }
    });
}

if (inputTurnAxis) {
    inputTurnAxis.addEventListener('change', (e) => {
        turnAxis = e.target.value;
        if (railMesh && isAngledMode) updateShapes();
    });
}


if (inputShowCutters) {
    inputShowCutters.addEventListener('change', (e) => {
        showCutters = e.target.checked;
        currentMeshes.forEach(mesh => {
            mesh.visible = showCutters;
        });
    });
}

if (btnExportRail) {
    btnExportRail.addEventListener('click', () => {
        exportSTL(railMesh, 'rail');
    });
}

if (btnExportCover) {
    btnExportCover.addEventListener('click', () => {
        exportSTL(coverMesh, 'cover');
    });
}

// Initial Load
loadProfiles();

// Animation Loop
function animate() {
	requestAnimationFrame(animate);
	controls.update();
	renderer.render(scene, camera);
}
animate();

// Handle Window Resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});