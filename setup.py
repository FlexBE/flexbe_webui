"""Setup for flexbe_webui module."""

import os
from collections import defaultdict
from glob import glob

from setuptools import setup

PACKAGE_NAME = 'flexbe_webui'


def app_data_files(app_root):
    """Find all app JavaScript files."""
    data_files = defaultdict(list)
    for path, _, files in os.walk(os.path.join(PACKAGE_NAME, app_root)):
        for file in files:
            data_files[
                os.path.join('share', path)
            ].append(os.path.join(path, file))
    return list(data_files.items())


setup(
    name=PACKAGE_NAME,
    version='4.0.0',
    packages=[
        PACKAGE_NAME,
        PACKAGE_NAME + '.io',
        PACKAGE_NAME + '.ros',
    ],
    data_files=[
        ('share/ament_index/resource_index/packages',
            ['resource/' + PACKAGE_NAME]),
        ('share/' + PACKAGE_NAME, ['package.xml']),
        ('share/' + PACKAGE_NAME + '/launch', glob('launch/*.launch.py')),
        ('share/' + PACKAGE_NAME + '/config', glob('config/*.json'))
    ] + app_data_files('app'),
    install_requires=[
        'setuptools',
        'websockets>=10.3',
        'pydantic>=1.10.13',
        'fastAPI==0.89.1',
        'PySide6>=6.7.1'
    ],
    zip_safe=True,
    author='CNU Robotics',
    author_email='robotics@cnu.edu',
    url='https://github.com/flexbe/flexbe_webui',
    maintainer='David Conner',
    maintainer_email='robotics@cnu.edu',
    keywords=['ros2', 'flexbe', 'ocs'],
    classifiers=[
        'Intended Audience :: Developers',
        'License :: Apache 2.0',
        'Programming Language :: Python',
        'Topic :: Software Development',
    ],
    description='FlexBE WebUI - Operator Control Station interface to onboard Flexible Behavior Engine.',
    license='Apache 2.0',
    tests_require=['pytest'],
    entry_points={
        'console_scripts': [
            'webui_node = flexbe_webui.webui_node:main',
            'webui_server = flexbe_webui.webui_server:main',
            'webui_client = flexbe_webui.webui_client:main',
        ],
    },
)
