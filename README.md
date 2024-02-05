## How I actually came up with this project:

I got curious about [Google Teachable Machine](https://teachablemachine.withgoogle.com/v1/) after reading this [article](https://medium.com/@warronbebster/teachable-machine-tutorial-bananameter-4bfffa765866) on medium, where he trains banana classification model, showing final result on the [web](https://tm-image-demo.glitch.me/)

I wanted it to try it myself and hopefully deploy it to the web too, and it [worked](https://audiochi.vercel.app/) , yay!

I wanted to make sound recognition model, if possible visualize the audio as well.

With Teachable Machine (TM), you can do [Transfer Learning](https://en.wikipedia.org/wiki/Transfer_learning) which basically allows you to take a pre-trained model (which has already learned a lot from a vast amount of data) and then tweak it for your specific needs.

In this case, I added some audio classes like snap, clap, etc. TM fisrt requires you to record background noise , then you can define audio classes and record samples for them.

It will retrain the model fine tunning it to recognize your defined classes
![](https://raw.githubusercontent.com/abroroo/audiochi/main/public/train.png)

## How to build it with NextJS

I learned that TM can be used with TenserFlow.js [models](https://www.tensorflow.org/js/models). And threre is only one audio processing model which is [Speech Commands](https://github.com/tensorflow/tfjs-models/tree/master/speech-commands)

I initially planned to use WebSockets to send audio to the backend, and there process it with a TensorFlow's Speech-Commands model, and get real-time outputs. But I ran into a bunch of dependency conflicts. Specifically, the setup for Google Teachable Machine's model didn't align with the Speech-Command set up in node.js

To not make things complicated, I decided to use the Speech Commands' CDN and handle everything on the client side only, which handles audio access by itself.

There is a good code sample on how to use the model on TM's export page:

![](https://raw.githubusercontent.com/abroroo/audiochi/main/public/export.png)

Once you save trained model to your Google Drive, you can import it, which will give you a link to two necessary files `model.json` and `metadata.json`. You can pass it to Speech Commands `.create()` method:

```javascript
const newRecognizer = speechCommands.create(
  "BROWSER_FFT", // Fourier transform type
  undefined, // Speech commands vocabulary feature (not needed for your models)
  checkpointURL,
  metadataURL
);
```

'"BROWSER_FFT"' will ask for access to the microphone and then it will start processing audio and output samples right away.

For the Sound Recognition part, we are done!

## How to Visualise Audio

In the documenations of Web Audio API, there is very good [guide](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Visualizations_with_Web_Audio_API#creating_a_frequency_bar_graph) on how to visualise audio using Canvas API .

But for the start, I needed a way to access the user's microphone.

Thanks to ChatGPT, I learned that I can achieve this with [WebRTC API](https://developer.mozilla.org/en-US/docs/Glossary/WebRTC) (native to browsers). I've explained how WebRTC works in [here](https://github.com/abroroo/til/blob/main/WebRTC/webrtc.md)

```javascript
const [stream, setStream] = useState(null);
navigator.mediaDevices.getUserMedia({ audio: true }).then((micStream) => {
             setStream(micStream);
});
```

`stream` now is equal to something like this :

  ```yaml
    MediaStream {
      id: "media-stream-id",
      active: true,
      onaddtrack: null,
      onremovetrack: null,
      ...
    }

  ```

Once I had access to the raw audio, I used [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) which helped me convert those sound waves into actionable data points. It uses FFT (Fast Fourier Transform) algorithm to convert a time-domain signal (such as audio waveform) into its frequency-domain representation. It decomposes the signal into its constituent frequencies, allowing analysis of the signal's frequency content.

```javascript
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

const analyser = audioContext.createAnalyser();
analyser.fftSize = 4096;

const source = audioContext.createMediaStreamSource(stream);
source.connect(analyser);
```

- `analyser.fftSize = 4096` indicates that the FFT analysis will use an FFT size of 4096 points. This means that the frequency spectrum of the audio signal will be divided into 4096 frequency bins for analysis. Available sizes are between 32 and 32768 bins.

- `analyser` is an `AnalyserNode`, representing an analyzer that can be used to extract frequency or time-domain data from the audio stream.

- `source` is a `MediaStreamAudioSourceNode`, representing the audio source obtained from the user's microphone (stream).

  `source` now looks like this :

  ```yaml
  MediaStreamAudioSourceNode {
      context: AudioContext { /* Reference to the AudioContext object */ },
      mediaStream: MediaStream { /* Reference to the MediaStream object */ },
      numberOfInputs: 0,
      numberOfOutputs: 1,
      channelCount: 2,
      channelCountMode: "max",
      channelInterpretation: "speakers",
      ...
    }

  ```

  By calling `source.connect(analyser)`, we're establishing a connection between the **audio source (source)** and the **analyzer node (analyser)**. This connection allows the audio data from the microphone stream to flow into the analyzer node, where it can be analyzed and processed further.

The Audio data is typically represented in a 0 to 255 range, and store that data we can't use usual js array, we need `Uint8Array` which is designed for storing 8-bit unsigned integers, which are suitable for representing amplitude values ranging from 0 to 255.

  ```javascript
    const audioFrequencyArray = new Uint8Array(analyser.frequencyBinCount); // Create a new array to store the frequency data

    analyser.getByteFrequencyData(audioFrequencyArray); // Populate data with frequency data using analyser.getByteFrequencyData()
  ```

- The value of `frequencyBinCount` is typically half of the FFT size `(analyser.fftSize)` and represents the number of frequency data points returned by the FFT.

- Now `audioFrequencyArray` looks something like this:

  ```javascript
  Uint8Array(2048) [110, 125, 140, 155, 170, 185, 200, 215, 230, ...]

  ```

## Drawing the spectogram

Following the above mentioned tutorial and ChatGPT, I came up with this function:

```javascript
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

  analyser.getByteFrequencyData(audioFrequencyArray);

  /// ... for loop
```

- `getImageData()` captures the pixel data of the canvas, effectively storing the current state of the canvas.

- `fillRect()` clears the entire canvas by filling it with a solid color.

- `putImageData()` restores the previously captured pixel data back onto the canvas, effectively clearing the canvas and resetting it to its previous state.

This process ensures that the canvas is cleared before drawing new content, preventing previous visualizations from overlapping or accumulating over time.

Now we need to iterate over an array of audio frequency data `(audioFrequencyArray)` , representing frequency intensity values obtained from the audio stream.

  For each frequency data point:
  - The intensity value is normalized (`rat`) to a range between 0 and 1.
  - A `hue` value is calculated based on the normalized intensity, which determines the color of the spectrogram line.
  - The __strokeStyle__ of the canvas context (`ctx`) is set to a color based on the calculated hue, saturation (`sat`), and lightness (`lit`).
  - A line is drawn on the canvas using `moveTo()` and `lineTo()`, representing the frequency intensity at that point in the spectrogram.

  ```javascript
    // Draw your spectrogram here using the Unit8Array "audioFrequencyArray"
    for (let i = 0; i < len; i++) {
      let rat = audioFrequencyArray[i] / 255;
      let hue = Math.round(rat * 120 + (280 % 360));
      let sat = "100%";
      let lit = 10 + 70 * rat + "%";

      ctx.beginPath();
      ctx.strokeStyle = `hsl(${hue}, ${sat}, ${lit})`;
      ctx.moveTo(x, height - i * h);
      ctx.lineTo(x, height - (i * h + h));
      ctx.stroke();
    }
  ```

  - After clearing the canvas and resetting it to its initial state, the spectrogram is drawn using the calculated frequency intensity values. The process of capturing and restoring the canvas state ensures that each iteration of drawing the spectrogram starts with a clean slate, preventing artifacts or remnants from previous visualizations.

    > `window.requestAnimationFrame(drawSpectrogram)`
    >
    > This line is calling the `drawSpectrogram` function recursively. `requestAnimationFrame` is a built-in browser API that allows you to schedule a function to be called before the next repaint. This provides a smooth and > efficient way to animate elements on the web.

And that's it, we can add toggle buttons as usual.

### Further Development Ideas

I need to figure out a better way to use it. Definetely, it could be a good match with Raspberry Pi boards and use it as home assistant. But for now, I'm thinking of making it rhyme with rap lyrics based on what it hears. I'll work on it more once I have a clearer plan.
