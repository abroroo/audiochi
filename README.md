I got curious about [Google Teachable Machine](https://teachablemachine.withgoogle.com/v1/) after reading this [article](https://medium.com/@warronbebster/teachable-machine-tutorial-bananameter-4bfffa765866) on medium, where he trains banana classification model, showing final result on the [web](https://tm-image-demo.glitch.me/) 

I wanted it to try it myself and hopefully deploy it to the web too, and it [worked](https://audiochi.vercel.app/) , yay! 

I wanted to make sound recognition model, if possible visualize the audio as well.

With Teachable Machine, you can do [Transfer Learning](https://en.wikipedia.org/wiki/Transfer_learning) which basically allows you to take a pre-trained model (which has already learned a lot from a vast amount of data) and then tweak it for your specific needs.

In this case, I added some audio classes like snap, clap, etc. Teachable Machine requires you to record samples of audio classes you defined, and then it will retrain the model fine tunning the model to recognize your defined classes 







### How to build it with NextJS

I learned that Teachable Machine can be used with TenserFlow.js [models](https://www.tensorflow.org/js/models). And threre is only one audio processing model which is [Speech Commands](https://github.com/tensorflow/tfjs-models/tree/master/speech-commands) 

For the start, I needed a way to access the user's microphone. 

I learned that I can achieve this with [WebRTC API](https://developer.mozilla.org/en-US/docs/Glossary/WebRTC)  which is native to browsers. Once I had access to the raw audio, I discovered the [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) which helped me convert those sound waves into actionable data points.

I initially planned to use WebSockets to send audio to the backend, and there process it with a TensorFlow's Speech-Commands model, and get real-time outputs. But I ran into a bunch of dependency conflicts. Specifically, the setup for Google Teachable Machine's model didn't align with the Speech-Command set up in node.js

To not get things complicated, I decided to use the Speech Commands' CDN and handle everything on the client side only.
