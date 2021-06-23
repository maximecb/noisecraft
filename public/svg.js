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
        this.start = {
            x: x,
            y: y,
            angle: angle
        };

        this.render();
    }

    setEnd(x, y, angle, controlLength)
    {
        this.end = {
            x: x,
            y: y,
            angle: angle
        };

        this.render();
    }

    moveStart(dx, dy)
    {
        if (this.start === null)
            return;

        this.start.x += dx;
        this.start.y += dy;

        this.render();
    }

    moveEnd(dx, dy)
    {
        if (this.end === null)
            return;

        this.end.x += dx;
        this.end.y += dy;

        this.render();
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

        let dx = this.start.x - this.end.x;
        let dy = this.start.y - this.end.y;
        let dist = Math.sqrt((dx*dx) + (dy*dy));
        let controlLength = Math.floor(dist / 2);

        let start = this.calculateEndpoint(
            this.start.x,
            this.start.y,
            this.start.angle,
            controlLength
        );

        let end = this.calculateEndpoint(
            this.end.x,
            this.end.y,
            this.end.angle,
            controlLength
        );

        // The "M" command moves the cursor to an absolute point. The "C"
        // command draws a cubic bezier line starting at the cursor and
        // ending at another absolute point, with two given control points.
        let d = `M ${start.x},${start.y}` +
                `C ${start.cx},${start.cy} ` +
                  `${end.cx},${end.cy} ` +
                  `${end.x},${end.y} `;

        setSvg(this.element, 'd', d);
    }
}
