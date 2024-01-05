// // pages/api/predict.js
// import { getSession } from 'next-auth/react';
// import { speechCommands } from "@tensorflow-models/speech-commands";
// import { tf } from "tensorflow.js-node";
// import { io } from 'socket.io-client';

// let recognizer;

// async function loadModel() {

//     const modelURL = "/ai-models/model.json";
//     const model = await tf.loadLayersModel(modelURL);

//     const metadataURL = "/ai-models/metadata.json";
//     const metadata = await fetch(metadataURL).then((response) =>
//         response.json()
//     );

//     const recognizer = speechCommands.create("BROWSER_FFT");
//     await recognizer.ensureModelLoaded();

//     recognizer.model = model;
//     recognizer.wordLabels = metadata.wordLabels;

//     // Set up a callback for when a word is recognized
//     recognizer.listen(
//         (result) => {
//             console.log("Word recognized:", result);
//             // You can perform actions based on the recognized word here
//         },
//         {
//             includeSpectrogram: true, // Enable audio data retrieval
//             invokeCallbackOnNoiseAndUnknown: true,
//             overlapFactor: 0.5,
//         }
//     );
// }

// loadModel();

// export default async function handler(req, res) {
//     try {
//         const { audioData } = req.body;

//         // Process the audio data using TensorFlow.js and the speech-commands model
//         const prediction = await recognizer.recognize(tf.tensor(audioData));
//         res.status(200).json({ prediction });
//     } catch (error) {
//         console.error('Error processing audio:', error);
//         res.status(500).json({ error: 'Internal Server Error' });
//     }
// }
