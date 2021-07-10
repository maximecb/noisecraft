import { assert } from './utils.js';
import * as synth from './synth.js';
import * as music from './music.js';

/**
 * Stateful graph that generates audio samples
 */
export class AudioGraph
{
    constructor(sampleRate)
    {
        assert (sampleRate == 44100);
        this.sampleRate = sampleRate;

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
            this.nodes[nodeId] = new nodeClass(
                nodeState,
                this.sampleRate
            );
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
        if (!this._genSample)
            return [0, 0];

        this.playPos += 1 / 44100;
        return this._genSample(this.playPos, this.nodes);
    }
}

/**
 * Base class for stateful audio processing nodes
 */
class AudioNode
{
    constructor(state, sampleRate)
    {
        this.state = state;
        this.params = state.params;
        this.sampleRate = sampleRate;
        this.sampleTime = 1 / sampleRate;
    }
}

/**
Clock source, with tempo in BPM
*/
class Clock extends AudioNode
{
    constructor(state, sampleRate)
    {
        super(state, sampleRate);

        this.phase = 0;
    }

    update()
    {
        let freq = music.CLOCK_PPQ * this.params.value / 60;
        let duty = 0.5;
        this.phase += this.sampleTime * freq;
        let cyclePos = this.phase % 1;
        return (cyclePos < duty)? -1:1;
    }
}

/**
Delay line node
*/
class Delay extends AudioNode
{
    constructor(state, sampleRate)
    {
        super(state, sampleRate);

        // Stateful delay line object
        this.delay = new synth.Delay(sampleRate);
    }
}

/**
Overdrive-style distortion
*/
class Distort extends AudioNode
{
    constructor(state, sampleRate)
    {
        super(state, sampleRate);
    }

    update(input, amount)
    {
        return synth.distort(input, amount);
    }
}

/**
Pulse wave oscillator
*/
class PulseOsc extends AudioNode
{
    constructor(state, sampleRate)
    {
        super(state, sampleRate);

        this.phase = 0;
    }

    update(freq, duty)
    {
        this.phase += this.sampleTime * freq;
        let cyclePos = this.phase % 1;
        return (cyclePos < duty)? -1:1;
    }
}

/**
 * Sawtooth wave oscillator
 */
class SawOsc extends AudioNode
{
    constructor(state, sampleRate)
    {
        super(state, sampleRate);

        // Current time position
        this.phase = 0;
    }

    update(freq)
    {
        this.phase += this.sampleTime * freq;
        let cyclePos = this.phase % 1;
        return -1 + 2 * cyclePos;
    }
}

/**
 * Sine wave oscillator
 */
class SineOsc extends AudioNode
{
    constructor(state, sampleRate)
    {
        super(state, sampleRate);

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
        this.phase += this.sampleTime * freq;

        let v = Math.sin(cyclePos * 2 * Math.PI);
        let normVal = (v + 1) / 2;

        return minVal + normVal * (maxVal - minVal);
    }
}

/**
 * Triangle wave oscillator
 */
class TriOsc extends AudioNode
{
    constructor(state, sampleRate)
    {
        super(state, sampleRate);

        // Current time position
        this.phase = 0;
    }

    update(freq)
    {
        this.phase += this.sampleTime * freq;
        let cyclePos = this.phase % 1;

        if (cyclePos < 0.5)
            return -1 + (4 * cyclePos);

        return 1 - (4 * (cyclePos - 0.5));
    }
}

/**
 * Two-pole low-pass filter
 */
 class Filter extends AudioNode
 {
     constructor(state, sampleRate)
     {
         super(state, sampleRate);

         this.filter = new synth.TwoPoleFilter();
     }

     update(input, cutoff, reso)
     {
        return this.filter.apply(input, cutoff, reso);
     }
}

/**
 * Monophonic note sequencer
 */
class MonoSeq extends AudioNode
{
    constructor(state, sampleRate)
    {
        super(state, sampleRate);

        // Current clock sign (positive/negative)
        this.clockSgn = false;

        // Number of clock ticks since playback start
        this.clockCnt = 0;

        // Currently highlighted step
        this.curStep = false;

        // Time the last note was triggered
        this.trigTime = 0;

        // Amount of time the gate stays open for each step
        // This is currently not configurable
        this.gateTime = 0.1;

        // Output frequency and gate values
        this.freq = 0;
        this.gate = 0;

        // FIXME: this should probably be on the state?
        // Currently playing pattern
        this.patIdx = 0;

        // Next pattern that is queued for playback
        this.nextPat = undefined;
    }

    /**
     * Takes the current time and clock signal as input.
     * Produces frequency and gate signals as output.
     */
    update(time, clock)
    {
        if (!this.clockSgn && clock > 0)
        {
            // If we are at the beginning of a new sequencer step
            if (this.clockCnt % music.CLOCK_PPS == 0)
            {
                var grid = this.state.patterns[this.patIdx];

                var stepIdx = (this.clockCnt / music.CLOCK_PPS);
                assert (stepIdx < grid.length);

                this.gate = 0;
                this.trigTime = 0;

                for (var rowIdx = 0; rowIdx < this.numRows; ++rowIdx)
                {
                    if (!grid[stepIdx][rowIdx])
                        continue

                    let note = this.scale[rowIdx];
                    this.freq = note.getFreq();
                    this.gate = 1;
                    this.trigTime = time;
                }

                // TODO: transmit info back to UI view?
                // Highlight the current step
                //this.highlight(stepIdx);

                // If this is the last step of this pattern
                if (stepIdx === grid.length - 1)
                {
                    this.clockCnt -= grid.length * music.CLOCK_PPS;

                    if (this.nextPat !== undefined)
                    {
                        this.select(this.nextPat);
                    }
                }
            }

            this.clockCnt++;
        }

        // If we are past the end of the note
        if (this.gate > 0)
        {
            if (time - this.trigTime > gateTime)
            {
                this.gate = 0;
                this.trigTime = 0;
            }
        }

        this.clockSgn = (clock > 0);

        assert (!isNaN(this.freq), 'MonoSeq freq is NaN');
        assert (!isNaN(this.gate), 'MonoSeq gate is NaN');
        return [this.freq, this.gate];
    }
}

/**
 * Map of node types to classes
 */
let NODE_CLASSES =
{
    Clock: Clock,
    Delay: Delay,
    Distort: Distort,
    Pulse: PulseOsc,
    Saw: SawOsc,
    Sine: SineOsc,
    Tri: TriOsc,
    Filter: Filter,
    MonoSeq: MonoSeq,
};
