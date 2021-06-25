import { assert } from './utils.js';
import * as synth from './synth.js';
import * as music from './music.js';

/**
 * Stateful graph that generates audio samples
 */
export class AudioGraph
{
    constructor()
    {
        // Current playback position in seconds
        this.playPos = 0;

        // Compiled code to generate audio samples
        this._genSample = null;

        // Stateful audio processing nodes, indexed by nodeId
        this.nodes = [];
    }

    /**
     * Update the audio graph given a new compiled unit
     */
    update(unit)
    {
        this._genSample = new Function(
            'time',
            'nodes',
            unit.src
        );

        // Note that we don't delete any nodes, even if existing nodes are
        // currently not listed in the compiled unit, because currently
        // disconnected nodes may get reconnected, and deleting things like
        // delay lines would lose their current state.
        // All nodes get garbage collected when the playback is stopped.

        // For each audio node
        for (let nodeId in unit.nodes)
        {
            console.log(`CREATING AUDIO NODE WITH ID ${nodeId}`);

            let nodeState = unit.nodes[nodeId];

            assert (nodeState.type in NODE_CLASSES);
            let nodeClass = NODE_CLASSES[nodeState.type];

            // If a node with this nodeId is already mapped, it must have the same type
            assert (!this.nodes[nodeId] || this.nodes[nodeId] instanceof nodeClass);
            this.nodes[nodeId] = new nodeClass(nodeState);
        }
    }

    /**
     * Generate one [left, right] pair of audio samples
     */
    genSample()
    {
        this.playPos += 1 / 44100;
        return this._genSample(this.playPos, this.nodes);
    }
}

/**
 * Base class for stateful audio processing nodes
 */
class AudioNode
{
    constructor(state)
    {
        this.state = state;
    }
}

/**
 * Sine wave oscillator
 */
class SineOsc extends AudioNode
{
    constructor(state)
    {
        super(state);

        // Current time position
        this.phase = 0;

        // Current sync input sign (positive/negative)
        this.syncSgn = false;
    }

    update(freq, sync)
    {
        const sampleTime = 1 / 44100;

        let minVal = this.state.params.minVal;
        let maxVal = this.state.params.maxVal;

        if (!this.syncSgn && sync > 0)
            this.phase = 0;

        this.syncSgn = (sync > 0);

        let cyclePos = this.phase % 1;
        this.phase += sampleTime * freq;

        let v = Math.sin(cyclePos * 2 * Math.PI);
        let normVal = (v + 1) / 2;

        return minVal + normVal * (maxVal - minVal);
    }
}

/**
 * Map of node types to classes
 */
let NODE_CLASSES =
{
    Sine: SineOsc,
};
