/*
Nodes
=====

Each node has:
- a node type (string)
- node name (string)
- global id number (integer)
- params (list of values, user-editable)
  - some of these can be invisible to the user
  - some of these are reset after playback
- a map of input connections for each input port
  - pairs of (node_id, out_port_name), no property if no connection
- private state that is used for audio
  - this is not persisted and not tracked by the model

For example, the currently active step in the sequencer needs to
be synced between the GUI and audio, but is not user-editable and
also not persisted across playback.

Actions
=======

Here is a tentative list of various types of actions that can be performed on the model:

// Set the project title
set_title <new_title>

create_node <type> <init_state> // Init state can be null if creating new node
delete_node <id>
connect <src_node> <out_port> <dst_node> <out_port>
disconnect <src_node> <out_port> <dst_node> <out_port>

// Creating a module will cause the model to
// Move nodes inside the module
create_module <list_of_node_ids>
split_module <node_id>

// Sent by the play/stop buttons
play 
stop

// Sent by the audio thread so the UI can reflect playback position 
set_play_pos <time>

// Actions to edit the settings/parameters of nodes
set_name <node_id> <name>
set_param <node_id> <param_name> <new_val>

// To visualize audio data in the UI
// Maybe this needs to be updated without an action
// because it's not something we can undo.
send_audio_data <node_id> <float array>

We may also need to send a set_param from the audio thread to
set the current position of MonoSeqs, because this is dependent
on a clock input node. Again this isn't something people can
undo, however. It could be more of a direct state update,
or it's a special undoable action.
*/

import { assert, treeCopy, treeEq } from './utils.js';

/**
 * High-level description/scheme for each type of node
*/
export const NODE_SCHEMA =
{
    'Add': {
        ins: [
            { name: 'in0', default: 0 },
            { name: 'in1', default: 0 }
        ],
        outs: ['out'],
        params: [],
        description: 'add input waveforms',
    },

    'ADSR': {
        ins: [
            { name: 'gate', default: 0 },
            { name: 'att', default: 0.02 },
            { name: 'dec', default: 0.1 },
            { name: 'sus', default: 0.2 },
            { name: 'rel', default: 0.1 }
        ],
        outs: ['out'],
        params: [],
        description: 'ADSR envelope generator',
    },

    'AudioOut': {
        ins: [
            { name: 'left', default: 0 },
            { name: 'right', default: 0 }
        ],
        outs: [],
        params: [],
        description: 'stereo sound output',
    },

    'Clock': {
        ins: [],
        outs: [''],
        params: [
            { name: 'value', default: 120 },
            { name: 'minVal', default: 60 },
            { name: 'maxVal', default: 240 },
            { name: 'controlNo', default: null },
        ],
        description: 'MIDI clock signal source with tempo in BPM',
    },

    // Commented out because we'll start without MIDI output support
    /*
    'ClockOut': {
        ins: [
            { name: 'clock', default: 0 }
        ],
        outs: [],
        params: [],
        description: 'MIDI clock output',
    },
    */

    'Const': {
        ins: [],
        outs: [''],
        params: [
            { name: 'value', default: 0 },
        ],
        description: 'editable constant value',
    },

    'Delay': {
        ins: [
            { name: 'in', default: 0 },
            { name: 'time', default: 0 }
        ],
        outs: ['out'],
        params: [],
        description: 'delay line',
    },

    // Used during compilation, reads from a delay line
    'delay_read': {
        internal: true,
        ins: [
            { name: 'time', default: 0 }
        ],
        outs: ['out'],
        params: [],
    },

    // Used during compilation, writes to a delay line
    'delay_write': {
        internal: true,
        ins: [
            { name: 'in', default: 0 },
        ],
        outs: [],
        params: [],
    },

    'Distort': {
        ins: [
            { name: 'in', default: 0 },
            { name: 'amt', default: 0 }
        ],
        outs: ['out'],
        params: [],
        description: 'overdrive-style distortion',
    },

    'Div': {
        ins: [
            { name: 'in0', default: 0 },
            { name: 'in1', default: 1 }
        ],
        outs: ['out'],
        params: [],
        description: 'divide one input by another',
    },

    'Filter': {
        ins: [
            { name: 'in', default: 0 },
            { name: 'cutoff', default: 1 },
            { name: 'reso', default: 0 }
        ],
        outs: ['out'],
        params: [],
        description: 'low-pass filter',
    },

    'Knob': {
        ins: [],
        outs: [''],
        params: [
            { name: 'value', default: 0 },
            { name: 'minVal', default: 0 },
            { name: 'maxVal', default: 1 },
            { name: 'controlNo', default: null },
        ],
        description: 'parameter control knob',
    },

    // Commented out because we'll start without MIDI input support
    /*
    'MidiIn': {
        ins: [],
        outs: ['freq', 'gate'],
        params: [],
        description: 'MIDI note input (cv/gate)',
    },
    */

    /*
    'MonoSeq': {
        ins: [
            { name: 'clock', default: 0 },
        ],
        outs: ['freq', 'gate'],
        params: [],
        description: 'monophonic step sequencer',
    },
    */

    'Mul': {
        ins: [
            { name: 'in0', default: 1 },
            { name: 'in1', default: 1 }
        ],
        outs: ['out'],
        params: [],
        description: 'multiply input waveforms',
    },

    'Noise': {
        ins: [],
        outs: ['out'],
        params: [],
        description: 'white noise source',
    },

    'Notes': {
        ins: [],
        outs: [],
        params: [],
        description: 'text notes',
    },

    'Pulse': {
        ins: [
            { name: 'freq', default: 0 },
            { name: 'pw', default: 0.5 }
        ],
        outs: ['out'],
        params: [],
        description: 'pulse/square oscillator',
    },

    'Saw': {
        ins: [
            { name: 'freq', default: 0 }
        ],
        outs: ['out'],
        params: [],
        description: 'sawtooth oscillator',
    },

    /*
    'Scope': {
        ins: [
            { name: '', default: 0 }
        ],
        outs: [],
        params: [
            { name: 'minVal', default: -1 },
            { name: 'maxVal', default: 1 },
        ],
        description: 'scope to plot incoming signals',
    },
    */

    'Sine': {
        ins: [
            { name: 'freq', default: 0 },
            { name: 'sync', default: 0 },
        ],
        outs: ['out'],
        params: [
            { name: 'minVal', default: -1 },
            { name: 'maxVal', default: 1 }
        ],
        description: 'sine wave oscillator',
    },

    'Slide': {
        ins: [
            { name: 'in', default: 0 },
            { name: 'rate', default: 1 },
        ],
        outs: ['out'],
        params: [],
        description: 'simple slew-rate limiter using a running average',
    },

    'Sub': {
        ins: [
            { name: 'in0', default: 0 },
            { name: 'in1', default: 0 }
        ],
        outs: ['out'],
        params: [],
        description: 'subtract input waveforms',
    },

    'Tri': {
        ins: [
            { name: 'freq', default: 0 }
        ],
        outs: ['out'],
        params: [],
        description: 'triangle oscillator',
    },
};

/**
 * Base class for all model update actions.
 * As a general rule, we only create actions for things we can undo.
 * Moving nodes is an action, but selecting or copying nodes is not.
*/
export class Action
{
    // Try to combine this action with a previous action
    // This is used to simplify the undo queue
    combine(prev)
    {
        // Action can't be combined
        return null;
    }

    // Update the model based on this action
    update(model)
    {
        throw TypeError("unimplemented");
    }
}

// Create a new node
export class CreateNode extends Action
{
    constructor(nodeType, x, y)
    {
        super();
        this.nodeType = nodeType;
        this.x = x;
        this.y = y;
    }

    update(model)
    {
        let desc = NODE_SCHEMA[this.nodeType];

        let nodeState = {
            type: this.nodeType,
            name: this.nodeType,
            x: this.x,
            y: this.y,
            ins: {},
            outs: {},
            params: {},
        };

        // Initialize parameters to default values
        for (let param of desc.params)
        {
            nodeState.params[param.name] = param.default;
        }

        // Add the node to the state
        let nodeId = model.nextId++;
        assert (!model.state[nodeId]);
        model.state.nodes[nodeId] = nodeState;
    }
}

// Move one or more nodes
export class MoveNodes extends Action
{
    constructor(nodeIds, dx, dy)
    {
        super();
        this.nodeIds = nodeIds;
        this.dx = dx;
        this.dy = dy;
    }

    combine(prev)
    {
        if (this.prototype != prev.prototype)
            return null;

        if (!treeEq(this.nodeIds, prev.nodeIds))
            return null;

        return new MoveNodes(
            this.nodeIds,
            this.dx + prev.dx,
            this.dy + prev.dy,
        );
    }

    update(model)
    {
        for (let nodeId of this.nodeIds)
        {
            let node = model.state.nodes[nodeId];
            node.x += this.dx;
            node.y += this.dy;
        }
    }
}

// Delete one or more nodes
export class DeleteNodes extends Action
{
    constructor(nodeIds)
    {
        super();
        this.nodeIds = nodeIds;
    }

    update(model)
    {
        console.log('deleting nodes');

        // For each node to be deleted
        for (let nodeId of this.nodeIds)
        {
            delete model.state.nodes[nodeId];
        }

        // For each node in the model
        for (let nodeId in model.state.nodes)
        {
            let nodeState = model.state.nodes[nodeId];

            // For each input-side connection
            for (let dstPort in nodeState.ins)
            {
                let [srcId, srcPort] = nodeState.ins[dstPort];

                // If the source node is being deleted
                if (this.nodeIds.indexOf(srcId) != -1)
                {
                    delete nodeState.ins[dstPort];
                }
            }
        }
    }
}

// Connect two nodes with an edge
export class ConnectNodes extends Action
{
    constructor(srcId, srcPort, dstId, dstPort)
    {
        super();
        this.srcId = srcId;
        this.srcPort = srcPort;
        this.dstId = dstId;
        this.dstPort = dstPort;
    }

    update(model)
    {
        assert (this.srcId != this.dstId);
        let srcNode = model.state.nodes[this.srcId];
        let dstNode = model.state.nodes[this.dstId];
        assert (srcNode);
        assert (dstNode);

        // An input can only have one connection
        dstNode.ins[this.dstPort] = [this.srcId, this.srcPort];
    }
}

// Remove a connection between two nodes
export class Disconnect extends Action
{
    constructor(dstId, dstPort)
    {
        super();
        this.dstId = dstId;
        this.dstPort = dstPort;
    }

    update(model)
    {
        let dstNode = model.state.nodes[this.dstId];
        assert (dstNode);
        delete dstNode.ins[this.dstPort];
    }
}

/** Graph of nodes model, operates on internal state data */
export class Model
{
    constructor()
    {
        // List of views subscribed to model updates
        this.views = [];

        // Persistent state
        this.state = null;

        // List of past states tracked for undo/redo
        this.undoQueue = [];
    }

    // Register a view
    addView(view)
    {
        this.views.push(view);
    }

    // Reinitialize the state for a brand new project
    new()
    {
        // Persistent state
        this.state = {
            title: 'New Project',
            nodes: {},
        };

        this.load(this.state);
    }

    // Load the JSON state into the model
    load(state)
    {
        // Current playback position
        this.playPos = 0;

        // Next node id to be allocated
        this.nextId = 0;

        // Compute the next available id
        for (let id in state.nodes)
        {
            id = Number(id);
            if (id >= this.nextId)
                this.nextId = id + 1;
        }

        this.state = state;

        // Broadcast state update
        this.broadcast(this.state, null);
    }

    /** Check if the graph contains a specific type of node */
    hasNode(nodeType)
    {
        // Compute the next available id
        for (let id in this.state.nodes)
        {
            let node = this.state.nodes[id];
            if (node.type == nodeType)
                return true;
        }

        return false;
    }

    // Broadcast an update to all views
    broadcast(newState, action)
    {
        for (let view of this.views)
        {
            view.update(newState, action);
        }
    }

    // Apply an action to the model
    update(action)
    {
        //console.log(action);

        assert (!('id' in action) || action.id in this.state.nodes);

        // Save the state and action in the undo queue
        this.addUndo(action);

        // Update the model based on the action
        action.update(this);

        // Broadcast the new state and action
        this.broadcast(this.state, action);
    }

    // Add an action to the undo queue
    addUndo(action)
    {
        if (this.undoQueue.length > 0)
        {
            let prev = this.undoQueue[this.undoQueue.length-1];
            let combined = action.combine(prev.action);

            // If this action can be combined with the previous
            if (combined)
            {
                this.undoQueue.pop();
                this.undoQueue.push({
                    action: combined,
                    state: prev.state
                });

                return;
            }
        }

        // Store a copy of the state for undo
        this.undoQueue.push({
            action: action,
            state: treeCopy(this.state)
        });
    }

    // Undo the last action performed
    undo()
    {
        if (this.undoQueue.length == 0)
            return;

        let prev = this.undoQueue.pop()

        // Restore the old state
        this.state = prev.state;

        // Broadcast the state update
        this.broadcast(this.state, null);
    }
}
