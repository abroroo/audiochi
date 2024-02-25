import React, { useEffect, useState, useCallback } from "react";
import { initThreeJS, update_geometry, setColor } from "../utility/initThree";
import GoogleAudio from "./GoogleAudio";

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
      analyser.fftSize = 4096;
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
          analyser.getByteFrequencyData(DATA); // Get frequency data into DATA

          requestAnimationFrame(updateAudioData);
          if (DATA) {
            //console.log("DATA in Spectogram: ", DATA);
            update_geometry(DATA, heights, mesh); // Pass DATA to update_geometry if it's valid
          }
        };

        updateAudioData(); // Start the initial update
      }
    }

    return () => {
      // console.log("Cleaning up microphone source");
      if (!isMicOn && audioContext) {
        audioContext.close();
        setColor(mesh, 0x220033);
      }
      if (source) {
        // console.log("Disconnecting source");
        source.disconnect();
      }
    };
  }, [isMicOn, isInitialized]);

  const toggleMicrophone = useCallback(() => {
    setIsMicOn((prev) => !prev);
  }, []);

  useEffect(() => {
    // console.log("isMicOn: ", isMicOn);
  }, [isMicOn]);

  return (
    <div className="">
      <div className="flex flex-col justify-center items-center mt-2">
        <h1 className="mb-5">3D Spectogram</h1>
        <button className="button-28 " onClick={toggleMicrophone}>
          {isMicOn ? "Turn off " : "Turn on "}
        </button>
      </div>
      <div id="spectogram3js" className=""></div>
      <GoogleAudio />
    </div>
  );
};

export default Spectogram3D;
