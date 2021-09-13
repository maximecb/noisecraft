import { AudioGraph } from './audiograph.js';

// Great intro to audio worklets:
// https://developers.google.com/web/updates/2017/12/audio-worklet
//
// Mozilla reference:
// https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletNode

class NCAudioWorklet extends AudioWorkletProcessor
{
    constructor()
    {
        super();

        // Port to process input messages from the main thread
        this.port.onmessage = this.onmessage.bind(this);

        // Audio generation graph
        this.audioGraph = new AudioGraph(
            44100,
            this.port.postMessage.bind(this.port)
        );
    }

    /// Receive messages from the message port
    onmessage(event)
    {
        let msg = event.data;
        this.audioGraph.parseMsg(msg);
    }

    process(inputs, outputs, parameters)
    {
        const output = outputs[0];
        const outChannel0 = output[0];
        const outChannel1 = output[1];

        // For each sample to generate
        for (let i = 0; i < outChannel0.length; i++)
        {
            let [leftVal, rightVal] = this.audioGraph.genSample();
            outChannel0[i] = leftVal;
            outChannel1[i] = rightVal;
        }

        return true;
    }
}

registerProcessor('sample-generator', NCAudioWorklet)
