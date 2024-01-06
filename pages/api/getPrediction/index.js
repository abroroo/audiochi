// DIDN'T WORK BECAUSE OF PEER DEPENDENCIES OF SPEECH-COMMANDS AND TENSORFLOW.JS AND GOOGLE TEACHABLE MACHINE MODEL GENERATION SETTINGS









// pages/api/getPrediction/index.js
// import fs from 'fs';
// import path from 'path';
// //import { getSession } from 'next-auth/react';
// // import { speechCommands } from "@tensorflow-models/speech-commands";
// import * as speechCommands from "@tensorflow-models/speech-commands";
// //import { tf } from "tensorflow/tfjs-node";
// import * as tf from '@tensorflow/tfjs-node';

// import { Server } from 'socket.io';

// let recognizer;

// async function loadModel() {

//     // Dispose of any lingering TensorFlow variables
//     tf.disposeVariables();
//     tf.dispose()


//     const modelPath = path.join(process.cwd(), 'public', 'ai-models', 'model.json');
//     const model = await tf.loadLayersModel(`file://${modelPath}`);

//     // Load the model weightsnpm run de
//     const weightsPath = path.join(process.cwd(), 'public', 'ai-models', 'weights.bin');
//     await model.loadWeights(`file://${weightsPath}`, false);

//     const metadataPath = path.join(process.cwd(), 'public', 'ai-models', 'metadata.json');
//     const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));

//     recognizer = speechCommands.create("BROWSER_FFT");
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
//             includeSpectrogram: true,
//             invokeCallbackOnNoiseAndUnknown: true,
//             overlapFactor: 0.5,
//         }
//     );
// }

// loadModel();


// export default async function handler(req, res) {
//     if (!res.socket.server.io) {
//         const io = new Server(res.socket.server);

//         io.on('connection', (socket) => {
//             console.log('New client connected');

//             socket.on('audioData', async (audioData) => {
//                 if (!recognizer) {
//                     return socket.emit('prediction', { error: 'Recognizer not initialized' });
//                 }

//                 try {
//                     //const prediction = await recognizer.recognize(tf.tensor(audioData));
//                     socket.emit('prediction', { prediction: 'clap' });
//                 } catch (error) {
//                     console.error('Error processing audio:', error);
//                     socket.emit('prediction', { error: 'Internal Server Error' });
//                 }
//             });

//             socket.on('disconnect', () => {
//                 console.log('Client disconnected');
//             });
//         });

//         res.socket.server.io = io;
//     }

//     res.end();
// }





export default function handler(req, res) {
    res.send('Server is running');
}





//   export default async function handler(req, res) {
//     try {
//         const { audioData } = req.body;

//         if (!recognizer) {
//             return res.status(500).json({ error: 'Recognizer not initialized' });
//         }

//         // Process the audio data using TensorFlow.js and the speech-commands model
//         const prediction = await recognizer.recognize(tf.tensor(audioData));
//         res.status(200).json({ prediction });
//     } catch (error) {
//         console.error('Error processing audio:', error);
//         res.status(500).json({ error: 'Internal Server Error' });
//     }
// }

