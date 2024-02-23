"use client";
import React, { useRef, useEffect, useState, useCallback } from "react";
import GoogleAudio from "./GoogleAudio";
import Counter from "./Counter"

const Spectrogram = () => {
  const canvasRef = useRef(null);
  const [isMicOn, setIsMicOn] = useState(false);
  const [audioStream, setAudioStream] = useState(null);
  const [count, setCount] = useState(0);
 
  // TURN ON THE MICROPHONE
  useEffect(() => {
    // START AUDIO STREAM
    if (isMicOn && !audioStream) {
      // navigator is part of WebRTC API that allows to access user's microphone
      navigator.mediaDevices.getUserMedia({ audio: true }).then((micStream) => {
        setAudioStream(micStream);
      });
    } else if (!isMicOn && audioStream) {
      // STOP AUDIO STREAM
      audioStream.getTracks().forEach((track) => track.stop());
      setAudioStream(null);
    }

    return () => {
      // STOP AUDIO STREAM WHEN COMPONENT UNMOUNTS
      if (audioStream) {
        audioStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [isMicOn]);

  // SETTING UP THE CANVAS
  useEffect(() => {
    const canvasElement = canvasRef.current;

    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    canvasElement.width = windowWidth;
    canvasElement.height = windowHeight;
  }, []);

  // DRAW THE SPECTOGRAM
  useEffect(() => {
    if (audioStream) {
      // audioContext is part of Web Audio API that allows to create, manipulate and visualize audio
      const audioContext = new (window.AudioContext ||
        window.webkitAudioContext)();

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 4096; // The size of the FFT used for frequency-domain analysis. Must be a power of two

      const source = audioContext.createMediaStreamSource(audioStream); // Create an audio node from the microphone stream
      source.connect(analyser); // Connect the source to the analyser

      const audioFrequencyArray = new Uint8Array(analyser.frequencyBinCount); // Create a new array to store the frequency data

      canvasRef.current.setAttribute("willReadFrequently", "");
      const ctx = canvasRef.current.getContext("2d");
      const len = audioFrequencyArray.length;
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      const h = windowHeight / len;
      const w = windowWidth - 1;

      ctx.fillStyle = "hsl(280, 100%, 10%)";
      ctx.fillRect(0, 0, windowWidth, windowHeight);

      function drawSpectrogram() {
        window.requestAnimationFrame(drawSpectrogram);

        // MAKE CANVAS BARS CONTINUOUSLY MOOVE TO THE LEFT.
        let imgData = ctx.getImageData(1, 0, windowWidth - 1, windowHeight); //capture the pixel data of the canvas,
        ctx.fillRect(0, 0, windowWidth, windowHeight); //clear the canvas
        ctx.putImageData(imgData, 0, 0); //put the pixel data back to the canvas

        // Populate audioFrequencyArray with audio frequency data using analyser.getByteFrequencyData()
        analyser.getByteFrequencyData(audioFrequencyArray);
        // EX: audioFrequencyArray = Uint8Array(2048) [110, 125, 140, 155, 170, 185, 200, 215, 230, ...]

        // Draw the spectrogram here using the Unit8Array "audioFrequencyArray"
        for (let i = 0; i < len; i++) {
          let rat = audioFrequencyArray[i] / 255;
          let hue = Math.round(rat * 120 + (280 % 360));
          let sat = "100%";
          let lit = 10 + 70 * rat + "%";

          ctx.beginPath();
          ctx.strokeStyle = `hsl(${hue}, ${sat}, ${lit})`;
          ctx.moveTo(w, windowHeight - i * h);
          ctx.lineTo(w, windowHeight - (i * h + h));
          ctx.stroke();
        }
      }

      drawSpectrogram();

      return () => {
        analyser.disconnect();
      };
    }
  }, [audioStream]);

  const toggleMicrophone = useCallback(() => {
    setIsMicOn((prev) => !prev);
    setCount((count) => count + 1)
  }, []);

  return (
    <div data-test="spectogram-container">
      <div className="h1-div flex justify-center items-center flex-col">
        <h1 data-test="spectogram-title" className="">
          Sound Recognition
        </h1>
        <p
          data-test="spectogram-title-text"
          className=" m-0 text-sm text-[#fff] w-[90%]"
        >
          This experiment needs access to your microphone and your device to be
          in quiter place.
        </p>
      </div>
      <div className="button-div md:top-[25%] top-[33%] xl:top-[20%] flex items-center justify-center flex-col">
        <p
          data-test="spectogram-p-text"
          className=" m-5 text-sm text-[#fff] w-[90%]"
        >
          It can visualize audio as frequency of sound patterns (more red
          greater the frequency). To check if it's working you can start with
          (shshshshs) sound.
        </p>
        <button
          data-test="spectogram-toggle-button"
          className=" button-28 "
          onClick={toggleMicrophone}
        >
          {isMicOn ? "Stop spectrogram" : "Visualize Audio"}
        </button>
        <Counter count={count} />
        <GoogleAudio />
      </div>
      <div className="canvas-div">
        <canvas ref={canvasRef} />
      </div>
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

export default Spectrogram;
