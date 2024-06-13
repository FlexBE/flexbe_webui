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

"""Behavior parser."""

import importlib.util
import os
import sys
from typing import List, Optional
from xml.etree import ElementTree as ET

from . import BehaviorDefinition, ParameterDefinition


def parse_behavior_folder(folder: str, base_path: str,
                          editable: bool,
                          encoding: str) -> List[BehaviorDefinition]:
    """Parse behavior folder."""
    # print(f'Parsing behavior folder {folder} from {base_path} ...', flush=True)

    behavior_defs = []
    for file_name in os.listdir(folder):
        file_path = os.path.join(folder, file_name)
        if os.path.isdir(file_path):
            # Recurse into subfolder
            behavior_defs.extend(parse_behavior_folder(file_path, base_path, editable, encoding))
            continue

        try:
            name, ext = os.path.splitext(file_name)

            # if file_name.endswith('_manifest.py') and not file_name.startswith('#'):

            if ext == '.xml' and not name.startswith('#'):
                if name == 'package':
                    continue

                try:
                    behavior = parse_behavior_manifest_xml(file_path, base_path, editable, encoding)
                except Exception as exc:
                    print(f"Exception parsing behavior '{file_name}':\n{exc}", flush=True)
                    raise Exception(f"Error in '{file_path}") from exc

                if behavior is None:
                    continue
                # print(30*'=', '\nmanifest path=<', behavior.manifest_path, '>\n', 30*'=', flush=True)
                behavior_defs.append(behavior)
        except Exception as exc:
            print(f"\x1b[91mSkipping behavior '{name}' due to '{exc}'!\x1b[0m")
    return behavior_defs


def parse_behavior_manifest_py(file_path: str, python_path: str,
                               editable: bool, encoding: str) -> Optional[BehaviorDefinition]:
    """Parse behavior manifest."""
    try:
        _, module_name = os.path.split(file_path)
        module_name = module_name[:-len('.py')]

        spec = importlib.util.spec_from_file_location(module_name, file_path)
        module = importlib.util.module_from_spec(spec)
        sys.modules[module_name] = module
        spec.loader.exec_module(module)

        manifest = module.__dict__.get(module_name[:-len('_manifest')])

        package_path = manifest['executable']['package_path'].split('.')
        rosnode_name = package_path[0]
        codefile_name = package_path[-1]
        codefile_path = '.'.join(package_path[:-1])
        class_name = manifest['executable']['class']

        print(f'Parsing behavior python manifest {file_path} ...', flush=True)
        # print(f"    path='{codefile_path}' file='{codefile_name}' class='{class_name}'", flush=True)

        param_list = []
        contains_list = []

        code_file = os.path.join(codefile_path.replace('.', '/'), codefile_name + '.py')
        with open(os.path.join(os.path.dirname(python_path), code_file), 'r', encoding=encoding) as fin:
            codefile_content = fin.read()

        return BehaviorDefinition(
            name=manifest['name'],
            description=manifest.get('description', '').strip(),
            tags=manifest.get('tagstring', ''),
            author=manifest.get('description', ''),
            date=manifest.get('date'),
            rosnode_name=rosnode_name,
            codefile_name=codefile_name,
            codefile_path=codefile_path,
            codefile_content=codefile_content,
            class_name=class_name,
            manifest_path=file_path,
            editable=editable,
            params=param_list,
            contains=contains_list,
        )
    except Exception as exc:
        print(f"\x1b[91mError parsing '{file_path}' in '{python_path}' - skip!\x1b[0m")
        print(exc, flush=True)
        return None


def parse_behavior_manifest_xml(manifest_path: str,
                                python_path: str,
                                editable: bool,
                                encoding: str) -> Optional[BehaviorDefinition]:
    """Parse behavior manifest xml file."""
    try:
        # print(f"Parsing manifest at '{manifest_path}' ...", flush=True)
        manifest = ET.parse(manifest_path)
        manifest_xml = manifest.getroot()
        # behavior_xml = manifest_xml.find('behavior')
        behavior_xml = manifest_xml
        if behavior_xml is None:
            print(f'The file {manifest_path} is not a behavior - not XML root!', flush=True)
            return None
        if manifest_xml.tag != 'behavior':
            print(f'The file {manifest_path} is not a behavior!', flush=True)
            return None

        name = behavior_xml.attrib['name']
        description_xml = behavior_xml.find('description')
        description_raw = description_xml.text.strip() if description_xml.text is not None else ''
        # Keep the description lines left justified given indenting in manifest.xml
        description = '\n'.join([line.strip() for line in description_raw.split('\n')])
        tag_xml = behavior_xml.find('tagstring')
        tags = tag_xml.text.strip() if tag_xml.text is not None else ''
        author_xml = behavior_xml.find('author')
        author = author_xml.text.strip() if author_xml.text is not None else ''
        date_xml = behavior_xml.find('date')
        date = date_xml.text.strip() if date_xml.text is not None else None

        package_path = behavior_xml.find('executable').attrib['package_path'].split('.')
        rosnode_name = package_path[0]
        codefile_name = package_path[-1]
        codefile_path = python_path
        class_name = behavior_xml.find('executable').attrib['class']
        print(f'Parsing behavior xml manifest {manifest_path} ...', flush=True)
        # print(f"    path='{codefile_path}' file='{codefile_name}' class='{class_name}'", flush=True)

        if behavior_xml.findall('params') is not None:
            param_list = parse_manifest_xml_parameters(behavior_xml.findall('params'))
        else:
            param_list = []

        if behavior_xml.findall('contains') is not None:
            contains_list = parse_manifest_xml_contains(behavior_xml.findall('contains'))
        else:
            contains_list = []

        # code_file = os.path.join(codefile_path.replace('.', '/'), codefile_name + '.py')
        code_file = os.path.join(codefile_path, codefile_name + '.py')
        with open(code_file, 'r', encoding=encoding) as fin:
            codefile_content = fin.read()

        return BehaviorDefinition(
            name=name,
            description=description,
            tags=tags,
            author=author,
            date=date,
            rosnode_name=rosnode_name,
            codefile_name=codefile_name,
            codefile_path=codefile_path,
            codefile_content=codefile_content,
            class_name=class_name,
            manifest_path=manifest_path,
            editable=editable,
            params=param_list,
            contains=contains_list
        )
    except Exception as exc:
        print(f"\x1b[91mError parsing '{manifest_path}' - skip!\x1b[0m")
        print(exc, flush=True)
        return None


def parse_manifest_xml_parameters(params_xml):
    """Parse behavior manifest xml parameters."""
    params_list = []
    for params_element in params_xml:
        for element in params_element.findall('param'):
            try:
                additional = {}
                for elem in element:
                    additional[elem.tag] = elem.attrib['value']

                if len(additional) == 0:
                    additional = None

                params_list.append(ParameterDefinition(
                    type=element.attrib['type'],
                    name=element.attrib['name'],
                    default=element.attrib['default'],
                    label=element.attrib['label'],
                    hint=element.attrib['hint'],
                    additional=additional))
            except Exception as exc:
                print(f'\n\n****\nTODO - parse XML manifest parameters! {type(params_xml)}', flush=True)
                print(f'Error processing manifest_xml_parameters : {exc}')
                print(ET.tostring(element, encoding='utf8').decode('utf8'), flush=True)
                break
    return params_list


def parse_manifest_xml_contains(xml_elements):
    """Parse behavior manifest xml contains."""
    contains_list = []
    for element in xml_elements:
        try:
            contains_list.append(element.attrib['name'])
        except Exception as exc:
            print('\n\n****\nTODO - parse XML parse_manifest_xml_contains parameters! '
                  f'{type(xml_elements)}', flush=True)
            print(f'Error processing parse_manifest_xml_contains : {exc}')
            print(ET.tostring(element, encoding='utf8').decode('utf8'), flush=True)
            break
    return contains_list
