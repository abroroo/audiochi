import React, { useEffect, useState, useCallback } from "react";
import { initThreeJS, update_geometry, setColor } from "../utility/initThree";
import GoogleAudio from "./GoogleAudio";
import Link from "next/link";

const Spectogram3D = () => {
  const frequency_samples = 128; // Y resolution
  const DATA = new Uint8Array(frequency_samples);

  const [isMicOn, setIsMicOn] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [mesh, setMesh] = useState(null);
  const [heights, setHeights] = useState(null);

  useEffect(() => {
    if (!isInitialized && isMicOn) {
      const { mesh, heights } = initThreeJS();
      setMesh(mesh);
      setHeights(heights);
      setIsInitialized(true);
    }
  }, [isMicOn]);

  useEffect(() => {
    let audioContext, analyser, source;
    if (isMicOn && isInitialized) {
      audioContext = new AudioContext();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 4 * frequency_samples;
      analyser.smoothingTimeConstant = 0.3;

      navigator.mediaDevices
        .getUserMedia({ audio: { echoCancellation: false } })
        .then(process_audio)
        .catch((error) => {
          console.error("Error accessing microphone:", error);
        });

      function process_audio(stream) {
        source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);

        // Connect the analyzer to the geometry update
        const updateAudioData = () => {
          analyser.getByteFrequencyData(DATA);

          requestAnimationFrame(updateAudioData);
          if (DATA) {
            update_geometry(DATA, heights, mesh);
          }
        };

        updateAudioData(); // Start the initial update
      }
    }

    return () => {
      if (!isMicOn && audioContext) {
        audioContext.close();
        setColor(mesh, 0x220033);
      }
      if (source) {
        source.disconnect();
      }
    };
  }, [isMicOn, isInitialized]);

  const toggleMicrophone = useCallback(() => {
    setIsMicOn((prev) => !prev);
  }, []);

  useEffect(() => {}, [isMicOn]);

  return (
    <div className="felx flex-col ">
      <div className="flex items-center justify-center mt-2">
        <h1 className="mt-2">3D Spectrogram</h1>
        <Link href="/">
          <button
            className="button-28"
            style={{
              width: "120px",
              minHeight: "50px",
              marginLeft: "10px",
              padding: "2px",
            }}
          >
            View in 2D &#10548;
          </button>
        </Link>
      </div>
      <div className="flex flex-col md:flex-row   ">
        {" "}
        <div className="flex flex-col justify-center items-center  w-full mt-5">
          <p
            data-test="spectogram-p-text"
            className=" mb-5 text-sm text-[#fff] w-[90%] md:flex hidden items-center justify-center"
          >
            It visualizes audio patterns in a 3D space, with color indicating
            volume and brightness reflecting pitch. (more volume more frequency
            of sound).
          </p>
          <button className="button-28 " onClick={toggleMicrophone}>
            {isMicOn ? "Stop " : "Visualize in 3D"}
          </button>
        </div>
        {/* <div className="w-full md:w-[50%]">
          <GoogleAudio />
        </div> */}
      </div>

      <div id="spectogram3js" className=""></div>
      <p
        data-test="author-tag"
        className="text-xs text-[#646363] absolute bottom-5 w-full  left-0 flex  justify-center"
      >
        by
        <a target="_blank" href="https://github.com/abroroo" className="ml-1">
          abroro
        </a>
      </p>
    </div>
  );
};

export default Spectogram3D;
