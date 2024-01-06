"use client";
import React, { useRef, useEffect, useState, useCallback } from "react";
import { io } from "socket.io-client";
import GoogleAudio from "./GoogleAudio";
const Spectrogram = () => {
  const canvasRef = useRef(null);
  const [isMicOn, setIsMicOn] = useState(false);
  const [stream, setStream] = useState(null);
  const socket = useRef(null);
  const [prediction, setPrediction] = useState(null); // State to store the received prediction

  useEffect(() => {
    // socket.current = io("/api/getPrediction");

    // socket.current.on("connect", () => {
    //   console.log("Socket connected");
    // });

    // socket.current.on("connect_error", (error) => {
    //   console.error("Socket connection error:", error);
    // });

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
    if (isMicOn && !stream) {
      navigator.mediaDevices.getUserMedia({ audio: true }).then((micStream) => {
        setStream(micStream);

        const audioContext = new (window.AudioContext ||
          window.webkitAudioContext)();
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 4096;

        const source = audioContext.createMediaStreamSource(micStream);
        source.connect(analyser);

        // Stream audio data to the server via WebSocket
        const data = new Uint8Array(analyser.frequencyBinCount);
        source.onaudioprocess = (event) => {
          analyser.getByteFrequencyData(data);
          const audioData = Array.from(data); // Convert to array if necessary
          //socket.current.emit("audioData", audioData);
        };

        // Listen for predictions from the server
        // socket.current.on("prediction", (data) => {
        //   setPrediction(data.prediction);
        // });
      });
    } else if (!isMicOn && stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
      setPrediction(null);
    }

    // console.log("isMicOn: ", isMicOn);
    // console.log("socket ", socket.current);

    return () => {
      //socket.current.off("prediction");
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [isMicOn]);

  useEffect(() => {
    if (stream) {
      const audioContext = new (window.AudioContext ||
        window.webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 4096;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      canvasRef.current.setAttribute("willReadFrequently", "");
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
      <div className="h1-div flex justify-center items-center flex-col">
        <h1 className="">Sound Recognition</h1>
        <p className=" mt-5 text-sm text-[#fff] w-[90%]">
          This experiment needs access to your microphone. It will then use live
          data to predict your activity based on the classes at the bottom.
        </p>
      </div>
      <div className="button-div">
        <button className=" button-28 " onClick={toggleMicrophone}>
          {isMicOn ? "Stop Spectogram" : "Start Spectogram"}
        </button>
        {/* {prediction && (
          <div className="prediction-div">
            <h2>Prediction: {prediction}</h2>
          </div>
        )} */}
        <GoogleAudio />
      </div>
      <div className="canvas-div">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
};

export default Spectrogram;
