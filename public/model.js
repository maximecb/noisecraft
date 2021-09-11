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
*/

import { assert, isPosInt, treeCopy, treeEq, isString, isObject } from './utils.js';
import * as music from './music.js';

// Maximum number of undo steps we support
const MAX_UNDO_STEPS = 400;

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
        unique: true,
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
            { name: 'minVal', default: 60 },
            { name: 'maxVal', default: 240 },
            { name: 'value', default: 120 },
            { name: 'deviceId', default: null },
            { name: 'controlNo', default: null },
        ],
        description: 'MIDI clock signal source with tempo in BPM',
    },

    'Const': {
        ins: [],
        outs: [''],
        params: [
            { name: 'value', default: 0 },
        ],
        state: [],
        description: 'editable constant value',
    },

    'Delay': {
        ins: [
            { name: 'in', default: 0 },
            { name: 'time', default: 0 }
        ],
        outs: ['out'],
        params: [],
        state: [],
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
        state: [],
    },

    // Used during compilation, writes to a delay line
    'delay_write': {
        internal: true,
        ins: [
            { name: 'in', default: 0 },
        ],
        outs: [],
        params: [],
        state: [],
    },

    'Distort': {
        ins: [
            { name: 'in', default: 0 },
            { name: 'amt', default: 0 }
        ],
        outs: ['out'],
        params: [],
        state: [],
        description: 'overdrive-style distortion',
    },

    'Div': {
        ins: [
            { name: 'in0', default: 0 },
            { name: 'in1', default: 1 }
        ],
        outs: ['out'],
        params: [],
        state: [],
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
        state: [],
        description: 'classic two-pole low-pass filter',
    },

    'Knob': {
        ins: [],
        outs: [''],
        params: [
            { name: 'minVal', default: 0 },
            { name: 'maxVal', default: 1 },
            { name: 'value', default: 0 },
            { name: 'deviceId', default: null },
            { name: 'controlNo', default: null },
        ],
        state: [],
        description: 'parameter control knob',
    },

    'MidiIn': {
        ins: [],
        outs: ['freq', 'gate'],
        params: [],
        state: [],
        description: 'MIDI note input (cv/gate)',
    },

    'MonoSeq': {
        ins: [
            { name: 'clock', default: 0 },
        ],
        outs: ['freq', 'gate'],
        params: [],
        state: ['scaleName', 'scaleRoot', 'numOctaves', 'patterns', 'curPattern'],
        description: 'monophonic step sequencer',
    },

    'Mul': {
        ins: [
            { name: 'in0', default: 1 },
            { name: 'in1', default: 1 }
        ],
        outs: ['out'],
        params: [],
        state: [],
        description: 'multiply input waveforms',
    },

    'Noise': {
        ins: [],
        outs: ['out'],
        params: [],
        state: [],
        description: 'white noise source',
    },

    'Notes': {
        unique: true,
        ins: [],
        outs: [],
        params: [
            { name: 'text', default: '' },
        ],
        state: [],
        description: 'text notes',
    },

    'Pulse': {
        ins: [
            { name: 'freq', default: 0 },
            { name: 'pw', default: 0.5 }
        ],
        outs: ['out'],
        params: [],
        state: [],
        description: 'pulse/square oscillator',
    },

    'Saw': {
        ins: [
            { name: 'freq', default: 0 }
        ],
        outs: ['out'],
        params: [],
        state: [],
        description: 'sawtooth oscillator',
    },

    'Scope': {
        ins: [
            { name: '', default: 0 }
        ],
        outs: [],
        params: [
            { name: 'minVal', default: -1 },
            { name: 'maxVal', default: 1 },
        ],
        state: [],
        description: 'scope to plot incoming signals',
        sendRate: 20,
        sendSize: 5,
        historyLen: 150,
    },

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
        state: [],
        description: 'sine wave oscillator',
    },

    'Slide': {
        ins: [
            { name: 'in', default: 0 },
            { name: 'rate', default: 1 },
        ],
        outs: ['out'],
        params: [],
        state: [],
        description: 'simple slew-rate limiter using a running average',
    },

    'Sub': {
        ins: [
            { name: 'in0', default: 0 },
            { name: 'in1', default: 0 }
        ],
        outs: ['out'],
        params: [],
        state: [],
        description: 'subtract input waveforms',
    },

    'Tri': {
        ins: [
            { name: 'freq', default: 0 }
        ],
        outs: ['out'],
        params: [],
        state: [],
        description: 'triangle wave oscillator',
    },

    'Module': {
        // Marked internal because you can't create a module
        // from the node creation menu
        internal: true,
        ins: [],
        outs: [],
        params: [],
        state: [],
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
 * Set the project title
 */
export class SetTitle extends Action
{
    constructor(title)
    {
        super();
        this.title = title;
    }

    update(model)
    {
        model.state.title = this.title;
    }
}

/**
 * Initialize a new blank pattern for a sequencer node
 */
function initPattern(node, patIdx)
{
    // If the pattern already exists, stop
    if (node.patterns[patIdx])
        return;

    let scaleNotes = music.genScale(node.scaleRoot, node.scaleName, node.numOctaves);
    let numRows = scaleNotes.length;

    // Initialize an empty pattern
    let numSteps = 16;
    let grid = new Array(numSteps);

    for (let step = 0; step < grid.length; ++step)
    {
        grid[step] = new Array(numRows);
        grid[step].fill(0);
    }

    node.patterns[patIdx] = grid;
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

        // If this is a sequencer node
        if (this.nodeType == 'MonoSeq')
        {
            // Set the default scale
            node.scaleName = 'minor pentatonic';
            node.scaleRoot = 'C2';
            node.numOctaves = 1;

            // Currently active pattern
            node.curPattern = 0;

            // Initialize an empty pattern
            node.patterns = [];
            initPattern(node, 0);
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
 * Pastes one or more nodes
 *
 * Data is expected to be given serialized. The constructor will throw an
 * exception if it is not pastable, or if the paste would have no effect on the
 * model.
 */
export class Paste extends Action
{
    constructor(data, position)
    {
        super();

        this.nodesData = JSON.parse(data);
        assert (this.nodesData instanceof Object);
        assert (Object.keys(this.nodesData).length);

        for (let nodeId in this.nodesData)
        {
            assert (/^\d+$/.test(nodeId));

            let nodeData = this.nodesData[nodeId];
            assert (nodeData instanceof Object);
            assert (typeof nodeData.name === 'string');
            assert (typeof nodeData.x === 'number');
            assert (typeof nodeData.y === 'number');

            let schema = NODE_SCHEMA[nodeData.type];
            assert (schema instanceof Object);
            assert (nodeData.ins instanceof Array);
            assert (nodeData.ins.length === schema.ins.length);
            assert (nodeData.params instanceof Object);
        }

        this.position = position;
        assert (typeof this.position.x == 'number');
        assert (typeof this.position.y == 'number');
    }

    update(model)
    {
        let nodeIdMap = {};

        // Don't paste unique nodes if an instance already
        // Exists in this project
        for (let nodeId in this.nodesData)
        {
            let node = this.nodesData[nodeId];
            let schema = NODE_SCHEMA[node.type];
            if (schema.unique && model.hasNode(node.type))
                delete this.nodesData[nodeId];
        }

        // Before adding any nodes, determine their final offsets.
        let offset = { x: Infinity, y: Infinity };
        for (let nodeId in this.nodesData)
        {
            let nodeData = this.nodesData[nodeId];

            offset.x = Math.min(nodeData.x, offset.x);
            offset.y = Math.min(nodeData.y, offset.y);
        }

        assert (offset.x !== Infinity && offset.y !== Infinity);

        offset.x = this.position.x - offset.x;
        offset.y = this.position.y - offset.y;

        // Start by adding the pasted nodes without port connections.
        for (let nodeId in this.nodesData)
        {
            let nodeData = this.nodesData[nodeId];
            let schema = NODE_SCHEMA[nodeData.type];

            let node = treeCopy(nodeData);
            node.x = nodeData.x + offset.x;
            node.y = nodeData.y + offset.y;

            // Keep param values that are aligned with the schema. They must be
            // null or match the schema's default value type, otherwise the
            // default value will be assigned.
            for (let param of schema.params)
            {
                let value = nodeData.params[param.name];

                if (value !== null && typeof value !== typeof param.default)
                    value = param.default;

                node.params[param.name] = value;
            }

            // Add the node and track the new ID.
            let mappedNodeId = model.getFreeId();
            nodeIdMap[nodeId] = mappedNodeId;
            model.state.nodes[mappedNodeId] = node;
        }

        // Now that all the nodes have mapped IDs, fill in the port connections.
        for (let nodeId in this.nodesData)
        {
            let mappedNodeId = nodeIdMap[nodeId];
            let node = model.state.nodes[mappedNodeId];

            node.ins = this.nodesData[nodeId].ins.map(input => {
                if (!(input instanceof Array) || input.length != 2)
                    return null;

                let [inputNodeId, inputPortId] = input;
                if (inputNodeId in nodeIdMap)
                    return [nodeIdMap[inputNodeId], inputPortId];

                return null;
            });
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
        if (this.name.length == 0)
            throw TypeError('node name cannot be empty');

        let node = model.state.nodes[this.nodeId];
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

        // Can't group nodes that must remain unique
        this.nodeIds = this.nodeIds.filter(function (nodeId)
        {
            let node = model.state.nodes[nodeId];
            let schema = NODE_SCHEMA[node.type];
            return !schema.unique;
        });

        // Add the nodes to the module and remove them from the global graph
        for (let nodeId of this.nodeIds)
        {
            let node = model.state.nodes[nodeId];
            module.nodes[nodeId] = node;
            delete model.state.nodes[nodeId];
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
        model.playing = true;
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
        model.playing = false;
        resetState(model.state);
    }

    get undoable()
    {
        return false;
    }
}

/**
 * Toggle the value of a grid cell for a sequencer
 */
export class ToggleCell extends Action
{
    constructor(nodeId, patIdx, stepIdx, rowIdx)
    {
        super();
        this.nodeId = nodeId;
        this.patIdx = patIdx;
        this.stepIdx = stepIdx;
        this.rowIdx = rowIdx;
    }

    update(model)
    {
        let node = model.state.nodes[this.nodeId];
        assert (node.type == 'MonoSeq');
        let grid = node.patterns[this.patIdx];
        assert (grid instanceof Array);
        assert (this.stepIdx < grid.length);
        let numRows = grid[this.stepIdx].length;
        assert (this.rowIdx < numRows);

        // Get the current value of this cell
        let curVal = grid[this.stepIdx][this.rowIdx];
        let newVal = curVal? 0:1;

        // Zero-out all other cells at this step
        for (let i = 0; i < numRows; ++i)
            grid[this.stepIdx][i] = 0;

        grid[this.stepIdx][this.rowIdx] = newVal;

        // Tag the new value on the action to make
        // view updates easier
        this.value = newVal;
    }
}

/**
 * Set the current step to be highlighted in a sequencer
 */
export class SetCurStep extends Action
{
    constructor(nodeId, stepIdx)
    {
        super();
        this.nodeId = nodeId;
        this.stepIdx = stepIdx;
    }

    update(model)
    {
        // The pattern may have shrunk since the audio
        // thread sent this message
        let node = model.state.nodes[this.nodeId];
        let grid = node.patterns[node.curPattern];
        this.stepIdx = this.stepIdx % grid.length;
    }

    get undoable()
    {
        return false;
    }
}

/**
 * Queue the next pattern to play for a sequencer.
 */
export class QueuePattern extends Action
{
    constructor(nodeId, patIdx)
    {
        super();
        this.nodeId = nodeId;
        this.patIdx = patIdx;
    }

    update(model)
    {
        // Initialize the pattern if it doesn't already exist
        let node = model.state.nodes[this.nodeId];
        initPattern(node, this.patIdx);
    }

    get undoable()
    {
        return false;
    }
}

/**
 * Transpose the scale of a sequencer
 */
export class SetScale extends Action
{
    constructor(nodeId, scaleRoot, scaleName, numOctaves)
    {
        super();
        this.nodeId = nodeId;
        this.scaleRoot = scaleRoot;
        this.scaleName = scaleName;
        this.numOctaves = numOctaves;
    }

    update(model)
    {
        let node = model.state.nodes[this.nodeId];

        let oldScale = music.genScale(
            node.scaleRoot,
            node.scaleName,
            node.numOctaves
        );

        let newScale = music.genScale(
            this.scaleRoot,
            this.scaleName,
            this.numOctaves
        );

        // Compute the old and new number of scale degrees
        //var oldDegs = Math.floor(oldScale.length / node.numOctaves);
        //var newDegs = Math.floor(newScale.length / this.numOctaves);
        let oldDegs = (oldScale.length - 1) / node.numOctaves;
        let newDegs = (newScale.length - 1) / this.numOctaves;
        assert (isPosInt(oldDegs));
        assert (isPosInt(newDegs));

        // Tranpose each pattern
        for (let patIdx = 0; patIdx < node.patterns.length; ++patIdx)
        {
            let oldGrid = node.patterns[patIdx];

            // Grid to transpose the pattern into
            let newGrid = new Array(oldGrid.length);
            for (let step = 0; step < newGrid.length; ++step)
            {
                newGrid[step] = new Array(newScale.length);
                newGrid[step].fill(0);
            }

            // For each step
            for (let step = 0; step < oldGrid.length; ++step)
            {
                // For each row
                for (let row = 0; row < oldGrid[step].length; ++row)
                {
                    if (!oldGrid[step][row])
                        continue;

                    var oct = Math.floor(row / oldDegs);
                    var deg = row % oldDegs;

                    if (deg >= newDegs)
                        continue;

                    var newIdx = oct * newDegs + deg;

                    if (newIdx >= newGrid[step].length)
                        continue;

                    newGrid[step][newIdx] = 1;
                }
            }

            node.patterns[patIdx] = newGrid;
        }

        // Update the scale parameters
        node.scaleRoot = this.scaleRoot;
        node.scaleName = this.scaleName;
        node.numOctaves = this.numOctaves;
    }
}

/**
 * Immediately set the currently playing pattern in a sequencer
 * Note that the editor never sends this action, it sends QueuePattern.
 */
export class SetPattern extends Action
{
    constructor(nodeId, patIdx)
    {
        super();
        this.nodeId = nodeId;
        this.patIdx = patIdx;
    }

    update(model)
    {
        // Initialize the pattern if it doesn't already exist
        let node = model.state.nodes[this.nodeId];
        initPattern(node, this.patIdx);

        // Set the currently active pattern
        node.curPattern = this.patIdx;
    }

    get undoable()
    {
        return false;
    }
}

/**
 * Extend the current sequencer pattern
 */
export class ExtendPattern extends Action
{
    constructor(nodeId, numSteps)
    {
        if (numSteps === undefined)
            numSteps = 16;

        super();
        this.nodeId = nodeId;
        this.numSteps = numSteps;
    }

    update(model)
    {
        let node = model.state.nodes[this.nodeId];
        let grid = node.patterns[node.curPattern];

        let scaleNotes = music.genScale(node.scaleRoot, node.scaleName, node.numOctaves);
        let numRows = scaleNotes.length;

        for (let stepIdx = 0; stepIdx < this.numSteps; ++stepIdx)
        {
            let newStep = new Array(numRows);
            newStep.fill(0);
            grid.push(newStep);
        }
    }
}

/**
 * Extend the current sequencer pattern by copying previous steps
 */
export class ExtendCopy extends Action
{
    constructor(nodeId, numSteps)
    {
        if (numSteps === undefined)
            numSteps = 16;

        super();
        this.nodeId = nodeId;
        this.numSteps = numSteps;
    }

    update(model)
    {
        let node = model.state.nodes[this.nodeId];
        let grid = node.patterns[node.curPattern];
        assert (this.numSteps <= grid.length);
        let fromIdx = grid.length - this.numSteps;

        for (let stepIdx = 0; stepIdx < this.numSteps; ++stepIdx)
        {
            let prevStep = grid[fromIdx + stepIdx]
            let newStep = prevStep.slice();
            grid.push(newStep);
        }
    }
}

/**
 * Shrink the current sequencer pattern
 */
export class ShrinkPattern extends Action
{
    constructor(nodeId, numSteps)
    {
        if (numSteps === undefined)
            numSteps = 16;

        super();
        this.nodeId = nodeId;
        this.numSteps = numSteps;
    }

    update(model)
    {
        let node = model.state.nodes[this.nodeId];
        let grid = node.patterns[node.curPattern];
        assert (grid);

        assert (this.numSteps < grid.length);
        grid.length -= this.numSteps;
    }
}

/**
 * Send audio samples from the audio thread to the model
 */
export class SendSamples extends Action
{
    constructor(nodeId, samples)
    {
        super();
        this.nodeId = nodeId;
        this.samples = samples;
    }

    update(model)
    {
        let node = model.state.nodes[this.nodeId];

        // If no samples are stored on this node, initialize the array
        if (!node.samples)
        {
            node.samples = Array(NODE_SCHEMA.Scope.historyLen).fill(0);
        }

        // Remove samples from the front, add new samples at the end
        let numStored = node.samples.length
        assert (this.samples.length < numStored);
        node.samples = node.samples.slice(this.samples.length).concat(this.samples);
        assert (node.samples.length == numStored);
    }

    get undoable()
    {
        return false;
    }
}

/**
 * Remove non-persistent state variables from the model's state
 */
function resetState(state)
{
    // Properties found on every node
    let nodeProps = new Set([
        'type',
        'name',
        'x',
        'y',
        'ins',
        'params'
    ]);

    for (let id in state.nodes)
    {
        let node = state.nodes[id];
        let keys = Object.keys(node);
        let schema = NODE_SCHEMA[node.type];
        let stateVars = new Set(schema.state);

        for (let key of keys)
        {
            if (!nodeProps.has(key) && !stateVars.has(key))
            {
                console.log('deleting', node.type, key);
                delete node[key];
            }
        }
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

        // Initialize missing params to default values
        // This is for backwards compatibility with older projects
        for (let id in state.nodes)
        {
            let node = state.nodes[id];
            let keys = Object.keys(node);
            let schema = NODE_SCHEMA[node.type];
            for (let param of schema.params)
            {
                if (!(param.name in node.params))
                {
                    console.log(param.name)
                    node.params[param.name] = param.default;
                }
            }
        }

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

        // Store the new state
        this.state = state;

        // Flag indicating if we're playing audio or not
        this.playing = false;

        // Broadcast state update
        this.broadcast(this.state, null);
    }

    // Serializes the model into a string representation
    serialize()
    {
        // TODO: eventually, we could add some kind of compression
        // scheme in the serialization

        let state = treeCopy(this.state);
        resetState(state);
        return JSON.stringify(state);
    }

    /**
     * Tries to deserialize a JSON string representation of a model
     * Returns true if successfully deserialized and loaded, false otherwise
     */
    deserialize(data)
    {
        assert(isString(data));
        let json = JSON.parse(data);

        assert (isObject(json));
        this.load(json);
    }

    /**
     * Get the next available nodeId
     */
    getFreeId()
    {
        let nodeId = String(this.nextFreeId++);
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

    // Returns the minimum information required to copy a set of nodes
    copy(nodeIds)
    {
        console.log('copy nodes');

        let result = {};

        if (!nodeIds instanceof Array)
            return result;

        // Start by fully copying node information. This will be the basis of
        // our returned result, and a way to quickly check if a nodeId is in the
        // nodeIds array
        for (let nodeId of nodeIds)
        {
            let node = this.state.nodes[nodeId];
            if (!node instanceof Object)
                continue;

            result[nodeId] = treeCopy(node);
        }

        // Filter port connections. We only retain connections that begin and
        // end within the given nodes
        for (let nodeId of nodeIds)
        {
            let node = result[nodeId];

            node.ins = node.ins.map((input) => {
                // Filter out unexpected values
                if (!(input instanceof Array))
                    return null;

                // Filter out connections outside the copied nodes
                let [inputNodeId] = input;
                if (!result[inputNodeId])
                    return null;

                return input;
            });
        }

        return result;
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
        //console.log('update model', action.constructor.name);

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
        // Limit the maximum undo stack length
        if (this.undoStack.length >= MAX_UNDO_STEPS)
        {
            this.undoStack.shift();
        }

        // If there is a previous undo action
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
