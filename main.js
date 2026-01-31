import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { parseDXF, convertEntitiesToShape } from './dxf-to-shape.js';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';

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
    if (railMesh) scene.remove(railMesh);
    if (coverMesh) scene.remove(coverMesh);

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
        const cylinderGeo = new THREE.CylinderGeometry(holeDiameter / 2, holeDiameter / 2, 20, 32);

        for (let i = 0; i < holeCount; i++) {
            const step = currentLength / holeCount;
            const zPos = -currentLength / 2 + step * (i + 0.5);

            const holeBrush = new Brush(cylinderGeo, material);
            holeBrush.position.set(-10, 5, zPos);
            holeBrush.updateMatrixWorld();
            resultBrush = csgEvaluator.evaluate(resultBrush, holeBrush, SUBTRACTION);
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

// Export Function
function exportSTL(mesh, name) {
    if (!mesh) return;

    // Clone the mesh so we don't affect the scene orientation
    const exportMesh = mesh.clone();

    // Rotate 90 degrees on red (X) axis for printing orientation
    // This makes the profile lie on the XY plane (or XZ depending on slicer)
    exportMesh.rotation.x += Math.PI / 2;
    exportMesh.updateMatrixWorld();

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
