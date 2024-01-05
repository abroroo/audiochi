"use client";
import React, { useRef, useEffect, useState, useCallback } from "react";
import { io } from "socket.io-client";

const Spectrogram = () => {
  const canvasRef = useRef(null);
  const [isMicOn, setIsMicOn] = useState(false);
  const [stream, setStream] = useState(null);
  const socket = useRef(null); // Use ref for socket

  useEffect(() => {
    socket.current = io("/"); // Connect to the server
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const width = window.innerWidth;
    const height = window.innerHeight;

    canvas.width = width;
    canvas.height = height;

    const audioContext = new (window.AudioContext ||
      window.webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 4096;

    if (isMicOn && !stream) {
      navigator.mediaDevices.getUserMedia({ audio: true }).then((micStream) => {
        setStream(micStream);
        const source = audioContext.createMediaStreamSource(micStream);
        source.connect(analyser);

        const data = new Uint8Array(analyser.frequencyBinCount);
        const len = data.length;
        const h = height / len;
        const x = width - 1;

        ctx.fillStyle = "hsl(280, 100%, 10%)";
        ctx.fillRect(0, 0, width, height);

        function loop() {
          window.requestAnimationFrame(loop);
          let imgData = ctx.getImageData(1, 0, width - 1, height);
          ctx.fillRect(0, 0, width, height);
          ctx.putImageData(imgData, 0, 0);
          analyser.getByteFrequencyData(data);

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

        loop();
      });
    }

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      if (socket.current) {
        socket.current.disconnect(); // Disconnect socket when component unmounts
      }
    };
  }, [isMicOn, stream]);

  const toggleMicrophone = useCallback(() => {
    setIsMicOn((prev) => !prev);
  }, []);

  return (
    <div>
      <h1 className="absolute top-0 left-[33%] text-xxxl font-bold">
        Real-time Spectrogram
      </h1>
      <button
        className="toggle-button absolute top-20 left-[50%] border bg-white text-[#000]"
        onClick={toggleMicrophone}
      >
        {isMicOn ? "Turn Off Microphone" : "Turn On Microphone"}
      </button>
      <canvas ref={canvasRef} />
    </div>
  );
};

export default Spectrogram;
