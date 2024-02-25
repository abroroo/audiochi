import React, { useEffect } from "react";
import * as THREE from "three";
import vertexShader from "../utility/vertexshader";
import fragmentShader from "../utility/fragmentshader";
import { computeFaceNormals, computeVertexNormals } from "three";

const ThreeJSSpectogram = () => {
  const frequency_samples = 128; // Y resolution
  const DATA = new Uint8Array(frequency_samples); // for later
  let camera, scene, renderer;
  let heights, mesh;
  const time_samples = 1200; // X resolution
  const n_vertices = (frequency_samples + 1) * (time_samples + 1);
  const xsegments = time_samples;
  const ysegments = frequency_samples;
  const xsize = 40;
  const ysize = 20;
  const xhalfSize = xsize / 2;
  const yhalfSize = ysize / 2;
  const xsegmentSize = xsize / xsegments; //Size of one square
  const ysegmentSize = ysize / ysegments;

  const initThreeJS = () => {
    camera = new THREE.PerspectiveCamera(
      30,
      window.innerWidth / window.innerHeight,
      1,
      1000
    );
    camera.position.z = 64;
    scene = new THREE.Scene();
    let geometry = new THREE.BufferGeometry();
    let indices = [];
    heights = [];
    let vertices = [];

    // generate vertices for a simple grid geometry
    for (let i = 0; i <= xsegments; i++) {
      let x = i * xsegmentSize - xhalfSize; //midpoint of mesh is 0,0
      for (let j = 0; j <= ysegments; j++) {
        let y = j * ysegmentSize - yhalfSize;
        vertices.push(x, y, 0);
        heights.push(0);
        //heights.push(Math.random() * 255); // no longer flat
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

    // Render the scene!
    renderer.render(scene, camera);
    animate();
  };

  function update_geometry() {
    //crypto.getRandomValues(DATA);
    let start_val = frequency_samples + 1;
    let end_val = n_vertices - start_val;
    heights.copyWithin(0, start_val, n_vertices + 1);

    heights.set(DATA, end_val - start_val);
    mesh.geometry.setAttribute(
      "displacement",
      new THREE.Uint8BufferAttribute(heights, 1)
    );
  }
  function render() {
    update_geometry();
    renderer.render(scene, camera);
  }

  function animate() {
    requestAnimationFrame(animate);
    render();
  }

  useEffect(() => {
    // ... existing code for accessing microphone and updating geometry

    // Create the analyzer
    const ACTX = new AudioContext();
    const ANALYSER = ACTX.createAnalyser();
    ANALYSER.fftSize = 16 * frequency_samples;
    ANALYSER.smoothingTimeConstant = 0.4;

    navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation: false } })
      .then(process_audio)
      .catch((error) => {
        console.error("Error accessing microphone:", error);
      });

    function process_audio(stream) {
      const SOURCE = ACTX.createMediaStreamSource(stream);
      SOURCE.connect(ANALYSER);

      // Connect the analyzer to the geometry update
      const updateAudioData = () => {
        ANALYSER.getByteFrequencyData(DATA); // Get frequency data into DATA
        update_geometry();
        requestAnimationFrame(updateAudioData);
      };

      updateAudioData(); // Start the initial update
    }
  }, []);

  useEffect(() => {
    initThreeJS();
  }, []);

  return (
    <div className="" id="spectogram3js">
      <h1 className="absolute top-3 left-1/3">HTis is spectogram with 3.js</h1>
    </div>
  );
};

export default ThreeJSSpectogram;
