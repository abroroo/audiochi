import React, { useRef, useEffect, useState, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

const SpectrogramWithThree = () => {
  const canvasRef = useRef(null);
  const [isMicOn, setIsMicOn] = useState(false);
  const [audioStream, setAudioStream] = useState(null);
  const spheresRef = useRef([]);

  const updateSpheres = () => {
    if (audioStream) {
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 64; // Adjust FFT size for frequency resolution

      const source = audioContext.createMediaStreamSource(audioStream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(dataArray);

      const balls = 3;
      const maxDistance = 5;
      const stepSize = maxDistance / balls;

      spheresRef.current.forEach((sphere, index) => {
        const distance = (dataArray[index] / 255) * maxDistance;
        const angleX = Math.random() * Math.PI * 2;
        const angleY = Math.random() * Math.PI * 2;
        const angleZ = Math.random() * Math.PI * 2;

        const x = Math.sin(angleX) * distance;
        const y = Math.sin(angleY) * distance;
        const z = Math.sin(angleZ) * distance;

        sphere.position.set(x, y, z);
      });
    }
  };

  useEffect(() => {
    const initThreeJS = () => {
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
      );
      const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current });
      renderer.setSize(window.innerWidth, window.innerHeight);

      const controls = new OrbitControls(camera, renderer.domElement);

      const balls = 3;
      const size = 0.05;
      const colors = [
        "rgb(0,127,255)",
        "rgb(255,0,0)",
        "rgb(0,255,0)",
        "rgb(0,255,255)",
        "rgb(255,0,255)",
        "rgb(255,0,127)",
        "rgb(255,255,0)",
        "rgb(0,255,127)",
      ];

      for (let i = 0; i < balls; i++) {
        for (let j = 0; j < balls; j++) {
          for (let k = 0; k < balls; k++) {
            const geometry = new THREE.SphereGeometry(size, 20, 20);
            const material = new THREE.MeshMatcapMaterial({
              color: "0xffffff",
            });
            const sphere = new THREE.Mesh(geometry, material);
            sphere.position.set(i - balls / 2, j - balls / 2, k - balls / 2);
            scene.add(sphere);
            spheresRef.current.push(sphere);
          }
        }
      }

      camera.position.z = 5;

      const animate = () => {
        updateSpheres(); // Update sphere positions based on audio data
        renderer.render(scene, camera);
        requestAnimationFrame(animate);
      };

      animate();
    };

    if (isMicOn && !audioStream) {
      navigator.mediaDevices.getUserMedia({ audio: true }).then((micStream) => {
        setAudioStream(micStream);
      });
    } else if (!isMicOn && audioStream) {
      audioStream.getTracks().forEach((track) => track.stop());
      setAudioStream(null);
    }

    initThreeJS(); // Call the initThreeJS function here

    return () => {
      if (audioStream) {
        audioStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [isMicOn, audioStream]);

  const toggleMicrophone = useCallback(() => {
    setIsMicOn((prev) => !prev);
  }, []);

  return (
    <div>
      <div className="h1-div flex justify-center items-center flex-col">
        <h1 className="">Sound Recognition</h1>
        <p className="m-0 text-sm text-[#fff] w-[90%]">
          This experiment needs access to your microphone and your device to be
          in a quieter place.
        </p>
      </div>
      <div className="button-div md:top-[25%] top-[33%] xl:top-[20%] flex items-center justify-center flex-col">
        <p className="m-5 text-sm text-[#fff] w-[90%]">
          It can visualize audio as the frequency of sound patterns (more red
          greater the frequency). To check if it's working you can start with
          (shshshshs) sound.
        </p>
        <button className="button-28" onClick={toggleMicrophone}>
          {isMicOn ? "Stop spectrogram" : "Visualize Audio"}
        </button>
      </div>
      <div className="canvas-div ">
        <canvas ref={canvasRef} />
      </div>
      <p className="text-xs text-[#646363] absolute bottom-5 w-full  left-0 flex  justify-center">
        by
        <a target="_blank" href="https://github.com/abroroo" className="ml-1">
          abroro
        </a>
      </p>
    </div>
  );
};

export default SpectrogramWithThree;
