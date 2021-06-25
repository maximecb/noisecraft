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
            unit.src
        );

        // TODO: update audio nodes
        // Don't delete any, they may get reconnected






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
     constructor()
     {
     }
 }
