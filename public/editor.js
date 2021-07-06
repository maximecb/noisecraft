import { assert, makeSvg, setSvg, getSvg, getBrightColor } from './utils.js';
import { Dialog } from './dialog.js';
import { NODE_SCHEMA } from './model.js';
import * as model from './model.js';
import { Knob } from './knob.js';

export class Editor
{
    constructor(model)
    {
        // Stateful graph model
        this.model = model;
        model.addView(this);

        // Map of node ids to UI node objects
        this.nodes = new Map();

        // Graph editing tab
        // This is used to scroll and to resize the editor
        this.editorDiv = document.getElementById('editor_div');

        // Div that will contain graph nodes
        this.graphDiv = document.getElementById('graph_div');

        // SVG element to draw edges into
        this.svg = document.getElementById('graph_svg');

        // Text instructing the user on how to create the first node
        this.bgText = document.getElementById('graph_bg_text');

        // Group selection div
        this.selectDiv = null;

        // List of currently selected nodes ids
        // We keep track of this in the editor/GUI because
        // This is not persistent and the audio view doesn't care.
        this.selected = [];

        // List of nodes ids for nodes being dragged
        this.dragNodes = [];

        // Mouse position at the start of a group selection or node movement
        this.startMousePos = null;

        // Last mouse position during node movement
        this.lastMousePos = null;

        // Edge in the process of being connected
        this.edge = null;

        // Mouse down callback
        function mouseDown(evt)
        {
            console.log('mouseDown');

            let mousePos = this.getMousePos(evt);
            this.startMousePos = mousePos;
        }

        // Mouse movement callback
        function mouseMove(evt)
        {
            // Avoids selecting the project title in Chrome
            evt.preventDefault();

            var mousePos = this.getMousePos(evt);

            // If currently moving one or more nodes
            if (this.dragNodes.length > 0)
            {
                this.moveNodes(mousePos);
                return;
            }

            // If currently connecting a port
            if (this.edge)
            {
                this.edge.dragEdge(mousePos);
                return;
            }

            // If a selection is in progress
            if (this.startMousePos)
            {
                this.updateSelect(this.startMousePos, mousePos);
                return;
            }
        }

        // Mouse up callback
        function mouseUp(evt)
        {
            // If we were in the process of selecting nodes
            if (this.selectDiv)
            {
                this.editorDiv.removeChild(this.selectDiv);
                this.selectDiv = null;
            }

            this.startMousePos = null;
        }

        // Mouse click callback
        function mouseClick(evt)
        {
            console.log('mouseClick');

            // If in the process of connecting an edge, and there's a
            // click anywhere that's not another port, cancel the connection
            if (this.edge)
            {
                console.log('abort edge connection');
                this.svg.removeChild(this.edge.line);
                this.edge = null;
                return;
            }

            // This event may get triggered while dragging knob controls
            if (evt.target === this.graphDiv)
            {
                if (this.selected.length > 0)
                {
                    this.deselect();
                }
                else
                {
                    this.createNodeDialog(this.getMousePos(evt));
                    evt.stopPropagation();
                    return;
                }
            }
        }

        this.editorDiv.onmousedown = mouseDown.bind(this);
        this.editorDiv.onmouseup = mouseUp.bind(this);
        this.editorDiv.onclick = mouseClick.bind(this);
        this.editorDiv.onmousemove = mouseMove.bind(this);
        this.editorDiv.ontouchmove = mouseMove.bind(this);

        // If the window is resized, adjust the graph size
        window.onresize = this.resize.bind(this);

        // Initialize the graph size to fill the window
        this.resize();
    }

    // Update the GUI view
    update(newState, action)
    {
        // TODO: we can optimize this method based on the action
        // For example, MoveNodes is trivial to implement without
        // recreating all the nodes.

        // Remove existing nodes and edges
        this.edge = null;
        while (this.graphDiv.firstChild)
            this.graphDiv.removeChild(this.graphDiv.firstChild);
        while (this.svg.firstChild)
            this.svg.removeChild(this.svg.firstChild);
        this.nodes.clear();

        // Show/hide node creation instructions
        let graphEmpty = (Object.keys(newState.nodes).length == 0);
        this.bgText.style.display = graphEmpty? 'block':'none';

        // Create the nodes
        for (let nodeId in newState.nodes)
        {
            let nodeState = newState.nodes[nodeId];
            let nodeClass = (nodeState.type in NODE_CLASSES)? NODE_CLASSES[nodeState.type]:Node;
            let node = new nodeClass(nodeId, nodeState, this);
            this.nodes.set(nodeId, node);
            this.graphDiv.appendChild(node.nodeDiv);
        }

        // For each node
        for (let dstId in newState.nodes)
        {
            let dstState = newState.nodes[dstId];
            let dstNode = this.nodes.get(dstId);

            // For each input-side connection
            for (let dstPort in dstState.ins)
            {
                if (!dstState.ins[dstPort])
                    continue;

                let [srcId, srcPort] = dstState.ins[dstPort];
                assert (typeof srcId == 'string');
                assert (this.nodes.has(srcId));
                let srcNode = this.nodes.get(srcId);

                let [sx, sy] = srcNode.getPortPos(srcPort, 'src');
                let [dx, dy] = dstNode.getPortPos(dstPort, 'dst');

                let edge = new Edge();
                edge.setSrc(srcNode, srcPort, sx, sy);
                edge.setDst(dstNode, dstPort, dx, dy);
                this.svg.appendChild(edge.line);
            }
        }

        // Filter out selected nodes that don't exist anymore
        this.selected = this.selected.filter(
            nodeId => this.nodes.has(nodeId)
        );

        // Highlight selected nodes
        for (let nodeId of this.selected)
        {
            let node = this.nodes.get(nodeId);
            node.nodeDiv.style['border-color'] = '#F00';
        }
    }

    // Update an in progress selection
    updateSelect(startPos, curPos)
    {
        let xMin = Math.min(startPos.x, curPos.x);
        let yMin = Math.min(startPos.y, curPos.y);
        let xMax = Math.max(startPos.x, curPos.x);
        let yMax = Math.max(startPos.y, curPos.y);
        let dx = xMax - xMin;
        let dy = yMax - yMin;

        if (this.selectDiv)
        {
            // Update group selection outline
            this.selectDiv.style.left = xMin;
            this.selectDiv.style.top = yMin;
            this.selectDiv.style.width = dx;
            this.selectDiv.style.height = dy;
        }
        else if (Math.abs(dx) > 5 || Math.abs(dy) > 5)
        {
            // Create group selection outline
            this.selectDiv = document.createElement('div');
            this.selectDiv.id = "select_div";
            this.selectDiv.style.left = xMin;
            this.selectDiv.style.top = yMin;
            this.selectDiv.style.width = dx;
            this.selectDiv.style.height = dx;
            this.editorDiv.appendChild(this.selectDiv);
        }

        this.selected = [];

        // For each node
        for (let [nodeId, node] of this.nodes)
        {
            let left = node.nodeDiv.offsetLeft;
            let top = node.nodeDiv.offsetTop;
            let width = node.nodeDiv.offsetWidth;
            let height = node.nodeDiv.offsetHeight;

            let nodeInside = (
                left > xMin &&
                left + width < xMax &&
                top > yMin &&
                top + height < yMax
            );

            if (nodeInside)
            {
                this.selected.push(nodeId);
                node.nodeDiv.style['border-color'] = '#F00';
            }
            else
            {
                node.nodeDiv.style.removeProperty('border-color');
            }
        }
    }

    // Remove the currently active selection
    deselect()
    {
        // For each selected node
        for (let nodeId of this.selected)
        {
            // Unhighlight the node
            let node = this.nodes.get(nodeId);
            node.nodeDiv.style.removeProperty('border-color');
        }

        this.selected = [];
    }

    // Resize the graph to fit all nodes
    resize()
    {
        // Initialize the graph size to the edit tab size
        setSvg(this.svg, 'width', this.editorDiv.clientWidth);
        setSvg(this.svg, 'height', this.editorDiv.clientHeight);
        this.graphDiv.style.width = this.editorDiv.clientWidth;
        this.graphDiv.style.height = this.editorDiv.clientHeight;

        /*
        // Make sure the div fits all the nodes
        for (let id in this.graph.nodes)
        {
            let data = this.graph.nodes[id];
            let node = this.nodes.get(data);
            this.fitNode(node);
        }
        */
    }

    // Transform the mouse position of a mouse event relative to the SVG canvas
    getMousePos(evt)
    {
        var CTM = this.svg.getScreenCTM();

        if (evt.touches)
            evt = evt.touches[0];

        return {
            x: (evt.clientX - CTM.e) / CTM.a,
            y: (evt.clientY - CTM.f) / CTM.d
        };
    }

    // Show node creation dialog
    createNodeDialog(mousePos)
    {
        console.log('createNodeDialog');

        // Dialog contents
        var div = document.createElement('div');
        var dialog = new Dialog('Create Node', div);
        div.style['text-align'] = 'center';

        // Display the possible node types to create
        for (let nodeType in NODE_SCHEMA)
        {
            let schema = NODE_SCHEMA[nodeType];

            // Don't show internal node types
            if (schema.internal)
                continue;

            function subDivClick(evt)
            {
                dialog.close();
                evt.stopPropagation();

                this.model.update(new model.CreateNode(
                    nodeType,
                    mousePos.x,
                    mousePos.y
                ));
            }

            // TODO: migrate this to CSS
            var subDiv = document.createElement('div');
            subDiv.title = schema.description;
            subDiv.style.border = "2px solid #AAA";
            subDiv.style.display = 'inline-block';
            subDiv.style.color = '#FFF';
            subDiv.style['text-align'] = 'center';
            subDiv.style['user-select'] = 'none';
            subDiv.style.width = '100px';
            subDiv.style.margin = '4px';
            subDiv.appendChild(document.createTextNode(nodeType));
            subDiv.onclick = subDivClick.bind(this);

            // There can be only one AudioOut or Notes node
            if ((nodeType == 'AudioOut' && this.model.hasNode('AudioOut')) ||
                (nodeType == 'Notes' && this.model.hasNode('Notes')))
            {
                subDiv.style.color = '#777';
                subDiv.style.border = '2px solid #777';
                subDiv.onclick = undefined;
            }

            div.appendChild(subDiv);
        }
    }

    // Start dragging/moving nodes
    startDrag(nodeId, mousePos)
    {
        console.log('starting drag');

        if (this.selected.indexOf(nodeId) != -1)
        {
            this.dragNodes = this.selected;
        }
        else
        {
            this.dragNodes = [nodeId];
            this.deselect();
        }

        this.startMousePos = mousePos;
        this.lastMousePos = mousePos;
    }

    // Stop dragging/moving nodes
    endDrag(mousePos)
    {
        console.log('end drag');

        let dx = mousePos.x - this.startMousePos.x;
        let dy = mousePos.y - this.startMousePos.y;

        // Send the update to the model to actually move the nodes
        if (dx != 0 || dy != 0)
        {
            this.model.update(new model.MoveNodes(
                this.dragNodes,
                dx,
                dy
            ));
        }

        this.dragNodes = [];
        this.startMousePos = null;
        this.lastMousePos = null;
    }

    // Move nodes currently being dragged to a new position
    moveNodes(mousePos)
    {
        assert (this.lastMousePos);
        let dx = mousePos.x - this.lastMousePos.x;
        let dy = mousePos.y - this.lastMousePos.y;
        this.lastMousePos = mousePos;

        // Move the nodes
        for (let nodeId of this.dragNodes)
        {
            let node = this.nodes.get(nodeId);
            node.move(dx, dy);
        }
    }

    // Delete the currently selected nodes
    deleteSelected()
    {
        if (this.selected.length == 0)
            return;

        this.model.update(new model.DeleteNodes(
            this.selected
        ));
    }

    // Group the currently selected nodes
    groupSelected()
    {
        if (this.selected.length == 0)
            return;

        this.model.update(new model.GroupNodes(
            this.selected
        ));
    }
}

/**
 * Connection between two UI nodes
 */
class Edge
{
    constructor()
    {
        // Information about rendering the edge line
        this.lineStart = null;
        this.lineEnd = null;

        // The rendered edge line
        this.line = makeSvg('path');
        setSvg(this.line, 'fill', 'none');
        setSvg(this.line, 'stroke-width', '2');

        // Source and destination nodes
        this.srcNode = null;
        this.dstNode = null;

        // Source and destination port indices
        this.srcPort = null;
        this.dstPort = null;
    }

    calculateEndpoint(x, y, angle, controlLength)
    {
        return {
            x: x,
            y: y,
            cx: x + (controlLength * Math.cos(angle)),
            cy: y + (controlLength * Math.sin(angle))
        };
    }

    render()
    {
        if (this.lineStart === null || this.lineEnd === null)
        {
            // Don't draw anything, there's not enough information
            setSvg(this.line, 'd', '');
            return;
        }

        // Determine edge color
        let color = '#ccc';
        if (this.srcNode && this.dstNode)
        {
            // n_ prefix is arbitrary, added to get a different color mix.
            let colorKey = `n_${this.srcNode.nodeType}_${this.srcPort}`;
            color = getBrightColor(colorKey);
        }

        setSvg(this.line, 'stroke', color);

        // Calculate the cubic bezier control points
        let dx = this.lineStart.x - this.lineEnd.x;
        let dy = this.lineStart.y - this.lineEnd.y;
        let dist = Math.sqrt((dx*dx) + (dy*dy));
        let controlLength = Math.floor(dist / 2);

        let start = this.calculateEndpoint(
            this.lineStart.x,
            this.lineStart.y,
            this.lineStart.angle,
            controlLength
        );

        let end = this.calculateEndpoint(
            this.lineEnd.x,
            this.lineEnd.y,
            this.lineEnd.angle,
            controlLength
        );

        // The "M" command moves the cursor to an absolute point. The "C"
        // command draws a cubic bezier line starting at the cursor and
        // ending at another absolute point, with two given control points.
        let d = `M ${start.x},${start.y} ` +
                `C ${start.cx},${start.cy} ` +
                  `${end.cx},${end.cy} ` +
                  `${end.x},${end.y}`;

        setSvg(this.line, 'd', d);
    }

    setSrc(srcNode, srcPort, x, y)
    {
        if (srcNode.outEdges[srcPort].indexOf(this) == -1)
        {
            srcNode.outEdges[srcPort].push(this);
        }

        this.srcNode = srcNode;
        this.srcPort = srcPort;

        this.lineStart = {
            x: x,
            y: y,
            angle: 0
        };

        this.render();
    }

    setDst(dstNode, dstPort, x, y)
    {
        dstNode.inEdges[dstPort] = this;

        this.dstNode = dstNode;
        this.dstPort = dstPort;

        this.lineEnd = {
            x: x,
            y: y,
            angle: -Math.PI
        };

        this.render();
    }

    moveSrc(dx, dy)
    {
        if (this.lineStart === null)
            return;

        this.lineStart.x += dx;
        this.lineStart.y += dy;

        this.render();
    }

    moveDst(dx, dy)
    {
        if (this.lineEnd === null)
            return;

        this.lineEnd.x += dx;
        this.lineEnd.y += dy;

        this.render();
    }

    // Find out which side of the edge is unconnected
    get openSide()
    {
        if (this.srcNode === null)
            return 'src';
        else if (this.dstNode === null)
            return 'dst';
        return null;
    }

    // Drag the unconnected side of the edge
    dragEdge(mousePos)
    {
        let openSide = this.openSide;
        assert (openSide !== null);

        if (openSide == 'src')
        {
            this.lineStart = {
                x: mousePos.x,
                y: mousePos.y,
                angle: 0
            };
        }
        else
        {
            this.lineEnd = {
                x: mousePos.x,
                y: mousePos.y,
                angle: -Math.PI
            };
        }

        this.render();
    }
}

/**
 * Represent a node in the UI
 */
class Node
{
    constructor(id, state, editor)
    {
        // Graph editor
        this.editor = editor;

        // Schema for this node type
        this.schema = (state.type == 'Module')? state.schema:NODE_SCHEMA[state.type];

        this.nodeId = id;
        this.nodeType = state.type;
        this.nodeName = state.name;
        this.x = state.x;
        this.y = state.y;
        this.numIns = this.schema.ins.length;
        this.numOuts = this.schema.outs.length;

        // DOM div wrapping the whole node
        this.nodeDiv = null;

        // DOM div for the node header
        this.headerDiv = null;

        // DOM div wrapping center elements
        this.centerDiv = null;

        // DOM divs for port connectors, mapped by port name
        this.inPorts = [];
        this.outPorts = [];

        // Input and output edges, mapped by port names
        this.inEdges = [];
        this.outEdges = [];

        // There can be multiple output edges per output port
        for (let portIdx in this.schema.outs)
            this.outEdges[portIdx] = [];

        this.genNodeDOM(state.name);
    }

    /**
     * Setup DOM elements for this node
     */
    genNodeDOM()
    {
        function startDrag(evt)
        {
            // Shift + click is delete node
            if (evt.shiftKey)
                return;

            // Can't drag a node while connecting a port
            if (this.editor.edge)
                return;

            let mousePos = this.editor.getMousePos(evt);
            this.editor.startDrag(this.nodeId, mousePos);

            evt.stopPropagation();
        }

        function endDrag(evt)
        {
            let mousePos = this.editor.getMousePos(evt);
            this.editor.endDrag(mousePos);
        }

        function onClick(evt)
        {
            // Only delete on shift + click
            if (evt.shiftKey && !this.editor.edge)
            {
                this.editor.model.update(
                    new model.DeleteNodes([this.nodeId])
                );
            }

            evt.stopPropagation();
        }

        // Top-level element for this node
        this.nodeDiv = document.createElement('div');
        this.nodeDiv.className = 'node';
        this.nodeDiv.style.left = this.x;
        this.nodeDiv.style.top = this.y;
        this.nodeDiv.onmousedown = startDrag.bind(this);
        this.nodeDiv.ontouchstart = startDrag.bind(this);
        this.nodeDiv.onmouseup = endDrag.bind(this);
        this.nodeDiv.ontouchend = endDrag.bind(this);
        this.nodeDiv.onclick = onClick.bind(this);
        this.nodeDiv.ondblclick = this.paramsDialog.bind(this);

        // Node header text
        this.headerDiv = document.createElement('div');
        this.headerDiv.className = 'node_header';
        this.headerDiv.textContent = this.nodeName;
        this.headerDiv.title = this.nodeType;
        this.nodeDiv.appendChild(this.headerDiv);

        let contentDiv = document.createElement('div');
        contentDiv.className = 'node_content';
        this.nodeDiv.appendChild(contentDiv);

        let inPortsDiv = document.createElement('div');
        inPortsDiv.className = 'node_in_ports';
        contentDiv.appendChild(inPortsDiv);

        // Create a div to contain center display elements (if any)
        this.centerDiv = document.createElement('div');
        this.centerDiv.className = 'node_center';
        contentDiv.appendChild(this.centerDiv);

        let outPortsDiv = document.createElement('div');
        outPortsDiv.className = 'node_out_ports';
        contentDiv.appendChild(outPortsDiv);

        // Create the destination (inputs) ports
        for (var portIdx = 0; portIdx < this.numIns; ++portIdx)
        {
            this.genPortDOM(
                inPortsDiv,
                portIdx,
                this.schema.ins[portIdx].name,
                'dst'
            );
        }

        // Create the source (output) ports
        for (var portIdx = 0; portIdx < this.numOuts; ++portIdx)
        {
            this.genPortDOM(
                outPortsDiv,
                portIdx,
                this.schema.outs[portIdx],
                'src'
            );
        }
    }

    /**
     * Setup DOM nodes for a connection port
     */
    genPortDOM(parentDiv, portIdx, portName, side)
    {
        let editor = this.editor;

        function portClick(evt)
        {
            console.log(`port click ${portName}`);

            evt.stopPropagation();

            let [cx, cy] = this.getPortPos(portIdx, side);

            // If no connection is in progress
            if (!editor.edge)
            {
                let edge = new Edge();

                // If this is an input port, remove previous connection
                if (side == 'dst')
                {
                    // Remove previous connection on this port, if any
                    editor.model.update(new model.Disconnect(
                        this.nodeId,
                        portIdx,
                    ));

                    edge.setDst(this, portIdx, cx, cy);
                }
                else
                {
                    edge.setSrc(this, portIdx, cx, cy);
                }

                editor.edge = edge;
                editor.svg.appendChild(edge.line);

                return;
            }

            // Must connect in to out
            if (editor.edge.openSide != side)
                return;

            if (side == 'dst')
            {
                editor.model.update(new model.ConnectNodes(
                    editor.edge.srcNode.nodeId,
                    editor.edge.srcPort,
                    this.nodeId,
                    portIdx
                ));
            }
            else
            {
                editor.model.update(new model.ConnectNodes(
                    this.nodeId,
                    portIdx,
                    editor.edge.dstNode.nodeId,
                    editor.edge.dstPort
                ));
            }

            // Done connecting
            editor.edge = null;
        }

        let portDiv = document.createElement('div');
        portDiv.className = (side == 'dst')? 'node_in_port':'node_out_port';
        portDiv.onclick = portClick.bind(this);
        parentDiv.appendChild(portDiv);

        // Port name text
        let textDiv = document.createElement('div');
        textDiv.className = 'port_text';
        textDiv.appendChild(document.createTextNode(portName));
        portDiv.appendChild(textDiv);

        let connDiv = document.createElement('div');
        connDiv.className = 'port_conn';
        portDiv.appendChild(connDiv);

        if (side == 'dst')
        {
            this.inPorts[portIdx] = connDiv;
        }
        else
        {
            this.outPorts[portIdx] = connDiv;
        }
    }

    /**
     * Show a modal dialog to edit node parameters
     */
    paramsDialog()
    {
        let node = this;
        let nodeState = this.editor.model.getNodeState(this.nodeId);
        let newName = nodeState.name;
        let newParams = Object.assign({}, nodeState.params);

        // Dialog contents
        var div = document.createElement('div');
        var dialog = new Dialog('Node Parameters', div);

        // Node type
        let typeDiv = document.createElement('div');
        typeDiv.className = 'form_div';
        div.appendChild(typeDiv);
        typeDiv.appendChild(document.createTextNode('Node type '));
        let typeElem = document.createElement('input');
        typeElem.type = 'text';
        typeElem.size = 14;
        typeElem.disabled = true;
        typeElem.value = this.nodeType;
        typeDiv.appendChild(typeElem);

        // Node name editing
        let paramDiv = document.createElement('div');
        paramDiv.className = 'form_div';
        div.appendChild(paramDiv);
        paramDiv.appendChild(document.createTextNode('Node name '));
        let input = document.createElement('input');
        input.type = 'text';
        input.size = 14;
        input.maxLength = 12;
        input.value = nodeState.name;
        paramDiv.appendChild(input);

        input.oninput = function (evt)
        {
            newName = input.value;
        }

        // For each parameter
        for (let param of this.schema.params)
        {
            let paramDiv = document.createElement('div');
            paramDiv.className = 'form_div';
            div.appendChild(paramDiv);

            let name = document.createTextNode(param.name + ' ');
            paramDiv.appendChild(name);

            let input = document.createElement('input');
            input.type = 'text';
            input.size = 12;
            input.maxLength = 10;
            input.value = nodeState.params[param.name];
            paramDiv.appendChild(input);

            input.oninput = function (evt)
            {
                newParams[param.name] = Number(input.value);
            }
        }

        let saveBtn = document.createElement('button');
        saveBtn.textContent = 'Save';
        saveBtn.className = 'form_btn';
        div.appendChild(saveBtn);

        let cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.className = 'form_btn';
        div.appendChild(cancelBtn);

        let deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Delete';
        deleteBtn.className = 'form_btn';
        div.appendChild(deleteBtn);

        // TODO: we should move saveParams into a method
        // and to some validation based on the schema at save time
        function saveParams()
        {
            // Model updates may fail for some values
            try
            {
                this.editor.model.update(new model.SetNodeName(
                    this.nodeId,
                    newName
                ));

                // For each parameter
                for (let param of this.schema.params)
                {
                    if (newParams[param.name] == nodeState.params[param.name])
                        continue;

                    this.editor.model.update(new model.SetParam(
                        this.nodeId,
                        param.name,
                        newParams[param.name]
                    ));
                }

                dialog.close();
            }

            catch (e)
            {
                // If model updates fail, we don't close the dialog
                console.log(e);
            }
        }

        saveBtn.onclick = saveParams.bind(this);

        cancelBtn.onclick = function ()
        {
            dialog.close()
        }

        deleteBtn.onclick = function ()
        {
            node.editor.delNode(node);
            dialog.close()
        }

        // Save the parameters and close if enter is pressed
        dialog.on('keydown', function (key)
        {
            if (key == "Enter")
                saveBtn.onclick();
        });

        return div;
    }

    /**
     * Get the position of the center of a port connector relative
     * to the editor canvas.
     */
    getPortPos(portIdx, side)
    {
        let connDiv = (side == 'dst')? this.inPorts[portIdx]:this.outPorts[portIdx];

        let graphRect = this.editor.graphDiv.getBoundingClientRect();

        let rect = connDiv.getBoundingClientRect();
        let x = rect.left + (rect.width / 2) - graphRect.left;
        let y = rect.top + (rect.height / 2) - graphRect.top;

        return [x, y];
    }

    /**
     * Move this node and its connected edges
     */
    move(dx, dy)
    {
        // Move the node
        this.x += dx;
        this.y += dy;
        this.nodeDiv.style.left = this.x;
        this.nodeDiv.style.top = this.y;

        for (let dstPort in this.inEdges)
        {
            let edge = this.inEdges[dstPort];
            edge.moveDst(dx, dy);
        }

        for (let srcPort in this.outEdges)
        {
            for (let edge of this.outEdges[srcPort])
            {
                edge.moveSrc(dx, dy);
            }
        }

        // TODO: move this into the Editor class
        // Adjust the graph to fit this node
        //this.editor.fitNode(this, true);
    }
}

/**
 * Constant value node
 */
class ConstNode extends Node
{
    constructor(id, state, editor)
    {
        super(id, state, editor);

        // Hide the node header
        this.headerDiv.style.display = 'none';

        let input = this.input = document.createElement('input');
        input.style['text-align'] = 'center';
        input.style['font-size'] = 14;
        input.style['font-family'] = 'monospace';
        input.style.color = '#FFF';
        input.style.background = 'none';
        input.style.border = 'none';
        input.type = 'text';
        input.size = 4;
        input.maxLength = 12;
        this.centerDiv.appendChild(input);

        function resize()
        {
            let width = Math.max(2, 1 + input.value.length) + 'ch';
            input.style.width = width;
        }

        input.oninput = function ()
        {
            resize();
        }

        input.onchange = function ()
        {
            let val = Number(input.value);

            if (input.value.trim() === "" || isNaN(val))
            {
                // Restore value from params
                input.value = state.params.value;
            }
            else
            {
                editor.model.update(new model.SetParam(
                    id,
                    'value',
                    val
                ));
            }

            resize();
        }

        input.ondblclick = function (evt)
        {
            evt.stopPropagation();
        }

        input.value = state.params.value;
        resize();
    }
}

/**
 * Rotary knob control
 */
class KnobNode extends Node
{
    constructor(id, state, editor)
    {
        super(id, state, editor);

        this.knob = new Knob(
            state.params.minVal,
            state.params.maxVal,
            state.params.value,
            state.params.controlNo
        );
        this.centerDiv.append(this.knob.div)

        function knobChange(value)
        {
            editor.model.update(new model.SetParam(
                id,
                'value',
                value
            ));
        }

        this.knob.on('change', knobChange);
        //this.knob.on('bind', controlNo => this.data.params.controlNo = controlNo);
    }
}

/**
 * Monophonic note sequencer
 */
class MonoSeq extends Node
{
    constructor(id, state, editor)
    {
        super(id, state, editor);

        /*
        // Initialize the pattern data
        if (!('patterns' in data))
        {
            data.scaleRoot = 'C2';
            data.scaleName = 'minor pentatonic';
            data.numOcts = 1;

            // Pattern grids
            data.patterns = [];
        }
        */

        var div = document.createElement('div');
        div.style['padding'] = '4px';
        div.style['text-align'] = 'center';
        this.centerDiv.append(div)

        // Buttons and drop boxes
        let btnDiv = document.createElement('div');
        btnDiv.style.display = 'flex';
        btnDiv.style['justify-content'] = 'center';
        btnDiv.style['flex-wrap'] = 'nowrap';
        btnDiv.style['margin-bottom'] = 4;
        div.appendChild(btnDiv);

        // Root and scale selection boxes
        var selectNum = document.createElement("select");
        var selectRoot = document.createElement("select");
        var selectScale = document.createElement("select");
        btnDiv.appendChild(selectNum);
        btnDiv.appendChild(selectRoot);
        btnDiv.appendChild(selectScale);

        // Shrink and extend pattern buttons
        let shrinkBtn = document.createElement("button");
        let extendBtn = document.createElement("button");
        let copyBtn = document.createElement("button");
        shrinkBtn.appendChild(document.createTextNode("←"));
        extendBtn.appendChild(document.createTextNode("→"));
        copyBtn.appendChild(document.createTextNode("⇒"));
        btnDiv.appendChild(shrinkBtn);
        btnDiv.appendChild(extendBtn);
        btnDiv.appendChild(copyBtn);
        shrinkBtn.onclick = evt => this.shrink();
        extendBtn.onclick = evt => this.extend();
        copyBtn.onclick = evt => this.extendCopy();
        shrinkBtn.ondblclick = evt => evt.stopPropagation();
        extendBtn.ondblclick = evt => evt.stopPropagation();
        copyBtn.ondblclick = evt => evt.stopPropagation();

        function scaleChange()
        {
            let scaleRoot = selectRoot.options[selectRoot.selectedIndex].value;
            let scaleName = selectScale.options[selectScale.selectedIndex].value;
            let numOcts = selectNum.options[selectNum.selectedIndex].value;
            this.setScale(scaleRoot, scaleName, numOcts);
        }

        selectNum.onchange = scaleChange.bind(this);
        selectRoot.onchange = scaleChange.bind(this);
        selectScale.onchange = scaleChange.bind(this);

        // Populate the num octaves selection
        for (let numOcts = 1; numOcts <= 3; ++numOcts)
        {
            var opt = document.createElement("option");
            opt.setAttribute('value', numOcts);
            opt.appendChild(document.createTextNode(numOcts));
            //opt.selected = (numOcts == data.numOcts);
            selectNum.appendChild(opt);
        }

        // TODO: need to populate based on schema
        /*
        // Populate the root note selection
        var rootNote = music.Note('C1');
        for (let i = 0; i < 5 * music.NOTES_PER_OCTAVE; ++i)
        {
            var noteName = rootNote.getName();
            var opt = document.createElement("option");
            opt.setAttribute('value', noteName);
            opt.appendChild(document.createTextNode(noteName));
            //opt.selected = (noteName == data.scaleRoot);
            selectRoot.appendChild(opt);
            rootNote = rootNote.offset(1);
        }

        // Populate the scale selection
        for (let scale of music.SCALE_NAMES)
        {
            var opt = document.createElement("option");
            opt.setAttribute('value', scale);
            opt.appendChild(document.createTextNode(scale));
            //opt.selected = (scale == data.scaleName);
            selectScale.appendChild(opt);
        }
        */

        // Div to contain the sequencer grid
        this.gridDiv = document.createElement('div');
        this.gridDiv.style['margin-top'] = 4;
        this.gridDiv.style['padding-top'] = 4;
        this.gridDiv.style['padding-bottom'] = 4;
        this.gridDiv.style.background = '#111';
        this.gridDiv.style.border = '1px solid #AAA';
        this.gridDiv.style['text-align'] = 'left';
        this.gridDiv.style.width = '325';
        this.gridDiv.style['overflow-x'] = 'scroll';
        this.gridDiv.style['overscroll-behavior-x'] = 'none';
        this.gridDiv.style['white-space'] = 'nowrap';
        div.appendChild(this.gridDiv);

        // Prevent double-click handling from propagating to node
        // This is needed because clicks on grid cells are frequent
        this.gridDiv.ondblclick = evt => evt.stopPropagation();

        // Pattern grid containers, indexed by pattern
        this.patDivs = [];

        // Divs for grid cells, indexed by pattern
        this.cellDivs = [];

        // Pattern selection block
        let selDiv = document.createElement('div');
        selDiv.style.display = 'flex';
        selDiv.style['justify-content'] = 'center';
        selDiv.style['flex-wrap'] = 'nowrap';
        selDiv.style['margin-top'] = 4;
        div.appendChild(selDiv);

        // Pattern selection buttons
        this.patBtns = []

        // Pattern selection bar
        for (let i = 0; i < 8; ++i)
        {
            let patSel = document.createElement('div');
            patSel.className = 'patsel_btn';
            patSel.textContent = String(i+1);

            // When clicked, select this pattern
            patSel.onclick = evt => this.queue(i);

            selDiv.appendChild(patSel);
            this.patBtns.push(patSel);
        }

        // Create the scale
        //this.scale = music.genScale(data.scaleRoot, data.scaleName, data.numOcts);
        //this.numRows = this.scale.length;

        // Currently selected pattern
        this.patIdx = 0;
    }













}

// Map of node types to specialized node classes
const NODE_CLASSES =
{
    'Const': ConstNode,
    'Knob': KnobNode,
    'MonoSeq': MonoSeq,
}
