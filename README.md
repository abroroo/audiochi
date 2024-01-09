I got curious about [Google Teachable Machine](https://teachablemachine.withgoogle.com/v1/) after reading this [article](https://medium.com/@warronbebster/teachable-machine-tutorial-bananameter-4bfffa765866) on medium, where he trains banana classification model, showing final result on the [web](https://tm-image-demo.glitch.me/) 

I wanted it to try it myself and hopefully deploy it to the web too, and it [worked](https://audiochi.vercel.app/) , yay! 

I wanted to make sound recognition model, if possible visualize the audio as well.

With Teachable Machine, you can do [Transfer Learning](https://en.wikipedia.org/wiki/Transfer_learning) which basically allows you to take a pre-trained model (which has already learned a lot from a vast amount of data) and then tweak it for your specific needs.

In this case, I added some audio classes like snap, clap, etc. Teachable Machine fisrt requires you to record background noise , then you can define audio classes and record samples for them.

Teachable Machine will retrain the model fine tunning it to recognize your defined classes 
![](https://raw.githubusercontent.com/abroroo/audiochi/main/public/train.png)

### How to build it with NextJS

I learned that Teachable Machine can be used with TenserFlow.js [models](https://www.tensorflow.org/js/models). And threre is only one audio processing model which is [Speech Commands](https://github.com/tensorflow/tfjs-models/tree/master/speech-commands) 

I initially planned to use WebSockets to send audio to the backend, and there process it with a TensorFlow's Speech-Commands model, and get real-time outputs. But I ran into a bunch of dependency conflicts. Specifically, the setup for Google Teachable Machine's model didn't align with the Speech-Command set up in node.js

To not get things complicated, I decided to use the Speech Commands' CDN and handle everything on the client side only, which handles audio access by itself. 

There is a good sample of code on how to use the model on Teachable Machine export page: 

![](https://raw.githubusercontent.com/abroroo/audiochi/main/public/export.png)

Once you save trained model to your Google Drive, you can import it, which will give you a link to two necessary files `model.json` and `metadata.json`. You can pass it to Speech Commands `.create()` method:
```

 const newRecognizer = speechCommands.create(
      "BROWSER_FFT", // Fourier transform type
      undefined, // Speech commands vocabulary feature (not needed for your models)
      checkpointURL,
      metadataURL
    );

```
'"BROWSER_FFT"' will ask for access to the microphone and then it will start processing audio and output samples right away. 

For the Sound Recognition part, we are done!

### How to Visualise Audio

In the documenations of Web Audio API, there is very good [guide](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Visualizations_with_Web_Audio_API#creating_a_frequency_bar_graph) on how to visualise audio using Canvas API . 

But for the start, I needed a way to access the user's microphone. 

Thanks to ChatGPT, I learned that I can achieve this with [WebRTC API](https://developer.mozilla.org/en-US/docs/Glossary/WebRTC) (native to browsers). I've explained how WebRTC works in [here](https://github.com/abroroo/til/blob/main/WebRTC/webrtc.md)
   ```
        const [stream, setStream] = useState(null);
        navigator.mediaDevices.getUserMedia({ audio: true }).then((micStream) => {
                setStream(micStream);
              });
   ```

Once I had access to the raw audio, I used [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) which helped me convert those sound waves into actionable data points. 

```

     const audioContext = new (window.AudioContext ||
             window.webkitAudioContext)();
     
           const analyser = audioContext.createAnalyser();
           analyser.fftSize = 4096;
     
           const source = audioContext.createMediaStreamSource(stream);
           source.connect(analyser);

```

Following the above mentioned tutorial and ChatGPT, I came up with this function: 

```

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


```
> `window.requestAnimationFrame(drawSpectrogram)`
> 
> This line is calling the `drawSpectrogram` function recursively. `requestAnimationFrame` is a built-in browser API that allows you to schedule a function to be called before the next repaint. This provides a smooth and > efficient way to animate elements on the web.

> `let imgData = ctx.getImageData(1, 0, window.innerWidth - 1, window.innerHeight)`
> 
> We get the image data, to put it again to the new canvas to create shifting effect to the left.  It starts at the x-coordinate 1 and captures the data up to the canvas's width, and spans the full height of the canvas.

> `ctx.fillRect(0, 0, window.innerWidth, window.innerHeight)`
>
> With `fillRect()` we are clearing rectangle from the previous image by filling it with black color . This ensures the next image we put in here is drawn cleanly.

> `ctx.putImageData(imgData, 0, 0)`
>
> After clearing the canvas, this line puts the previously captured image data back onto the canvas, essentially shifting everything to the left by one pixel. This creates a scrolling effect.

> `analyser.getByteFrequencyData(data)`
>
>  Method fetches frequency data from the audio signal being analyzed by the Web Audio API's AnalyserNode. The `data` array is a `Uint8Array` that will store the frequency data. This array will hold values ranging > >  from 0 to 255. Then we loop over each number in the `data` array then use it draw spectrogram with canvas methods. Each value in the data array corresponds to a specific frequency band. These values represent the > intensity or magnitude of the respective frequency bands.

> `rat` calculates a normalized value for the frequency data, ranging from 0 to 1.
> `hue`, `sat`, and `lit `determine the color values based on the normalized frequency data. `hue` is the color type. It's expressed as an angle between 0 and 360 degrees, representing different colors.
> `ctx.beginPath()` starts a new path for drawing.
> `ctx.strokeStyle` sets the color for the current drawing path based on the calculated hue, saturation, and lightness.
> `ctx.moveTo()` moves the starting point of the path to the specified coordinates.
> `ctx.lineTo()` draws a line from the current drawing position to the specified coordinates.
> `ctx.stroke()` actually draws the path on the canvas.


And that's it, we can add toggle buttons as usual. 




