import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { parseDXF, convertEntitiesToShape } from './dxf-to-shape.js';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';

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
let currentMeshes = [];
let currentLength = 100;
let railShape = null;
let coverShape = null;
let holeCount = 2;
let holeDiameter = 4;

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
    currentMeshes.forEach(mesh => scene.remove(mesh));
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
    // 1. Create Base Rail Geometry
    const railGeometry = new THREE.ExtrudeGeometry(railShape, extrudeSettings);
    railGeometry.computeBoundingBox();
    const railMinY = railGeometry.boundingBox.min.y;
    const railHeightOffset = -railMinY;
    const zOffset = -currentLength / 2;

    // Create a Brush for the rail
    // We need to apply the transforms to the Brush so CSG happens in correct space
    const railBrush = new Brush(railGeometry, material);
    railBrush.position.set(-10, railHeightOffset, zOffset);
    railBrush.rotation.z = 0; 
    railBrush.updateMatrixWorld();

    // 2. Create Hole Cylinders (if needed)
    let finalRailMesh;

    if (holeCount > 0 && holeDiameter > 0) {
        let resultBrush = railBrush;

        // Create a generic cylinder geometry for the holes
        // Height should be enough to punch through the rail floor (approx 2.2mm). 
        // Let's make it 20mm to be safe and center it vertically relative to the floor.
        const cylinderGeo = new THREE.CylinderGeometry(holeDiameter / 2, holeDiameter / 2, 20, 32);
        
        for (let i = 0; i < holeCount; i++) {
            // Distribute holes evenly along Z axis
            // Start of rail is at zOffset. End is at zOffset + currentLength.
            // Or simpler: The rail geometry itself goes from Z=0 to Z=length.
            // Then we shifted it by zOffset.
            // Center of rail in Z is 0.
            // Range is [-currentLength/2, currentLength/2].
            
            let zPos;
            if (holeCount === 1) {
                zPos = 0;
            } else {
                // Distribute from -L/2 to L/2
                // Margin? usually we want them spaced.
                // Step = Length / (Count + 1) for even spacing including ends?
                // Or Length / Count and offset by half segment?
                
                // Option A: Even spacing with margins
                const step = currentLength / holeCount;
                zPos = -currentLength / 2 + step * (i + 0.5);
            }

            const holeBrush = new Brush(cylinderGeo, material);
            // Position hole
            // X: -10 (Same as rail center)
            // Y: 0 (Grid level) -> Cylinder is centered at 0, so it goes from -10 to +10. 
            // The rail floor is at ~2mm height. So this will cut through.
            // Z: Calculated zPos
            holeBrush.position.set(-10, 5, zPos); 
            holeBrush.updateMatrixWorld();

            // Subtract
            resultBrush = csgEvaluator.evaluate(resultBrush, holeBrush, SUBTRACTION);
        }
        finalRailMesh = resultBrush;
    } else {
        finalRailMesh = railMesh; // Just use the mesh if no holes (wait, railMesh variable logic below)
        finalRailMesh = new THREE.Mesh(railGeometry, material);
        finalRailMesh.position.set(-10, railHeightOffset, zOffset);
        finalRailMesh.rotation.z = 0;
    }
    
    // If result is a Brush, we need to treat it as a Mesh to add to scene
    // Brush extends Mesh, so it works directly.
    
    // Ensure shadow casting/receiving if we add lights later
    finalRailMesh.castShadow = true;
    finalRailMesh.receiveShadow = true;

    scene.add(finalRailMesh);
    currentMeshes.push(finalRailMesh);


    // --- Cover Construction ---
    const coverGeometry = new THREE.ExtrudeGeometry(coverShape, extrudeSettings);
    const coverMesh = new THREE.Mesh(coverGeometry, coverMaterial);
    coverMesh.position.x = -10; // Match rail position
    coverMesh.position.y = railHeightOffset; // Move up to match rail's vertical shift
    coverMesh.position.z = zOffset; // Center Z on origin
    // coverMesh.rotation.x = -Math.PI / 2;
    
    scene.add(coverMesh);
    currentMeshes.push(coverMesh);
}

// Event Listeners
const btnAddStraight = document.getElementById('add-straight');
const inputLength = document.getElementById('length-input');
const inputHoleCount = document.getElementById('hole-count');
const inputHoleDiameter = document.getElementById('hole-diameter');

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
            if (currentMeshes.length > 0) updateShapes();
        }
    });
}

if (inputHoleCount) {
    inputHoleCount.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        if (!isNaN(val) && val >= 0) {
            holeCount = val;
            if (currentMeshes.length > 0) updateShapes();
        }
    });
}

if (inputHoleDiameter) {
    inputHoleDiameter.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val) && val > 0) {
            holeDiameter = val;
            if (currentMeshes.length > 0) updateShapes();
        }
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