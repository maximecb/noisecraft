import { assert, treeCopy } from './utils.js';
import { NODE_SCHEMA } from './model.js';
import * as music from './music.js';

/**
 * Split delay nodes into two pseudo-nodes to break cycles produces a
 * new graph reusing the same nodes.
 * Note: this function assumes that all nodes inside modules have been
 * inlined, and there are no modules in the input.
 */
function splitDelays(graph)
{
    // Copy the graph before modifying it
    graph = treeCopy(graph);

    // Find max node id used in the graph
    let maxId = 0;
    for (let nodeId in graph.nodes)
    {
        maxId = Math.max(maxId, nodeId);
    }

    // Mapping of ids of delay nodes that were split
    // to the new read and write nodes
    let splitMap = {};

    // For each node
    for (let nodeId in graph.nodes)
    {
        let node = graph.nodes[nodeId];

        if (node.type != 'Delay')
            continue;

        // delay_write writes a value, produces no output
        let writeNode = {...node};
        writeNode.type = 'delay_write';
        writeNode.delayNode = node;
        writeNode.delayId = nodeId;
        writeNode.ins = [node.ins[0]]
        let writeNodeId = String(++maxId);
        graph.nodes[writeNodeId] = writeNode;

        // delay_read takes a delay time as input, produces an output signal
        // It does not take the signal as input
        let readNode = {...node};
        readNode.type = 'delay_read';
        readNode.delayId = nodeId;
        readNode.ins = [node.ins[1]]
        let readNodeId = String(++maxId);
        graph.nodes[readNodeId] = readNode;

        // Keep track of split delays
        splitMap[nodeId] = { readId: readNodeId, writeId: writeNodeId };

        // Remove the original delay node
        delete graph.nodes[nodeId];
    }

    // Fixup the node connections to/from delays
    for (let nodeId in graph.nodes)
    {
        let node = graph.nodes[nodeId];

        // For all input side ports
        for (var i = 0; i < node.ins.length; ++i)
        {
            if (!node.ins[i])
                continue;

            let [srcId, srcPort] = node.ins[i];

            if (srcId in splitMap)
            {
                node.ins[i] = [splitMap[srcId].readId, 0];
            }
        }
    }

    return graph;
}

/**
 * Topologically sort the nodes in a graph (Kahn's algorithm)
 * Note: this function assumes that all nodes inside modules have been
 * inlined, and there are no modules in the input.
 */
function topoSort(graph)
{
    // Count the number of input edges going into a node
    function countInEdges(nodeId)
    {
        let node = graph.nodes[nodeId];
        let numIns = 0;

        for (let i = 0; i < node.ins.length; ++i)
        {
            let edge = node.ins[i];

            if (!edge)
                continue;

            if (remEdges.has(edge))
                continue;

            numIns++;
        }

        return numIns;
    }

    // Set of nodes with no incoming edges
    let S = [];

    // List sorted in reverse topological order
    let L = [];

    // Map of input-side edges removed from the graph
    let remEdges = new WeakSet();

    // Map of each node to a list of outgoing edges
    let outEdges = new Map();

    // Populate the initial list of nodes without input edges
    for (let nodeId in graph.nodes)
    {
        if (countInEdges(nodeId) == 0)
        {
            S.push(nodeId);
        }
    }

    // Initialize the set of list of output edges for each node
    for (let nodeId in graph.nodes)
    {
        outEdges.set(nodeId, []);
    }

    // Populate the list of output edges for each node
    for (let nodeId in graph.nodes)
    {
        let node = graph.nodes[nodeId];

        // For each input of this node
        for (let i = 0; i < node.ins.length; ++i)
        {
            let edge = node.ins[i];

            if (!edge)
                continue;

            let [srcId, srcPort] = node.ins[i];
            let srcOuts = outEdges.get(srcId);
            srcOuts.push([nodeId, edge]);
        }
    }

    // While we have nodes with no inputs
    while (S.length > 0)
    {
        // Remove a node from S, add to tail of L
        var nodeId = S.pop();
        L.push(nodeId);

        // Get the list of output edges for this node
        let nodeOuts = outEdges.get(nodeId);

        // For each outgoing edge
        for (let [dstId, edge] of nodeOuts)
        {
            // Mark the edge as removed
            remEdges.add(edge);

            // If the node has no more incoming edges
            if (countInEdges(dstId) == 0)
                S.push(dstId);
        }
    }

    return L;
}

/**
 * Compile a sound-generating function from a graph of nodes
 */
export function compile(graph)
{
    function outName(nodeId, idx)
    {
        assert (typeof nodeId == 'number' || typeof nodeId == 'string');
        return 'n' + nodeId + '_' + idx;
    }

    function inVal(node, idx)
    {
        let schema = NODE_SCHEMA[node.type];
        let defVal = schema.ins[idx].default;

        if (!node.ins[idx])
            return defVal;

        let [srcId, portIdx] = node.ins[idx];
        let srcNode = graph.nodes[srcId];
        return outName(srcId, portIdx);
    }

    function addLine(str)
    {
        if (src)
            src += '\n';
        src += '    ' + str;
    }

    function addLet(name, str)
    {
        addLine('let ' + name + ' = ' + str);
    }

    function addDef(nodeId, str)
    {
        addLet(outName(nodeId, 0), str);
    }

    function addObj(prefix, obj)
    {
        if (typeof obj != 'object')
            throw 'addObj failed, not an object';

        let idx = Object.keys(lib.objs).length;
        let name = 'lib.objs.' + prefix + idx;
        lib.objs[prefix + idx] = obj;
        return name;
    }

    // Split delay nodes
    graph = splitDelays(graph);

    // Produce a topological sort of the graph
    let order = topoSort(graph);
    console.log('num nodes in topo order: ', order.length);

    /*
    for (let node of order)
    {
        console.log(node.type, node.id);
    }
    console.log();
    */

    // Find the audio output node
    let audioOutId = null;

    for (let nodeId of order)
    {
        let node = graph.nodes[nodeId];

        if (node.type == 'AudioOut')
        {
            if (audioOutId !== null)
                throw 'there can be only one AudioOut node';

            audioOutId = nodeId;
        }
    }

    // Generated source code
    let src = '';

    // Set of stateful nodes that are relevant for audio synthesis
    let audioNodes = {};

    for (let nodeId of order)
    {
        let node = graph.nodes[nodeId];

        console.log(`compiling ${node.type}, nodeId=${nodeId}`);

        if (node.type == 'Add')
        {
            addDef(nodeId, inVal(node, 0) + ' + ' + inVal(node, 1));
            continue;
        }

        if (node.type == 'ADSR')
        {
            audioNodes[nodeId] = node;

            addDef(
                nodeId,
                `nodes[${nodeId}].update(` +
                `time,` +
                `${inVal(node, 0)},` +
                `${inVal(node, 1)},` +
                `${inVal(node, 2)},` +
                `${inVal(node, 3)},` +
                `${inVal(node, 4)})`
            );

            continue;
        }

        if (node.type == 'AudioOut')
        {
            // Multiply by 0.5 to manage loudness and help avoid clipping
            addLet(outName(nodeId, 0), '0.3 * ' + inVal(node, 0));
            addLet(outName(nodeId, 1), '0.3 * ' + inVal(node, 1));
            continue;
        }

        if (node.type == 'Clock')
        {
            audioNodes[nodeId] = node;
            addDef(nodeId, `nodes[${nodeId}].update()`);
            continue;
        }


        if (node.type == 'ClockDiv')
        {
            audioNodes[nodeId] = node;
            addDef(nodeId, `nodes[${nodeId}].update(${inVal(node, 0)})`);
            continue;
        }

        if (node.type == 'Const')
        {
            audioNodes[nodeId] = node;
            addDef(nodeId, `nodes[${nodeId}].params.value`);
            continue;
        }

        if (node.type == 'delay_write')
        {
            audioNodes[node.delayId] = node.delayNode;
            addLine(`nodes[${node.delayId}].delay.write(${inVal(node, 0)})`);
            continue;
        }

        if (node.type == 'delay_read')
        {
            addDef(
                nodeId,
                `nodes[${node.delayId}].delay.read(${inVal(node, 0)})`
            );

            continue;
        }

        if (node.type == 'Distort')
        {
            audioNodes[nodeId] = node;
            addDef(nodeId, `nodes[${nodeId}].update(${inVal(node, 0)}, ${inVal(node, 1)})`);
            continue;
        }

        if (node.type == 'Div')
        {
            // Avoid dividing by zero because that can lead to NaN values being produced
            addDef(nodeId, inVal(node, 1) + '? (' + inVal(node, 0) + ' / ' + inVal(node, 1) + '):0');
            continue;
        }

        if (node.type == 'Filter')
        {
            audioNodes[nodeId] = node;
            addDef(
                nodeId,
                `nodes[${nodeId}].update(${inVal(node, 0)}, ${inVal(node, 1)}, ${inVal(node, 2)})`
            );
            continue;
        }

        if (node.type == 'Knob')
        {
            audioNodes[nodeId] = node;
            addDef(nodeId, `nodes[${nodeId}].params.value`);
            continue;
        }

        if (node.type == 'MidiIn')
        {
            audioNodes[nodeId] = node;

            addLine(
                `let [${outName(nodeId, 0)}, ${outName(nodeId, 1)}] = ` +
                `nodes[${nodeId}].update()`
            );

            continue;
        }

        if (node.type == 'MonoSeq')
        {
            audioNodes[nodeId] = node;

            addLine(
                `let [${outName(nodeId, 0)}, ${outName(nodeId, 1)}] = ` +
                `nodes[${nodeId}].update(time, ${inVal(node, 0)})`
            );

            continue;
        }

        // Temporary so the compiler doesn't error when it sees a module
        if (node.type == 'Module')
        {
            continue;
        }

        if (node.type == 'Mul')
        {
            addDef(nodeId, inVal(node, 0) + ' * ' + inVal(node, 1));
            continue;
        }

        if (node.type == 'Noise')
        {
            // Produce a random value in [-1, 1]
            addDef(nodeId, '2 * Math.random() - 1');
            continue;
        }

        if (node.type == 'Notes')
        {
            continue;
        }

        if (node.type == 'Pulse')
        {
            audioNodes[nodeId] = node;
            addDef(nodeId, `nodes[${nodeId}].update(${inVal(node, 0)}, ${inVal(node, 1)})`);
            continue;
        }

        if (node.type == 'Saw')
        {
            audioNodes[nodeId] = node;
            addDef(nodeId, `nodes[${nodeId}].update(${inVal(node, 0)})`);
            continue;
        }

        if (node.type == 'Scope')
        {
            audioNodes[nodeId] = node;
            addDef(nodeId, `nodes[${nodeId}].update(${inVal(node, 0)})`);
            continue;
        }

        if (node.type == 'Sine')
        {
            audioNodes[nodeId] = node;
            addDef(nodeId, `nodes[${nodeId}].update(${inVal(node, 0)}, ${inVal(node, 1)})`);
            continue;
        }

        if (node.type == 'Slide')
        {
            audioNodes[nodeId] = node;
            addDef(nodeId, `nodes[${nodeId}].update(${inVal(node, 0)}, ${inVal(node, 1)})`);
            continue;
        }

        if (node.type == 'Sub')
        {
            addDef(nodeId, inVal(node, 0) + ' - ' + inVal(node, 1));
            continue;
        }

        if (node.type == 'Tri')
        {
            audioNodes[nodeId] = node;
            addDef(nodeId, `nodes[${nodeId}].update(${inVal(node, 0)})`);
            continue;
        }

        throw 'unknown node type "' + node.type + '"';
    }

    // Return the audio output values
    if (audioOutId != null)
    {
        addLine('return [' + outName(audioOutId, 0) + ', ' + outName(audioOutId, 1) + ']');
    }
    else
    {
        addLine('return [0, 0]');
    }

    console.log(src);

    // This will be assembled into an audio processing graph
    // by the audio thread (audioworklet.js)
    return {
        // Compiled source code of the genSample function
        src: src,

        // Set of nodes that are relevant for audio processing,
        // indexed by nodeId
        nodes: audioNodes
    };
}
