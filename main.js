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
const size = 100;
const divisions = 100;
const gridHelper = new THREE.GridHelper(size, divisions, 0x444444, 0x333333);
scene.add(gridHelper);

// Axes Helper
const axesHelper = new THREE.AxesHelper(10);
scene.add(axesHelper);

// State
let railMesh = null;
let coverMesh = null;
let currentMeshes = []; // Array to track visualization meshes (like cylinders)
let currentLength = 100;
let railShape = null;
let coverShape = null;
let holeCount = 2;
let holeDiameter = 4;
let showCutters = true;

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

    const extrudeSettings = {
        steps: 1,
        depth: currentLength,
        bevelEnabled: false,
    };

    // Material
    const material = new THREE.MeshStandardMaterial({ color: 0x00ff00, roughness: 0.5, metalness: 0.1, side: THREE.DoubleSide });
    const coverMaterial = new THREE.MeshStandardMaterial({ color: 0x00aaff, roughness: 0.5, metalness: 0.1, side: THREE.DoubleSide });

    // --- Rail Construction ---
    const railGeometry = new THREE.ExtrudeGeometry(railShape, extrudeSettings);
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
        // Oversize the cylinder to ensure it punches through completely (height 12.5)
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
            // Center at Y=0 so it goes from -25 to +25, easily clearing the rail floor
            holeBrush.position.set(-10, 0, zPos); 
            holeBrush.updateMatrixWorld();
            resultBrush = csgEvaluator.evaluate(resultBrush, holeBrush, SUBTRACTION);

            // Create a visualization mesh
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

    railMesh.castShadow = true;
    railMesh.receiveShadow = true;
    scene.add(railMesh);


    // --- Cover Construction ---
    const coverGeometry = new THREE.ExtrudeGeometry(coverShape, extrudeSettings);
    coverMesh = new THREE.Mesh(coverGeometry, coverMaterial);
    coverMesh.position.set(-10, railHeightOffset, zOffset);

    coverMesh.castShadow = true;
    coverMesh.receiveShadow = true;
    scene.add(coverMesh);
}

// Fix Normals using Raycasting
function fixNormalsWithRaycasting(mesh) {
    if (!mesh.geometry) return;
    
    // Ensure indexed geometry for easier swapping
    if (!mesh.geometry.index) {
        mesh.geometry = BufferGeometryUtils.mergeVertices(mesh.geometry);
    }
    
    const geom = mesh.geometry;
    geom.computeBoundsTree(); // BVH for speed
    
    const pos = geom.attributes.position;
    const index = geom.index;
    const raycaster = new THREE.Raycaster();
    // Raycaster usually needs to point to specific layers or objects, here we test against the mesh itself.
    // However, basic Raycaster hits 'front' faces by default. We need 'double' side intersection logic?
    // Actually, checking intersection count is robust.
    
    // We need to raycast against the mesh itself
    raycaster.firstHitOnly = false;
    
    // Create a temp mesh for raycasting that matches the export mesh
    // (The input mesh is already world-oriented)
    
    const count = index.count / 3;
    let flippedCount = 0;

    const pA = new THREE.Vector3();
    const pB = new THREE.Vector3();
    const pC = new THREE.Vector3();
    const center = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const direction = new THREE.Vector3();
    
    // Iterate faces
    for (let i = 0; i < count; i++) {
        const a = index.getX(i * 3);
        const b = index.getX(i * 3 + 1);
        const c = index.getX(i * 3 + 2);
        
        pA.fromBufferAttribute(pos, a);
        pB.fromBufferAttribute(pos, b);
        pC.fromBufferAttribute(pos, c);
        
        // Calculate Geometric Center
        center.addVectors(pA, pB).add(pC).multiplyScalar(1/3);
        
        // Calculate Geometric Normal (Cross product)
        const cb = new THREE.Vector3().subVectors(pC, pB);
        const ab = new THREE.Vector3().subVectors(pA, pB);
        normal.crossVectors(cb, ab).normalize();
        
        // Setup Ray: Start slightly outside face along normal
        const start = center.clone().addScaledVector(normal, 0.001);
        direction.copy(normal); // Point OUT
        
        raycaster.set(start, direction);
        
        // Raycast against the mesh itself
        // Note: acceleratedRaycast requires the mesh to be passed or attached.
        const intersects = raycaster.intersectObject(mesh, true);
        
        // Count hits. 
        // Logic: If we are "Outside", shooting "Out" should hit 0 (or even number if we pass through other parts).
        // If we are "Inside" (inverted normal), shooting "Out" (which is actually In) will hit the other side of the model (Odd number).
        
        if (intersects.length % 2 !== 0) {
            // Odd hits -> We were pointing IN -> FLIP
            // Swap B and C
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

    // Clone the mesh so we don't affect the scene orientation
    const exportMesh = mesh.clone();
    
    // Ensure we have geometry
    if (!exportMesh.geometry) return;

    // Apply rotation before fixing normals, so rays match visual orientation
    exportMesh.rotation.x += Math.PI / 2;
    exportMesh.updateMatrixWorld();
    exportMesh.geometry.applyMatrix4(exportMesh.matrixWorld);
    exportMesh.rotation.set(0,0,0);
    exportMesh.position.set(0,0,0);
    exportMesh.scale.set(1,1,1);
    
    // Fix Normals using Raycaster
    fixNormalsWithRaycasting(exportMesh);

    const exporter = new STLExporter();
    // Use binary for smaller files
    const result = exporter.parse(exportMesh, { binary: true });
    const blob = new Blob([result], { type: 'application/octet-stream' });
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${name}.stl`;
    link.click();
}

// Event Listeners
const btnAddStraight = document.getElementById('add-straight');
const inputLength = document.getElementById('length-input');
const inputHoleCount = document.getElementById('hole-count');
const inputHoleDiameter = document.getElementById('hole-diameter');
const btnExportRail = document.getElementById('export-rail');
const btnExportCover = document.getElementById('export-cover');
const inputShowCutters = document.getElementById('show-holes');

if (btnAddStraight) {
    btnAddStraight.addEventListener('click', () => {
        updateShapes();
    });
}

if (inputLength) {
    inputLength.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val) && val > 0) {
            currentLength = val;
            if (railMesh) updateShapes();
        }
    });
}

if (inputHoleCount) {
    inputHoleCount.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        if (!isNaN(val) && val >= 0) {
            holeCount = val;
            if (railMesh) updateShapes();
        }
    });
}

if (inputHoleDiameter) {
    inputHoleDiameter.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val) && val > 0) {
            holeDiameter = val;
            if (railMesh) updateShapes();
        }
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