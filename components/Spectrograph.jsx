"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { io } from "socket.io-client";

const Spectrogram = () => {
  const canvasRef = useRef(null);
  const [isMicOn, setIsMicOn] = useState(false);
  const [stream, setStream] = useState(null);
  const socket = useRef(null);

  useEffect(() => {
    socket.current = io("/");

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const width = window.innerWidth;
    const height = window.innerHeight;

    canvas.width = width;
    canvas.height = height;

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      if (socket.current) {
        socket.current.disconnect();
      }
    };
  }, []);

  useEffect(() => {
    if (isMicOn) {
      navigator.mediaDevices.getUserMedia({ audio: true }).then((micStream) => {
        setStream(micStream);
      });
    } else {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      // Clear canvas and reset any other necessary state here
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, [isMicOn]);

  useEffect(() => {
    if (stream) {
      const audioContext = new (window.AudioContext ||
        window.webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 4096;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const ctx = canvasRef.current.getContext("2d");
      const data = new Uint8Array(analyser.frequencyBinCount);
      const len = data.length;
      const h = window.innerHeight / len;
      const x = window.innerWidth - 1;
      const width = window.innerWidth;
      const height = window.innerHeight;

      ctx.fillStyle = "hsl(280, 100%, 10%)";
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

      function drawSpectrogram() {
        window.requestAnimationFrame(drawSpectrogram);
        let imgData = ctx.getImageData(
          1,
          0,
          window.innerWidth - 1,
          window.innerHeight
        );
        ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
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
          ctx.moveTo(x, height - i * h);
          ctx.lineTo(x, height - (i * h + h));
          ctx.stroke();
        }
      }

      drawSpectrogram();

      return () => {
        analyser.disconnect();
      };
    }
  }, [stream]);

  const toggleMicrophone = useCallback(() => {
    setIsMicOn((prev) => !prev);
  }, []);

  return (
    <div>
      <div className="h1-div">
        <h1 className="">Real-time Spectrogram</h1>
      </div>
      <div className="button-div">
        <button className=" button-28 " onClick={toggleMicrophone}>
          {isMicOn ? "Turn Off Microphone" : "Turn On Microphone"}
        </button>
      </div>
      <div className="canvas-div">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
};

export default Spectrogram;
