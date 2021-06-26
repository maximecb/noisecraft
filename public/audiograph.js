import { assert } from './utils.js';
import * as synth from './synth.js';
import * as music from './music.js';

// Amount of time that elapses for each sample
const sampleTime = 1 / 44100;

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

            let nodeClass = (
                nodeState.type in NODE_CLASSES?
                NODE_CLASSES[nodeState.type]:
                AudioNode
            );

            // If a node with this nodeId is already mapped
            if (this.nodes[nodeId])
            {
                // The existing node must have the same type
                assert (this.nodes[nodeId] instanceof nodeClass);

                // Don't recreate it because that would reset its state
                continue;
            }

            // Create a new audio node
            this.nodes[nodeId] = new nodeClass(nodeState);
        }

        // Create the sample generation function
        this._genSample = new Function(
            'time',
            'nodes',
            unit.src
        );
    }

    /**
     * Set a parameter value on a given node
     */
    setParam(nodeId, paramName, value)
    {
        assert (nodeId in this.nodes);
        let node = this.nodes[nodeId];
        assert (paramName in node.params);
        assert (typeof value == 'number');
        node.params[paramName] = value;
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
        this.params = state.params;
    }
}

/**
 * Sawtooth wave oscillator
 */
class SawOsc extends AudioNode
{
    constructor(state)
    {
        super(state);

        // Current time position
        this.phase = 0;

        // Current sync input sign (positive/negative)
        this.syncSgn = false;
    }

    update(freq)
    {
        this.phase += sampleTime * freq;
        let cyclePos = this.phase % 1;
        return -1 + 2 * cyclePos;
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
        let minVal = this.params.minVal;
        let maxVal = this.params.maxVal;

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
    Saw: SawOsc,
    Sine: SineOsc,
};
