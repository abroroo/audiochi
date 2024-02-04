"use client";
import React, { useRef, useEffect, useState, useCallback } from "react";
import GoogleAudio from "./GoogleAudio";

const Spectrogram = () => {
  const canvasRef = useRef(null);
  const [isMicOn, setIsMicOn] = useState(false);
  const [audioStream, setAudioStream] = useState(null);

  // TURN ON THE MICROPHONE
  useEffect(() => {
    if (isMicOn && !audioStream) {
      // navigator is part of WebRTC API that allows to access user's microphone
      navigator.mediaDevices.getUserMedia({ audio: true }).then((micStream) => {
        setAudioStream(micStream);
      });
    } else if (!isMicOn && audioStream) {
      audioStream.getTracks().forEach((track) => track.stop());
      setAudioStream(null);
    }

    return () => {
      if (audioStream) {
        audioStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [isMicOn]);

  // SETTING UP THE CANVAS
  useEffect(() => {
    const canvasElement = canvasRef.current;
    // const ctx = canvas.getContext("2d");
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    canvasElement.width = windowWidth;
    canvasElement.height = windowHeight;

    return () => {
      if (audioStream) {
        audioStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // DRAW THE SPECTOGRAM
  useEffect(() => {
    if (audioStream) {
      // audioContext is part of Web Audio API that allows to create, manipulate and visualize audio
      const audioContext = new (window.AudioContext ||
        window.webkitAudioContext)();

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 4096;

      const source = audioContext.createMediaStreamSource(audioStream);
      source.connect(analyser);

      canvasRef.current.setAttribute("willReadFrequently", "");
      const ctx = canvasRef.current.getContext("2d");
      const data = new Uint8Array(analyser.frequencyBinCount);
      const len = data.length;
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      const h = windowHeight / len;
      const w = windowWidth - 1;

      ctx.fillStyle = "hsl(280, 100%, 10%)";
      ctx.fillRect(0, 0, windowWidth, windowHeight);

      function drawSpectrogram() {
        window.requestAnimationFrame(drawSpectrogram);
        let imgData = ctx.getImageData(1, 0, windowWidth - 1, windowHeight);
        ctx.fillRect(0, 0, windowWidth, windowHeight);
        ctx.putImageData(imgData, 0, 0);
        analyser.getByteFrequencyData(data);

        // Draw your spectrogram here using the data
        for (let i = 0; i < len; i++) {
          let rat = data[i] / 255;
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
  }, []);

  return (
    <div>
      <div className="h1-div flex justify-center items-center flex-col">
        <h1 className="">Sound Recognition</h1>
        <p className=" m-0 text-sm text-[#fff] w-[90%]">
          This experiment needs access to your microphone and your device to be
          in quiter place.
        </p>
      </div>
      <div className="button-div md:top-[25%] top-[33%] xl:top-[20%] flex items-center justify-center flex-col">
        <p className=" m-5 text-sm text-[#fff] w-[90%]">
          It can visualize audio as frequency of sound patterns (more red
          greater the frequency). To check if it's working you can start with
          (shshshshs) sound.
        </p>
        <button className=" button-28 " onClick={toggleMicrophone}>
          {isMicOn ? "Stop spectrogram" : "Visualize Audio"}
        </button>

        <GoogleAudio />
      </div>
      <div className="canvas-div">
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

export default Spectrogram;
