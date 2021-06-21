import { makeSvg, setSvg } from './utils.js';

/**
An SVG helper to create and maintain one cubic bezier curve.
*/
export class CubicLine
{
    constructor()
    {
        this.element = makeSvg('path');
        setSvg(this.element, 'fill', 'none');

        this.start = null;
        this.end = null;
    }

    setColor(color)
    {
        setSvg(this.element, 'stroke', color);
    }

    setWidth(width)
    {
        setSvg(this.element, 'stroke-width', width);
    }

    setStart(x, y, angle, controlLength)
    {
        this.start = this.calculateEndpoint(x, y, angle, controlLength);
        this.render();
    }

    setEnd(x, y, angle, controlLength)
    {
        this.end = this.calculateEndpoint(x, y, angle, controlLength);
        this.render();
    }

    moveStart(dx, dy)
    {
        if (this.start === null)
            return;

        this.start = this.calculateEndpoint(
            this.start.x + dx,
            this.start.y + dy,
            this.start.angle,
            this.start.controlLength
        );
    }

    moveEnd(dx, dy)
    {
        if (this.end === null)
            return;

        this.end = this.calculateEndpoint(
            this.end.x + dx,
            this.end.y + dy,
            this.end.angle,
            this.end.controlLength
        );
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

    // Tries to render the line if possible.
    render()
    {
        if (this.start === null || this.end === null)
        {
            setSvg(this.element, 'd', '');
            return;
        }

        // The "M" command moves the cursor to an absolute point. The "C"
        // command draws a cubic bezier line starting at the cursor and
        // ending at another absolute point, with two given control points.
        let d = `M ${this.start.x},${this.start.y}` +
                `C ${this.start.cx},${this.start.cy} ` +
                  `${this.end.cx},${this.end.cy} ` +
                  `${this.end.x},${this.end.y} `;

        setSvg(this.element, 'd', d);
    }
}
