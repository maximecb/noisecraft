import { assert } from './utils.js';
import * as synth from './synth.js';
import * as music from './music.js';

/**
 * Base class for stateful audio processing nodes
 * */
export class AudioNode
{
    constructor()
    {
    }
}

// TODO: need method(s) to create/delete the appropriate audio nodes
// We could start by just iterating over the state
// Do we want an AudioGraph class with an update method?
// We could also create a genSample method for it?

/**
 * Stateful graph that generates audio samples
 * */
export class AudioGraph
{
    constructor()
    {
        // Current playback position in seconds
        this.playPos = 0;
    }


}
