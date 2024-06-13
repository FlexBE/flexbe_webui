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

"""Initialization of flexbe_webui.ros module."""

from typing import Optional

from pydantic import BaseModel


class PackageInfo(BaseModel):
    """Class to store manifest data."""

    name: str
    has_states: bool
    has_behaviors: bool
    package_xml_path: Optional[str] = None

    def __str__(self):
        """Return string with package.xml information."""
        string = f'Package: {self.name} (states: {self.has_states}, '
        string += f' behaviors: {self.has_behaviors})'
        string += f' {self.package_xml_path}\n'
        return string

    @classmethod
    def from_dict(cls, data: dict):
        """Create an instance from a dictionary."""
        return cls.model_validate(data)


class PackageData(BaseModel):
    """Class to store package data."""

    name: str
    path: str
    python_path: Optional[str] = None
    editable: bool
    package_info: Optional[PackageInfo] = None

    def __str__(self):
        """Return string with package information."""
        string = f'Package: {self.name}\n'
        string += f'    Package path: {self.path}\n'
        string += f'    Code path: {self.python_path}\n'
        string += f'    Editable : {self.editable}\n'
        string += f'    Package info : {self.package_info}\n'
        return string

    @classmethod
    def from_dict(cls, data: dict):
        """Create an instance from a dictionary."""
        return cls.model_validate(data)
