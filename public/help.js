/**
 * Format H1/H2/H3 subsections. Add numbering and horizontal separators.
 */
function formatSections(elem)
{
    let nums = [0, 0, 0, 0, 0, 0];

    let lastLevel = 0;

    for (let child of elem.childNodes)
    {
        if (!child.tagName)
            continue;

        let tag = child.tagName.toUpperCase();

        if (tag[0] != 'H' || tag.length != 2)
            continue;

        let level = parseInt(tag[1]) - 1;

        // Increment the numbering at this level
        nums[level] += 1;

        // When going back to a lower level of heading
        // Reset numbering at deeper levels of nesting
        if (level < lastLevel)
        {
            for (var i = level + 1; i < nums.length; ++i)
            {
                nums[i] = 0;
            }
        }

        lastLevel = level;

        // Format the numbering string
        let numStr = '';
        for (var i = 1; i < nums.length; ++i)
        {
            if (nums[i] == 0)
                break;

            if (numStr != '')
                numStr += '.';

            numStr += nums[i];
        }

        child.textContent = numStr + ' ' + child.textContent;
    }

    let sections = []

    for (let child of elem.childNodes)
    {
        if (child.tagName && child.tagName.toUpperCase() == 'H2')
        {
            sections.push(child);
        }
    }

    for (var i = 1; i < sections.length; ++i)
    {
        let hr = document.createElement('hr');
        elem.insertBefore(hr, sections[i]);
    }
}

let help = document.getElementById('helpcontents');
formatSections(help);
