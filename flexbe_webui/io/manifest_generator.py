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

"""Manifest generator."""

import re

from flexbe_webui.tools import break_long_line


class ManifestGenerator:
    """Manifest generator."""

    def __init__(self, ws='\t'):
        """Initialzie ManifestGenerator."""
        self.ws = ws

    def set_white_space(self, _ws):
        """Set white space."""
        self.ws = _ws

    def generate_manifest_header(self, rosnode_name, file_name, behavior_name, tags, author, date, desc):
        """Generate manifest header."""
        content = ''

        file_name = re.sub(r'.py$', '', file_name)
        class_name = re.sub(r'[^\w]', '', behavior_name) + 'SM'

        content += self.ws + '<executable package_path="' + rosnode_name + '.'
        content += file_name + '" class="' + class_name + '" />\n'
        content += self.ws + '<tagstring>' + tags + '</tagstring>\n'
        content += self.ws + '<author>' + author + '</author>\n'
        content += self.ws + '<date>' + date + '</date>\n'
        content += self.ws + '<description>\n'
        for line in desc.split('\n'):
            split_lines = break_long_line(line.rstrip())
            for line2 in split_lines:
                content += self.ws + self.ws + line2.rstrip() + '\n'
        content += self.ws + '</description>\n'
        content += '\n'

        return content

    def generate_manifest_contains(self, behavior_names):
        """Generate manifest contains."""
        content = self.ws + '<!-- Contained Behaviors -->\n'

        for name in behavior_names:
            content += self.ws + '<contains name="' + name + '" />\n'

        return content

    def generate_manifest_parameters(self, params):
        """Generate manifest parameters."""
        content = self.ws + '<!-- Available Parameters -->\n'
        if len(params) == 0:
            return content

        content += self.ws + '<params>\n'

        for param in params:
            content += '\n'
            # print(param)
            # print(param['type'])
            content += self.ws + self.ws + '<param type="' + param['type']
            content += '" name="' + param['name']
            content += '" default="' + param['default']
            content += '" label="' + param['label']
            content += '" hint="' + param['hint']
            content += '"'
            if param['type'] == 'enum':
                content += '>\n'
                for add_param in param['additional']:
                    content += self.ws + self.ws + self.ws + '<option value="' + add_param + '" />\n'
                content += self.ws + self.ws + '</param>\n'
            elif param['type'] == 'numeric':
                content += '>\n'
                content += self.ws + self.ws + self.ws + '<min value="' + str(param['additional']['min']) + '" />\n'
                content += self.ws + self.ws + self.ws + '<max value="' + str(param['additional']['max']) + '" />\n'
                content += self.ws + self.ws + '</param>\n'
            elif param['type'] == 'yaml':
                content += '>\n'
                content += self.ws + self.ws + self.ws + '<key name="' + param['additional']['key'] + '" />\n'
                content += self.ws + self.ws + '</param>\n'
            else:
                content += ' />\n'

        content += '\n'
        content += self.ws + '</params>\n'
        content += '\n'

        return content


def generate_file_name(behavior_name):
    """Generate file name."""
    behavior_name = behavior_name.lower()
    return re.sub(r'[^\w]', '_', behavior_name) + '_sm.py'


def generate_manifest_name(behavior_name):
    """Generate manifest name."""
    behavior_name = behavior_name.lower()
    return re.sub(r'[^\w]', '_', behavior_name) + '.xml'
