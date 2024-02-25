import React from "react";
import Spectogram3D from "../../src/components/Spectogram3D";
import "../../src/app/globals.css";
import Script from "next/script";

const VersionTwo = () => {
  return (
    <>
      <Spectogram3D />
      <script src="https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@1.3.1/dist/tf.min.js" />
      <script src="https://cdn.jsdelivr.net/npm/@tensorflow-models/speech-commands@0.4.0/dist/speech-commands.min.js" />
    </>
  );
};

export default VersionTwo;
