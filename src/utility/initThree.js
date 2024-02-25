import * as THREE from "three";
import vertexShader from "./vertexshader";
import fragmentShader from "./fragmentshader";

const frequency_samples = 128; // Y resolution
const time_samples = 1200; // X resolution
const n_vertices = (frequency_samples + 1) * (time_samples + 1);
const xsegments = time_samples;
const ysegments = frequency_samples;
const xsize = 40;
const ysize = 20;
const xhalfSize = xsize / 2;
const yhalfSize = ysize / 1.6;
const xsegmentSize = xsize / xsegments; //Size of one square

let camera, scene, renderer, mesh, heights;



function render() {
    renderer.render(scene, camera);
}

function animate() {
    requestAnimationFrame(animate);
    render();
}

export function initThreeJS() {
    camera = new THREE.PerspectiveCamera(
        30,
        window.innerWidth / window.innerHeight,
        1,
        1000
    );
    camera.position.z = 60;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x220033);
    let geometry = new THREE.BufferGeometry();
    let indices = [];
    heights = [];
    let vertices = [];

    let ypow_max = Math.log(ysize);
    let ybase = Math.E;
    // generate vertices and color data for a simple grid geometry
    for (let i = 0; i <= xsegments; i++) {
        let x = i * xsegmentSize - xhalfSize;
        for (let j = 0; j <= ysegments; j++) {
            let powr = ((ysegments - j) / ysegments) * ypow_max;
            let y = -Math.pow(ybase, powr) + yhalfSize + 1;
            vertices.push(x, y, 0);
            heights.push(0);
        }
    }

    // convert heights to a Uint8array
    heights = new Uint8Array(heights);
    // Add the position data to the geometry buffer
    geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(vertices, 3)
    );
    geometry.setAttribute(
        "displacement",
        new THREE.Uint8BufferAttribute(heights, 1)
    );

    for (let i = 0; i < xsegments; i++) {
        for (let j = 0; j < ysegments; j++) {
            let a = i * (ysegments + 1) + (j + 1);
            let b = i * (ysegments + 1) + j;
            let c = (i + 1) * (ysegments + 1) + j;
            let d = (i + 1) * (ysegments + 1) + (j + 1);
            // generate two faces (triangles) per iteration
            indices.push(a, b, d); // face one
            indices.push(b, c, d); // face two
        }
    }

    geometry.setIndex(indices);

    const material = new THREE.ShaderMaterial({
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
    });

    // Initialize the renderer and connect it to the DIV
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    let container = document.getElementById("spectogram3js");
    container.appendChild(renderer.domElement);

    mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    //geometry.computeFaceNormals();
    geometry.computeVertexNormals();

    animate();

    return { mesh, heights };
};



export function update_geometry(DATA, heights, mesh) {
    if (!heights || !mesh) return;

    let start_val = frequency_samples + 1;
    let end_val = n_vertices - start_val;
    heights.copyWithin(0, start_val, n_vertices + 1);
    heights.set(DATA, end_val - start_val);
    mesh.geometry.setAttribute(
        "displacement",
        new THREE.Uint8BufferAttribute(heights, 1)
    );
}


export function setColor(mesh, color) {
    // Check if mesh and color are provided
    if (!mesh || !color) return;

    // Create a new array to hold the colors
    const colors = [];

    // Convert hex color to RGB values
    const r = ((color >> 16) & 255) / 255;
    const g = ((color >> 8) & 255) / 255;
    const b = (color & 255) / 255;

    // Set the color for each vertex
    for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
        colors.push(r, g, b); // Push RGB values for each vertex
    }

    // Create a new buffer attribute for colors
    const colorAttribute = new THREE.BufferAttribute(new Float32Array(colors), 3);

    // Set the color attribute to the geometry
    mesh.geometry.setAttribute("color", colorAttribute);
}