

import Spectrogram from "../components/Spectrograph";

const Home = () => {


  return (
    <div>

      <Spectrogram />
      <script src="https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@1.3.1/dist/tf.min.js"></script>
      <script src="https://cdn.jsdelivr.net/npm/@tensorflow-models/speech-commands@0.4.0/dist/speech-commands.min.js"></script>
    </div>
  );
};

export default Home;
