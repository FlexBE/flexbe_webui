
# Copyright 2024 Philipp Schillinger and Christopher Newport University
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""Load settings for flexbe_webui."""

import os
import re
from pathlib import Path

from pygments import highlight
from pygments.formatters import HtmlFormatter
from pygments.lexers import PythonLexer


def find_subfolder(root, subfolder):
    """Return first subfolder matching the name."""
    for dirpath, dirnames, _ in os.walk(root):
        if subfolder in dirnames:
            return os.path.join(dirpath, subfolder)
    return None


def validate_path_consistency(python_path, manifest_path):
    """Validate that two paths are consistent up to share/lib."""
    path = Path(python_path)
    python_path_elements = [part for part in path.parts if part not in (path.root, path.anchor)]
    path = Path(manifest_path)
    manifest_path_elements = [part for part in path.parts if part not in (path.root, path.anchor)]

    print(f'  Python path: {python_path_elements}')
    print(f'Manifest path: {manifest_path_elements}')

    min_ndx = min(len(python_path_elements), len(manifest_path_elements))
    for ndx in range(min_ndx):
        if python_path_elements[ndx] != manifest_path_elements[ndx]:
            if ndx > 2 and (python_path_elements[ndx - 1] == 'lib' or manifest_path_elements[ndx - 1] == 'share'):
                return True  # Expected breaking point
            print(f'Invalid paths at ndx={ndx}')
            print(f'  Python path: {python_path_elements}')
            print(f'Manifest path: {manifest_path_elements}')
            return False  # Invalid
    return True


def highlight_code(code, visualize_whitespace=True):
    """
    Apply syntax highlighting for source visualization.

    This version allows us to visualize whitespace on screen.
    """
    formatter = HtmlFormatter(style='friendly', full=True, cssclass='code',
                              linenos='table')
    highlighted_code = highlight(code, PythonLexer(), formatter)

    # Generate the CSS
    css = formatter.get_style_defs('.code')
    custom_css = """
    .code {
        tab-size: 4; /* Adjust this number to set the desired tab size */
    }
    """
    full_css = f'<style>{css}\n{custom_css}</style>'

    # Combine the CSS and the highlighted code
    highlighted_code = f'{full_css}\n{highlighted_code}'

    if visualize_whitespace:
        try:
            # Use regex to extract the relevant code part from the HTML
            pattern = re.compile(r'(.*?)(<div class="code">.*?</table></body>)(.*)', re.DOTALL)
            match = pattern.search(highlighted_code)
            if match:
                before_code = match.group(1)
                code_part = match.group(2)
                after_code = match.group(3)

                print('\x1b[93mUpdating code part to visualize whitespaces.\x1b[0m', flush=True)
                # Replace whitespace characters in the code part
                lines = code_part.split('\n')
                new_lines = []
                for line in lines:
                    # Process line-by-line and update whitespace not part of xml tag
                    inside_xml = False
                    ndx = 0
                    while ndx < len(line):
                        if line[ndx] == '<':
                            if line[ndx:(ndx + 5)] == '<span':
                                inside_xml = True
                                ndx += 4
                        elif line[ndx] == '>':
                            if line[max(0, ndx - 6):(ndx + 1)] == '</span>':
                                inside_xml = False
                        if not inside_xml:
                            if line[ndx] == ' ':
                                line = line[:ndx] + '·' + line[(ndx + 1):]
                            elif line[ndx] == '\t':
                                line = line[:ndx] + '→\t' + line[(ndx + 1):]
                                ndx += 1  # skip added character
                        ndx += 1  # process the next character
                    new_lines.append(line)
                code_part = '\n'.join(new_lines)
                # Reassemble the HTML with the modified code part
                highlighted_code = before_code + code_part + after_code
            else:
                print('cannot determine code block to visualize whitespace!', flush=True)

        except Exception as exc:
            print(f'Failed to process whitespace: {type(exc)} - {exc}', flush=True)

    return highlighted_code


def left_align_block(code_block, blk_indent, ws_indent):
    """
    Move text to left align given block definition.

    @param code_block - block of text
    @param blk_indent - the desired indent level (might be empty string)
    @param ws_indent  - white space used to indent (tab or spaces)
    """
    # Make sure that manual blocks start in left column of block for us to indent
    # Modify so that all text in block starts in left most column of text block, and indent relative to that
    # This allows UI to not have large indent blocks to show.

    lines = code_block.split('\n')
    ws = ws_indent[:1]  # Single character used to indent

    # Filter out empty lines and calculate the minimum indent level and characters (> 0 indent)
    indents = [(len(line) - len(line.lstrip()), line[:len(line) - len(line.lstrip())]) for line in lines if line.strip()]
    min_indent_level, _ = min((x for x in indents), key=lambda x: x[0], default=(None, None))
    next_indent_level, next_indent_chars = min((x for x in indents if x[0] > 0), key=lambda x: x[0], default=(None, None))
    if not next_indent_level:
        # Everything is left justified, so just assume same as ws_indent
        current_ws = ws_indent[:1]
    else:
        current_ws = next_indent_chars[:1]

        # Check if we are changing the indentations between tabs and spaces
        if current_ws == '\t' and ws == ' ':
            ws = ws_indent[:]  # Use multiple characters if replacing tabs with space
        elif current_ws == ' ' and ws == '\t':
            current_ws = next_indent_chars

    justified_lines = []
    non_empty = False
    for line in lines:
        # Second pass to process each line and standardize indentation
        line = line.rstrip()
        if line:
            non_empty = True
            # By definition, len(line) > min_indent or empty
            shifted_line = line[min_indent_level:].rstrip()
            if (shifted_line[:1] == current_ws[:1]) and (current_ws[:1] != ws):
                # Converting remaining spaces/tabs if required
                shifted_line = shifted_line.replace(current_ws, ws)
            justified_lines.append(blk_indent + shifted_line)
        elif non_empty:
            # Ignore empty lines until after we encounter a non-empty line
            justified_lines.append(line)  # Empty line

    while len(justified_lines) < 2:
        # We want at least 2 lines in block
        justified_lines.append('')

    new_block = '\n'.join(justified_lines) + '\n'
    return new_block


def format_state_code_string(code_string, target_line_length, ws=' '):
    """Align code and avoid extra long lines."""
    # Helper function to split parameters correctly
    def split_parameters(line):
        parts = []
        current = ''
        inside_brackets = 0
        for char in line:
            if char in ('[', '(', '}'):
                inside_brackets += 1
            elif char in (']', ')', '}'):
                inside_brackets -= 1
            if char == ',' and inside_brackets == 0:
                parts.append(current.strip() + ',')
                current = ''
            else:
                current += char
        parts.append(current.strip())
        return parts

    # Find the opening parenthesis and split the line accordingly
    def format_line(line, ws):
        open_pos = min((line.find(char) for char in '([{'), key=lambda x: x if x != -1 else float('inf'))
        if open_pos == float('inf'):
            return [line.rstrip()]

        prepend = ws * (open_pos + 1)
        if ws == '\t':
            prepend = '\t' * ((len(prepend) - 1) // 4 + 1)

        prefix = line[:open_pos + 1]
        suffix = line[open_pos + 1:]

        parameters = split_parameters(suffix)
        formatted_parts = [prefix + parameters[0]]
        for param in parameters[1:]:
            formatted_parts.append(prepend + param)
        return formatted_parts

    lines = code_string.strip().split('\n')
    formatted_lines = []

    for line in lines:
        if len(line) > target_line_length and any([char in line for char in '({[<']):
            formatted_lines.extend(format_line(line, ws[:1]))
        else:
            formatted_lines.append(line.rstrip())

    code_text = '\n'.join(formatted_lines)
    return code_text


def break_long_line(text, max_length=80):
    """Break long lines in description text."""
    if (len(text) <= max_length):
        return [text]

    prefix = ''
    for i, char in enumerate(text):
        if not char.isspace():
            prefix = text[:i]
            break

    words = text.strip().split(' ')
    line = ''
    result = ''
    for word in words:
        if len(line) + len(word) + 1 > max_length:
            if len(line) == 0:
                # If the word itself is longer than max_length, break the word
                while len(word) > max_length:
                    result += word[:max_length] + '\n'
                    word = word[max_length:]
                line = prefix + word + ' '
            else:
                # Otherwise, add the line to the result and start a new line
                result += line.rstrip() + '\n'
                line = prefix + word + ' '
        else:
            line += word + ' '

    result += line.rstrip()  # Add the last line
    return result.split('\n')
