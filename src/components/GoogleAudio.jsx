import React, { useState } from "react";

const GoogleAudio = () => {
  const URL = "https://teachablemachine.withgoogle.com/models/ooIMg_caM/";
  const [isPredicting, setIsPredicting] = useState(false);
  const [recognizer, setRecognizer] = useState(null);

  async function createModel() {
    const checkpointURL =
      "https://storage.googleapis.com/tm-model/gkl9L4FLn/model.json"; // Model topology URL
    const metadataURL =
      "https://storage.googleapis.com/tm-model/gkl9L4FLn/metadata.json"; // Model metadata URL

    const newRecognizer = speechCommands.create(
      "BROWSER_FFT", // Fourier transform type
      undefined, // Speech commands vocabulary feature (not needed for your models)
      checkpointURL,
      metadataURL
    );
    await newRecognizer.ensureModelLoaded();

    setRecognizer(newRecognizer);
    return newRecognizer;
  }

  async function startPredictions() {
    const newRecognizer = await createModel();
    setIsPredicting(true);
    const classLabels = newRecognizer.wordLabels();
    const labelContainer = document.getElementById("label-container");
    labelContainer.innerHTML = "";

    for (let i = 0; i < classLabels.length; i++) {
      labelContainer.appendChild(document.createElement("div"));
    }

    newRecognizer.listen((result) => {
      const scores = result.scores;
      for (let i = 0; i < classLabels.length; i++) {
        const classPrediction = `${classLabels[i]}: ${(scores[i] * 100).toFixed(
          2
        )}%`;
        labelContainer.childNodes[i].innerHTML = classPrediction;
      }
    });
  }

  function stopPredictions() {
    if (recognizer) {
      recognizer.stopListening();
      setIsPredicting(false);
    }
  }

  return (
    <div className="text-[#fff] mt-10 flex items-center justify-center flex-col w-full">
      <p className="my-5 text-sm text-[#fff] w-[90%]">
        With a concept of transfer learning. It can also predict your audio
        activity based on the classes it's trained{" "}
      </p>
      {!isPredicting ? (
        <button className="button-28" type="button" onClick={startPredictions}>
          Start Prediction
        </button>
      ) : (
        <button className="button-28" type="button" onClick={stopPredictions}>
          Stop Predictions
        </button>
      )}
      {/* <p className="mt-5 text-sm text-[#fff] w-[90%]">
        It is listening in real-time and showing probability by percentage
      </p> */}
      <div id="label-container" className="m-10 grid gap-2"></div>
    </div>
  );
};

export default GoogleAudio;
