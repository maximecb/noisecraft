/**
Create a modal dialog popup showing content wrapped in a div
*/
export function Dialog(title, div)
{
    function bgClick(evt)
    {
        this.close();
        evt.stopPropagation();
    }

    this.div = document.createElement('div');
    this.div.className = 'dialog';
    let titleDiv = document.createElement('div');
    titleDiv.className = 'dialog_title';
    titleDiv.appendChild(document.createTextNode(title));
    this.div.appendChild(titleDiv);
    this.div.appendChild(div);

    // Used to detect/prevent clicks outside dialog
    this.bgDiv = document.createElement('div');
    this.bgDiv.className = 'dark_overlay';
    this.bgDiv.onclick = bgClick.bind(this);

    var body = document.getElementsByTagName("body")[0];
    body.appendChild(this.div);
    body.appendChild(this.bgDiv);

    function keyHandler(evt)
    {
        for (let fn of this.keyListeners)
            fn(evt.key);

        // Close the dialog when the escape key is pressed
        if (evt.key === "Escape")
            this.close();
    }

    this.keyHandler = keyHandler.bind(this);
    body.addEventListener('keydown', this.keyHandler);

    // Listeneners to be called when the dialog is closed
    this.closeListeners = []

    // Listeners to be called when a key is pressed
    this.keyListeners = [];
}

Dialog.prototype.addCloseListener = function (fn)
{
    this.closeListeners.push(fn);
}

Dialog.prototype.addKeyListener = function (fn)
{
    this.keyListeners.push(fn);
}

Dialog.prototype.close = function ()
{
    var body = document.getElementsByTagName("body")[0];

    if (!body.contains(this.div))
        return;

    body.removeChild(this.div);
    body.removeChild(this.bgDiv);
    body.removeEventListener('keydown', this.keyHandler);

    for (let fn of this.closeListeners)
        fn();
}

/**
Assert that a condition holds true
*/
export function assert(condition, errorText)
{
    if (!errorText)
        errorText = 'assertion failed';

    if (!condition)
    {
        throw errorText;
    }
}

export function makeSvg(elName)
{
    return document.createElementNS("http://www.w3.org/2000/svg", elName);
}

export function getSvg(element, key)
{
    return element.getAttributeNS(null, key);
}

export function setSvg(element, key, val)
{
    element.setAttributeNS(null, key, val);
}

// Recursively copy a JSON tree data structure
export function treeCopy(obj)
{
    if (obj instanceof Array)
    {
        let newObj = new Array(obj.length);

        for (let i = 0; i < obj.length; ++i)
            newObj[i] = treeCopy(obj[i]);

        return newObj;
    }

    if (obj instanceof Object)
    {
        let newObj = {...obj};

        for (let k in obj)
            newObj[k] = treeCopy(obj[k]);

        return newObj;
    }

    return obj;
}

// Recursively compare two JSON tree data structures for equality
export function treeEq(a, b)
{
    if (a instanceof Array && b instanceof Array)
    {
        if (a.length !== b.length)
            return false;

        for (let i = 0; i < a.length; ++i)
        {
            if (!treeEq(a[i], b[i]))
                return false;
        }

        return true;
    }

    if (a instanceof Object && b instanceof Object)
    {
        // Compare all entries
        for (let k in a)
        {
            if (!(k in b))
                return false;

            if (!treeEq(a[k], b[k]))
                return false;
        }

        // a and b must have the same keys
        for (let k in b)
        {
            if (!(k in a))
                return false;
        }

        return true;
    }

    return a === b;
}

/**
Test that a value is an object
*/
export function isObject(val)
{
    return (typeof val === 'object') && (val !== null);
}

/**
Test that a value is a string
*/
export function isString(val)
{
    return (typeof val === 'string') || (val instanceof String);
}

/**
Test that a value is integer
*/
export function isInt(val)
{
    return (
        Math.floor(val) === val
    );
}

/**
Test that a value is a nonnegative integer
*/
export function isNonNegInt(val)
{
    return (
        isInt(val) &&
        val >= 0
    );
}

/**
Test that a value is a strictly positive (nonzero) integer
*/
export function isPosInt(val)
{
    return (
        isInt(val) &&
        val > 0
    );
}

/**
Generate a random integer within [a, b]
*/
export function randInt(a, b)
{
    assert (
        isInt(a) && isInt(b) && a <= b,
        'invalid params to randInt'
    );

    var range = b - a;

    var rnd = a + Math.floor(Math.random() * (range + 1));

    return rnd;
}

/**
Generate a random integer within [0, len[
*/
export function randIndex(len)
{
    return randInt(0, len-1);
}

/**
Generate a random boolean
*/
export function randBool()
{
    return (randInt(0, 1) === 1);
}

/**
Generate a random floating-point number within [a, b]
*/
export function randFloat(a, b)
{
    if (a === undefined)
        a = 0;
    if (b === undefined)
        b = 1;

    assert (
        a <= b,
        'invalid params to randFloat'
    );

    var range = b - a;

    var rnd = a + Math.random() * range;

    return rnd;
}

/**
Generate a random value from a normal distribution
*/
export function randNorm(mean, variance)
{
	// Declare variables for the points and radius
    var x1, x2, w;

    // Repeat until suitable points are found
    do
    {
    	x1 = 2.0 * randFloat() - 1.0;
    	x2 = 2.0 * randFloat() - 1.0;
    	w = x1 * x1 + x2 * x2;
    } while (w >= 1.0 || w == 0);

    // compute the multiplier
    w = Math.sqrt((-2.0 * Math.log(w)) / w);

    // compute the gaussian-distributed value
    var gaussian = x1 * w;

    // Shift the gaussian value according to the mean and variance
    return (gaussian * variance) + mean;
}

/**
Choose a random argument element of an array
*/
export function randElem(array)
{
    assert (
        array.length > 0,
        'must supply at least one possible choice'
    );

    var idx = randInt(0, array.length - 1);

    return array[idx];
}

/**
Plot a single-variable function on a canvas
*/
export function plotFn(fn, xMin, xMax, canvasId)
{
    var canvas = document.getElementById(canvasId);
    var ctx = canvas.getContext("2d");

    var numPts = canvas.width;

    var xs = [];
    var ys = [];

    for (var i = 0; i < numPts; ++i)
    {
        var x = xMin + (i / (numPts - 1)) * (xMax - xMin);
        var y = fn(x);
        xs.push(x);
        ys.push(y);
    }

    var yMin = Math.min(...ys);
    var yMax = Math.max(...ys);

    console.log(yMin);
    console.log(yMax);

    ctx.strokeStyle="#FF0000";

    for (var i = 0; i < ys.length; ++i)
    {
        var x = xs[i];
        var y = ys[i];
        var relX = (x - xMin) / (xMax - xMin);
        var relY = (y - yMin) / (yMax - yMin);
        var cX = canvas.width * relX;
        var cY = canvas.height * (1 - relY);

        if (i < 80)
            console.log('i=', i, 'y=', y, 'cY=', cY);

        if (i == 0)
        {
            ctx.moveTo(cX, cY);
        }
        else
        {
            ctx.lineTo(cX, cY);
            ctx.stroke();
        }
    }
}
