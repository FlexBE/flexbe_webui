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

