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

"""Package handler."""

import importlib
import os
from typing import Dict
from xml.etree import ElementTree as ET

from ament_index_python import get_package_share_directory, get_packages_with_prefixes

from . import PackageData, PackageInfo


def get_packages() -> Dict[str, PackageData]:
    """Get all FlexBE enabled packages."""
    print('\x1b[94mGet list of all ROS packages on this system ...\x1b[0m', flush=True)
    ros_packages = get_packages_with_prefixes()
    packages = {}
    print(f'\x1b[94mParsing {len(ros_packages)} ROS packages looking for FlexBE states and behaviors ...\x1b[0m', flush=True)
    for name, path in ros_packages.items():
        # print(f'--> {name} ({path}) ...', flush=True)
        editable = os.access(path, os.W_OK)
        python_path = None
        try:
            python_path = importlib.import_module(name).__path__[-1]
        except Exception:
            editable = False
        try:
            pkg_data = PackageData(name=name, path=path, python_path=python_path, editable=editable)
            if has_behaviors(pkg_data) or has_states(pkg_data):
                print(f'--> {name} ({path}) is a FlexBE package!', flush=True)
                packages[name] = pkg_data
        except Exception as exc:
            print(f'  get_packages: ERROR for {name} ({path}) :'
                  f' {exc}', flush=True)
    print(f'\x1b[93mFound {len(packages)} FlexBE packages '
          f'on this system! ({len(ros_packages)} total ROS packages)\x1b[0m', flush=True)
    return packages


def parse_package(package_name: str) -> PackageInfo:
    """Parse package.xml file."""
    package_xml_path = os.path.join(get_package_share_directory(package_name), 'package.xml')
    manifest = ET.parse(package_xml_path)
    package_xml = manifest.getroot()
    # verify that the loaded manifest is the expected one
    name_xml = package_xml.find('name')
    if name_xml is None or name_xml.text != package_name:
        raise ValueError(f'Invalid package.xml content for {package_name}')
    # check export declarations
    has_states_ = package_xml.find('./export/flexbe_states') is not None
    has_behaviors_ = package_xml.find('./export/flexbe_behaviors') is not None
    return PackageInfo(name=package_name, has_states=has_states_, has_behaviors=has_behaviors_, package_xml_path=package_xml_path)


def has_behaviors(package: PackageData) -> bool:
    """Return true if package has FlexBE behaviors defined."""
    if package.package_info is None:
        package.package_info = parse_package(package.name)
    return package.package_info.has_behaviors


def has_states(package: PackageData) -> bool:
    """Return true if package has FlexBE states defined."""
    if package.package_info is None:
        package.package_info = parse_package(package.name)
    return package.package_info.has_states
