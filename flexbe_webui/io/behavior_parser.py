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

import ast
import os
from typing import List, Optional, Set
from xml.etree import ElementTree as ET

from . import BehaviorDefinition, ContainsEntry, ParameterDefinition


_CONTAINER_CLASS_NAMES = {'OperatableStateMachine', 'ConcurrencyContainer', 'PriorityContainer'}


def _is_behavior_base(base_node: ast.AST) -> bool:
    """Return True when the AST node names a Behavior base class."""
    if isinstance(base_node, ast.Name):
        return base_node.id == 'Behavior'
    if isinstance(base_node, ast.Attribute):
        return base_node.attr == 'Behavior'
    return False


def _is_container_call(call_node: ast.AST) -> bool:
    """Return True when the AST node calls a supported state machine container constructor."""
    if not isinstance(call_node, ast.Call):
        return False
    if isinstance(call_node.func, ast.Name):
        return call_node.func.id in _CONTAINER_CLASS_NAMES
    if isinstance(call_node.func, ast.Attribute):
        return call_node.func.attr in _CONTAINER_CLASS_NAMES
    return False


def _collect_bindings(nodes: list[ast.AST]) -> dict[str, ast.AST]:
    """Collect simple name bindings from assignment statements in source order."""
    bindings = {}
    for node in sorted(nodes, key=lambda child: getattr(child, 'lineno', -1)):
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    bindings[target.id] = node.value
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name) and node.value is not None:
            bindings[node.target.id] = node.value
    return bindings


def _resolve_string_literal(node: ast.AST, bindings: dict[str, ast.AST], seen: Optional[set[str]] = None) -> Optional[str]:
    """Resolve a string literal or simple named indirection to a Python string."""
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value

    if isinstance(node, ast.Name):
        seen = set() if seen is None else seen
        if node.id in seen or node.id not in bindings:
            return None
        seen.add(node.id)
        return _resolve_string_literal(bindings[node.id], bindings, seen)

    return None


def _resolve_string_list(node: ast.AST, bindings: dict[str, ast.AST], seen: Optional[set[str]] = None) -> Optional[list[str]]:
    """Resolve a list/tuple of strings or a simple named indirection to one."""
    if isinstance(node, (ast.List, ast.Tuple, ast.Set)):
        values = []
        for elt in node.elts:
            resolved = _resolve_string_literal(elt, bindings, seen)
            if resolved is None:
                return None
            values.append(resolved)
        return values

    if isinstance(node, ast.Name):
        seen = set() if seen is None else seen
        if node.id in seen or node.id not in bindings:
            return None
        seen.add(node.id)
        return _resolve_string_list(bindings[node.id], bindings, seen)

    if (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id in {'list', 'tuple'}
        and len(node.args) == 1
    ):
        return _resolve_string_list(node.args[0], bindings, seen)

    return None


def _resolve_executable_python_path(package_path: str, python_path: str) -> tuple[str, str, str]:
    """Resolve the containing directory, module name, and relative module path for a manifest executable path."""
    package_parts = package_path.split('.')
    if len(package_parts) < 2:
        raise ValueError(f"Invalid executable package_path '{package_path}'")

    module_name = package_parts[-1]
    relative_parts = package_parts[1:-1]
    codefile_path = os.path.join(python_path, *relative_parts) if len(relative_parts) > 0 else python_path
    codefile_relpath = os.path.join(*relative_parts, module_name) if len(relative_parts) > 0 else module_name
    return codefile_path, module_name, codefile_relpath


def parse_behavior_interface(code: str, class_name: Optional[str] = None) -> dict:
    """Extract outcomes, input_keys, output_keys from a behavior Python class using AST."""
    result = {'smi_outcomes': [], 'smi_input': [], 'smi_output': []}
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return result

    module_bindings = _collect_bindings(tree.body)

    for node in ast.walk(tree):
        if not isinstance(node, ast.ClassDef):
            continue
        if class_name is not None and node.name != class_name:
            continue
        # Look for class that inherits from Behavior
        if not any(_is_behavior_base(base) for base in node.bases):
            continue
        for item in node.body:
            if not (isinstance(item, ast.FunctionDef) and item.name == 'create'):
                continue
            create_nodes = list(ast.walk(item))
            bindings = module_bindings.copy()
            bindings.update(_collect_bindings(create_nodes))

            # Collect all return statements that resolve to a container call, then pick
            # the last one by line number. Guard returns (reconfiguration, early-exit)
            # appear at the top of create(); the canonical return is always last.
            # If a behavior ever has its canonical return inside a conditional
            # branch, this loop should be restructured to iterate item.body
            # directly, descend only into `with` blocks, and ignore returns
            # nested inside if/try/for statements.
            best_result = None
            best_lineno = -1
            for child in sorted(create_nodes, key=lambda current: getattr(current, 'lineno', -1)):
                if not isinstance(child, ast.Return) or child.value is None:
                    continue

                root_value = child.value
                if isinstance(root_value, ast.Name):
                    root_value = bindings.get(root_value.id)
                if not _is_container_call(root_value):
                    continue

                candidate = {'smi_outcomes': [], 'smi_input': [], 'smi_output': []}
                for kw in root_value.keywords:
                    if kw.arg not in {'outcomes', 'input_keys', 'output_keys'}:
                        continue
                    resolved = _resolve_string_list(kw.value, bindings)
                    if resolved is None:
                        continue
                    if kw.arg == 'outcomes':
                        candidate['smi_outcomes'] = resolved
                    elif kw.arg == 'input_keys':
                        candidate['smi_input'] = resolved
                    elif kw.arg == 'output_keys':
                        candidate['smi_output'] = resolved
                lineno = getattr(child, 'lineno', -1)
                if lineno > best_lineno:
                    best_lineno = lineno
                    best_result = candidate
            if best_result is not None:
                return best_result
    return result


def parse_behavior_folder(folder: str, base_path: str,
                          editable: bool,
                          encoding: str,
                          errors: Optional[List[str]] = None,
                          _visited: Optional[Set[str]] = None) -> List[BehaviorDefinition]:
    """Parse behavior folder."""
    # print(f'Parsing behavior folder {folder} from {base_path} ...', flush=True)

    behavior_defs = []
    real_folder = os.path.realpath(folder)
    if _visited is None:
        _visited = set()
    if real_folder in _visited:
        return behavior_defs
    _visited.add(real_folder)

    for file_name in os.listdir(folder):
        file_path = os.path.join(folder, file_name)
        if os.path.isdir(file_path):
            # Recurse into subfolder
            behavior_defs.extend(parse_behavior_folder(file_path, base_path, editable, encoding, errors, _visited))
            continue

        try:
            name, ext = os.path.splitext(file_name)

            # if file_name.endswith('_manifest.py') and not file_name.startswith('#'):

            if ext == '.xml' and not name.startswith('#'):
                if name == 'package':
                    continue

                behavior = parse_behavior_manifest_xml(file_path, base_path, editable, encoding)

                if behavior is None:
                    continue
                # print(30*'=', '\nmanifest path=<', behavior.manifest_path, '>\n', 30*'=', flush=True)
                behavior_defs.append(behavior)
        except (OSError, ValueError, TypeError, KeyError, ET.ParseError, AttributeError) as exc:
            print(f"\x1b[91mSkipping behavior '{name}' due to '{exc}'!\x1b[0m")
            if errors is not None:
                errors.append(f"Skipped behavior '{name}' in '{folder}': {exc}")
    return behavior_defs


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
        description_raw = description_xml.text.strip() if description_xml is not None and description_xml.text is not None else ''
        # Keep the description lines left justified given indenting in manifest.xml
        description = '\n'.join([line.strip() for line in description_raw.split('\n')])
        tag_xml = behavior_xml.find('tagstring')
        tags = tag_xml.text.strip() if tag_xml is not None and tag_xml.text is not None else ''
        author_xml = behavior_xml.find('author')
        author = author_xml.text.strip() if author_xml is not None and author_xml.text is not None else ''
        date_xml = behavior_xml.find('date')
        date = date_xml.text.strip() if date_xml is not None and date_xml.text is not None else None

        package_path = behavior_xml.find('executable').attrib['package_path']
        rosnode_name = package_path.split('.')[0]
        codefile_path, codefile_name, codefile_relpath = _resolve_executable_python_path(package_path, python_path)
        class_name = behavior_xml.find('executable').attrib['class']
        print(f'Parsing behavior xml manifest {manifest_path} ...', flush=True)
        # print(f"    path='{codefile_path}' file='{codefile_name}' class='{class_name}'", flush=True)

        param_list = parse_manifest_xml_parameters(behavior_xml.findall('params'))
        contains_list = parse_manifest_xml_contains(behavior_xml.findall('contains'))

        # Read the source file now to populate smi_outcomes/smi_input/smi_output so the
        # frontend behavior library has outcome and key data without a separate round-trip.
        # A missing or unreadable file produces empty interface data (behavior still listed).
        # code_file = os.path.join(codefile_path.replace('.', '/'), codefile_name + '.py')
        code_file = os.path.join(codefile_path, codefile_name + '.py')
        try:
            with open(code_file, 'r', encoding=encoding) as fin:
                codefile_content = fin.read()
            ifc = parse_behavior_interface(codefile_content, class_name)
        except OSError:
            print(f'\x1b[93m  Source file not readable for "{name}" at "{code_file}"'
                  f' — interface data unavailable\x1b[0m', flush=True)
            ifc = {'smi_outcomes': [], 'smi_input': [], 'smi_output': []}

        return BehaviorDefinition(
            name=name,
            description=description,
            tags=tags,
            author=author,
            date=date,
            rosnode_name=rosnode_name,
            codefile_name=codefile_name,
            codefile_path=codefile_path,
            codefile_relpath=codefile_relpath,
            codefile_content='',   # omitted from lightweight manifest; fetch on demand
            class_name=class_name,
            manifest_path=manifest_path,
            editable=editable,
            params=param_list,
            contains=contains_list,
            smi_outcomes=ifc['smi_outcomes'],
            smi_input=ifc['smi_input'],
            smi_output=ifc['smi_output'],
        )
    except (ValueError, TypeError, KeyError, ET.ParseError, AttributeError) as exc:
        print(f"\x1b[91mError parsing '{manifest_path}' - skip!\x1b[0m")
        print(exc, flush=True)
        raise ValueError(f"Error parsing '{manifest_path}': {exc}") from exc


def parse_manifest_xml_parameters(params_xml):
    """Parse behavior manifest xml parameters."""
    params_list = []
    for params_element in params_xml:
        for element in params_element.findall('param'):
            try:
                param_type = element.attrib['type']
                param_name = element.attrib['name']
                additional = None

                if param_type == 'enum':
                    additional = []
                    for elem in element:
                        if elem.tag != 'option':
                            raise ValueError(
                                f"enum parameter '{param_name}' has unexpected metadata element '{elem.tag}'"
                            )
                        option_value = elem.attrib.get('value')
                        if option_value is None:
                            raise ValueError(
                                f"enum parameter '{param_name}' has option without required 'value' metadata"
                            )
                        additional.append(option_value)
                elif param_type == 'numeric':
                    additional = {}
                    for elem in element:
                        if elem.tag not in {'min', 'max'}:
                            raise ValueError(
                                f"numeric parameter '{param_name}' has unexpected metadata element '{elem.tag}'"
                            )
                        bound_value = elem.attrib.get('value')
                        if not bound_value:
                            raise ValueError(
                                f"numeric parameter '{param_name}' is missing required '{elem.tag}' value"
                            )
                        additional[elem.tag] = bound_value

                    if additional.get('min') is None or additional.get('max') is None:
                        raise ValueError(
                            f"numeric parameter '{param_name}' is missing required 'min'/'max' metadata"
                        )
                elif param_type == 'yaml':
                    additional = {'key': None}
                    for elem in element:
                        if elem.tag != 'key':
                            raise ValueError(
                                f"yaml parameter '{param_name}' has unexpected metadata element '{elem.tag}'"
                            )
                        additional['key'] = elem.attrib.get('name')

                params_list.append(ParameterDefinition(
                    type=param_type,
                    name=param_name,
                    default=element.attrib['default'],
                    label=element.attrib['label'],
                    hint=element.attrib['hint'],
                    additional=additional))
            except (TypeError, ValueError, KeyError, AttributeError) as exc:
                print(f'Failed to parse XML manifest parameter entry: {exc}', flush=True)
                print(ET.tostring(element, encoding='utf8').decode('utf8'), flush=True)
                raise ValueError(
                    f"invalid manifest parameter '{element.attrib.get('name', '<unknown>')}': {exc}"
                ) from exc
    return params_list


def parse_manifest_xml_contains(xml_elements):
    """Parse behavior manifest xml contains."""
    contains_list = []
    for element in xml_elements:
        try:
            contains_list.append(ContainsEntry(
                name=element.attrib['name'],
                package=element.attrib.get('package') or None,
            ))
        except (TypeError, ValueError, KeyError, AttributeError) as exc:
            print(f'Failed to parse XML manifest contains entry: {exc}', flush=True)
            print(ET.tostring(element, encoding='utf8').decode('utf8'), flush=True)
            continue
    return contains_list
