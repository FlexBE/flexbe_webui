# FlexBE State and Behavior Discovery

The WebUI scans ROS packages by reading `package.xml` export tags.

## State Packages

A package is treated as a FlexBE state package if `package.xml` includes:

```xml
<package>
  ...
  <export>
    <flexbe_states />
  </export>
  ...
</package>
```

It should provide Python class definitions per FlexBE state conventions.

Example:

- https://github.com/FlexBE/flexbe_behavior_engine/tree/ros2-devel/flexbe_states

## Behavior Packages

A package is treated as a FlexBE behavior package if `package.xml` includes:

```xml
<package>
  ...
  <export>
    <flexbe_behaviors />
  </export>
  ...
</package>
```

Expected layout:

- `manifest/` folder with behavior manifests
- Python module/package containing generated behavior code

## Symlink Installs

ROS workspaces built with `--symlink-install` are supported. The behavior and
state parsers follow directory symlinks so the WebUI can load source files
through the installed package layout.

To avoid recursive symlink cycles, the parsers track each visited directory by
its real path. If another path resolves to a directory that has already been
parsed, that branch is skipped.
