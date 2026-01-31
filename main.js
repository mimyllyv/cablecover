import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { parseDXF, convertEntitiesToShape } from './dxf-to-shape.js';

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

    // Rail
    const railGeometry = new THREE.ExtrudeGeometry(railShape, extrudeSettings);
    railGeometry.computeBoundingBox();
    const railMinY = railGeometry.boundingBox.min.y;
    const railMaxY = railGeometry.boundingBox.max.y;
    const railHeightOffset = -railMinY;

    const railMesh = new THREE.Mesh(railGeometry, material);
    railMesh.position.x = -10; 
    railMesh.position.y = railHeightOffset; // Move up to ground
    railMesh.rotation.z = 0; 
    
    scene.add(railMesh);
    currentMeshes.push(railMesh);

    // Cover
    const coverGeometry = new THREE.ExtrudeGeometry(coverShape, extrudeSettings);
    const coverMesh = new THREE.Mesh(coverGeometry, coverMaterial);
    coverMesh.position.x = -10; // Match rail position
    coverMesh.position.y = railHeightOffset; // Move up to match rail's vertical shift
    // coverMesh.rotation.x = -Math.PI / 2;
    
    scene.add(coverMesh);
    currentMeshes.push(coverMesh);
}

// Event Listeners
const btnAddStraight = document.getElementById('add-straight');
const inputLength = document.getElementById('length-input');

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
            if (currentMeshes.length > 0) {
                updateShapes();
            }
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
