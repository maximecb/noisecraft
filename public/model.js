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
  - pairs of (node_id, out_port_idx), no property if no connection
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
ungroup_module <node_id>

// Sent by the play/stop buttons (but not undo-able)
play
stop

// Sent by the audio thread so the UI can reflect playback position
set_play_pos <time>

// Actions to edit the settings/parameters of nodes
set_node_name <node_id> <name>
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

import { assert, treeCopy, treeEq, isString, isObject } from './utils.js';

/**
 * High-level description/schema for each type of node
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

    /*
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
    */

    'AudioOut': {
        ins: [
            { name: 'left', default: 0 },
            { name: 'right', default: 0 }
        ],
        outs: [],
        params: [],
        description: 'stereo sound output',
    },

    /*
    'Clock': {
        ins: [],
        outs: [''],
        params: [
            { name: 'minVal', default: 60 },
            { name: 'maxVal', default: 240 },
            { name: 'value', default: 120 },
            { name: 'controlNo', default: null },
        ],
        description: 'MIDI clock signal source with tempo in BPM',
    },
    */

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
        description: 'classic two-pole low-pass filter',
    },

    'Knob': {
        ins: [],
        outs: [''],
        params: [
            { name: 'minVal', default: 0 },
            { name: 'maxVal', default: 1 },
            { name: 'value', default: 0 },
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

    'MonoSeq': {
        ins: [
            { name: 'clock', default: 0 },
        ],
        outs: ['freq', 'gate'],
        params: [],
        description: 'monophonic step sequencer',
    },

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

    /*
    'Notes': {
        ins: [],
        outs: [],
        params: [],
        description: 'text notes',
    },
    */

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

    // TODO: we probably want to change the implementation
    // so rate values between 0 and 1 make more useful sense.
    /*
    'Slide': {
        ins: [
            { name: 'in', default: 0 },
            { name: 'rate', default: 1 },
        ],
        outs: ['out'],
        params: [],
        description: 'simple slew-rate limiter using a running average',
    },
    */

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
        description: 'triangle wave oscillator',
    },

    'Module': {
        // Marked internal because you can't create a module
        // from the node creation menu
        internal: true,
        ins: [],
        outs: [],
        params: [],
        description: 'user-created module (node grouping)',
    },
};

/**
 * Base class for all model update actions.
 * As a general rule, we only create actions for things we can undo.
 * Moving nodes is an action, but selecting or copying nodes is not.
 */
export class Action
{
    // Test if this action can be combined with the previous
    // This is used to simplify the undo queue
    combinable(prev)
    {
        // Action can't be combined
        return false;
    }

    // Update the model based on this action
    update(model)
    {
        throw TypeError("unimplemented");
    }

    // By default, actions can be undone
    get undoable()
    {
        return true;
    }
}

/**
 * Create a new node
 */
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
        let schema = NODE_SCHEMA[this.nodeType];

        let node = {
            type: this.nodeType,
            name: this.nodeType,
            x: this.x,
            y: this.y,
            ins: Array(schema.ins.length).fill(null),
            params: {},
        };

        // Initialize node parameters to default values
        for (let param of schema.params)
        {
            node.params[param.name] = param.default;
        }

        // Add the node to the state
        let nodeId = model.getFreeId();
        model.state.nodes[nodeId] = node;
    }
}

/**
 * Move one or more nodes
 */
export class MoveNodes extends Action
{
    constructor(nodeIds, dx, dy)
    {
        super();
        this.nodeIds = nodeIds;
        this.dx = dx;
        this.dy = dy;
    }

    combinable(prev)
    {
        if (this.prototype != prev.prototype)
            return false;

        if (!treeEq(this.nodeIds, prev.nodeIds))
            return false;

        return true;
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

/**
 * Delete one or more nodes
 */
export class DeleteNodes extends Action
{
    constructor(nodeIds)
    {
        super();
        assert (nodeIds instanceof Array);
        this.nodeIds = nodeIds;
    }

    update(model)
    {
        console.log('deleting nodes', this.nodeIds);

        // For each node to be deleted
        for (let nodeId of this.nodeIds)
        {
            assert (nodeId in model.state.nodes);
            delete model.state.nodes[nodeId];
        }

        // For each node in the model
        for (let nodeId in model.state.nodes)
        {
            let nodeState = model.state.nodes[nodeId];

            // For each input-side port
            for (let dstPort = 0; dstPort < nodeState.ins.length; ++dstPort)
            {
                if (!nodeState.ins[dstPort])
                    continue;

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

/**
 * Set a node parameter to a given value
 */
export class SetNodeName extends Action
{
    constructor(nodeId, name)
    {
        super();
        this.nodeId = nodeId;
        this.name = name;
    }

    update(model)
    {
        let node = model.state.nodes[this.nodeId];
        assert (this.name.length > 0);
        node.name = this.name;
    }
}

/**
 * Set a node parameter to a given value
 */
export class SetParam extends Action
{
    constructor(nodeId, paramName, value)
    {
        super();
        this.nodeId = nodeId;
        this.paramName = paramName;
        this.value = value;
    }

    combinable(prev)
    {
        if (this.prototype != prev.prototype)
            return false;

        if (this.nodeId != prev.nodeId)
            return false;

        if (this.paramName != prev.paramName)
            return false;

        if (this.paramName != "value")
            return false;

        return true;
    }

    update(model)
    {
        let node = model.state.nodes[this.nodeId];
        assert (this.paramName in node.params);

        switch (this.paramName)
        {
            case "minVal":
            case "maxVal":
            case "value":
            assert (typeof this.value == "number");

            default:
            break;
        }

        node.params[this.paramName] = this.value;
    }
}

/**
 * Connect two nodes with an edge
 */
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

        // An input port can only have one incoming connection
        dstNode.ins[this.dstPort] = [this.srcId, this.srcPort];
    }
}

/**
 * Remove the connection attached to an input port
 */
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
        dstNode.ins[this.dstPort] = null;
    }
}

/**
 * Group the selected nodes into a user-created module
 * Currently, the way this works is that the selected nodes will become
 * a black box with inputs and outputs corresponding to the nodes/ports it's
 * connected to outside the group. Eventually, we will also make it possible
 * to rename module input and output ports after the module is created. We
 * could make it possible to expose specific knobs inside the group on the
 * module's UI.
 */
export class GroupNodes extends Action
{
    constructor(nodeIds)
    {
        super();
        this.nodeIds = nodeIds;
    }

    update(model)
    {
        console.log('grouping nodes');

        // Create a module node
        let module = {
            type: 'Module',
            name: 'Module',
            x: Infinity,
            y: Infinity,
            ins: [],
            params: {},
            nodes: {},
            schema: {
                ins: [],
                outs: [],
                params: [],
                description: 'user-created module'
            },
        };

        // Add the new module node to the state
        let moduleId = model.getFreeId();
        model.state.nodes[moduleId] = module;

        console.log(`moduleId=${moduleId}`);

        // Add the nodes to the module and remove them from the global graph
        for (let nodeId of this.nodeIds)
        {
            let node = model.state.nodes[nodeId];
            module.nodes[nodeId] = node;
            delete model.state.nodes[nodeId];

            console.log(`deleting nodeId=${nodeId}`);
        }

        // Compute the position of the group node
        for (let nodeId of this.nodeIds)
        {
            let node = module.nodes[nodeId];
            module.x = Math.min(module.x, node.x);
            module.y = Math.min(module.y, node.y);
        }

        function findInList(list, tuple)
        {
            for (let idx = 0; idx < list.length; ++idx)
            {
                if (treeEq(list[idx], tuple))
                    return idx;
            }

            return -1;
        }

        // For each node in the module
        for (let nodeId of this.nodeIds)
        {
            let node = module.nodes[nodeId];

            // For each input port
            for (let dstPort in node.ins)
            {
                if (!node.ins[dstPort])
                    continue;

                let srcPort = node.ins[dstPort];
                let [srcNode, portIdx] = srcPort;

                // If this input connection leads to a port outside of the group
                if (srcNode in model.state.nodes)
                {
                    let listIdx = findInList(module.ins, srcPort);

                    // If we aren't tracking this port yet
                    if (listIdx == -1)
                    {
                        listIdx = module.ins.length;
                        module.ins.push(srcPort);
                        module.schema.ins.push({ name: 'in' + listIdx, default: 0 });
                    }

                    // Keep track of the fact that this is an external connection
                    node.ins[dstPort] = listIdx;
                }
            }
        }

        console.log(`num module ins: ${module.ins.length}`);

        // List of output ports (tuples) that are connected to outside nodes
        let outPorts = [];

        // For each node outside the module
        for (let nodeId in model.state.nodes)
        {
            let node = model.state.nodes[nodeId];

            // For each input port
            for (let dstPort in node.ins)
            {
                if (!node.ins[dstPort])
                    continue;

                let srcPort = node.ins[dstPort];
                let [srcNode, portIdx] = srcPort;

                // If this input connection leads to a port inside of the group
                if (srcNode in module.nodes)
                {
                    let listIdx = findInList(outPorts, srcPort);

                    // If we aren't tracking this port yet
                    if (listIdx == -1)
                    {
                        listIdx = outPorts.length;
                        outPorts.push(srcPort);
                        module.schema.outs.push('out' + listIdx);
                    }

                    // Keep track of the fact that this is an external connection
                    node.ins[dstPort] = [String(moduleId), listIdx];
                }
            }
        }

        console.log(`num module outs: ${module.schema.outs.length}`);
    }
}

/**
 * Start playbacks
 */
export class Play extends Action
{
    constructor()
    {
        super();
    }

    update(model)
    {
    }

    get undoable()
    {
        return false;
    }
}

/**
 * Stop playback
 */
 export class Stop extends Action
 {
    constructor()
    {
        super();
    }

    update(model)
    {
    }

    get undoable()
    {
        return false;
    }
}

/**
 * Graph of nodes model, operates on internal state data
 */
export class Model
{
    constructor()
    {
        // List of views subscribed to model updates
        this.views = [];

        // Persistent state
        this.state = null;
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
        assert (state instanceof Object);

        // Recursively find the maximum nodeId in a set of nodes
        function findMaxId(nodes, maxId)
        {
            for (let nodeId in nodes)
            {
                nodeId = Number(nodeId);
                maxId = Math.max(maxId, nodeId);
                let node = nodes[nodeId];
                if (node.type == 'Module')
                    maxId = findMaxId(node.nodes, maxId);
            }

            return maxId;
        }

        // Next unique nodeId to be allocated
        this.nextFreeId = findMaxId(state.nodes, -1) + 1;

        // Last undoable action performed
        this.lastAction = null;

        // Stack of past states and actions tracked for undo
        this.undoStack = [];

        // Stack of actions tracked for redo
        this.redoStack = [];

        // Current playback position
        this.playPos = 0;

        // Store the new state
        this.state = state;

        // Broadcast state update
        this.broadcast(this.state, null);
    }

    // Serializes the model into a string representation
    serialize()
    {
        return JSON.stringify({
            state: this.state
        });
    }

    /**
     * Tries to deserialize a JSON string representation of a model
     * Returns true if successfully deserialized and loaded, false otherwise
     */
    deserialize(data)
    {
        if (!isString(data))
            return false;

        let json;
        try
        {
            json = JSON.parse(data);
        }

        catch (e)
        {
            return false;
        }

        if (!isObject(json) || !isObject(json.state))
            return false;

        this.load(json.state);
        return true;
    }

    /**
     * Get the next available nodeId
     */
    getFreeId()
    {
        let nodeId = this.nextFreeId++;
        assert (!(nodeId in this.state.nodes));
        return nodeId;
    }

    /**
     * Get the current state for a given nodeId
     */
    getNodeState(nodeId)
    {
        assert (nodeId in this.state.nodes);
        return this.state.nodes[nodeId];
    }

    /**
     * Check if the graph contains a specific type of node
     */
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
        console.log('update model', action.constructor.name);

        assert (!('nodeId' in action) || action.nodeId in this.state.nodes);

        // If this action is undoable
        if (action.undoable)
        {
            // Save the state and action for undo
            this.addUndo(action);

            // Clear the redo stack
            this.redoStack = [];
        }

        // Update the model based on the action
        action.update(this);

        // Broadcast the new state and action
        this.broadcast(this.state, action);
    }

    // Add an action to the undo queue
    addUndo(action)
    {
        if (this.undoStack.length > 0 && this.lastAction)
        {
            let prev = this.undoStack[this.undoStack.length-1];
            let combinable = action.combinable(this.lastAction);

            // If this action can be combined with the previous
            if (combinable)
            {
                // Don't store a copy of the current state for undo
                return;
            }
        }

        // Store a copy of the state for undo
        this.undoStack.push(treeCopy(this.state));
        this.lastAction = action;
    }

    // Undo the last action performed
    undo()
    {
        if (this.undoStack.length == 0)
            return;

        // Store the current state in the redo stack
        this.redoStack.push(treeCopy(this.state));

        // Restore the previous model state
        this.state = this.undoStack.pop();
        this.lastAction = null;

        // Broadcast the state update
        this.broadcast(this.state, null);
    }

    // Redo an action that was undone
    redo()
    {
        if (this.redoStack.length == 0)
            return;

        // Store a copy of the current state for undo
        this.undoStack.push(treeCopy(this.state));

        // Restore the redo state
        this.state = this.redoStack.pop();

        // Broadcast the state update
        this.broadcast(this.state, null);
    }
}
