# Security policy

## Supported versions

Security fixes are applied to the latest release on `main`.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting feature instead of opening a public issue. Include reproduction steps, affected routes or components, and the expected impact.

## Native execution warning

Caraml can execute user-provided OCaml code. Native execution is therefore disabled by default in production. Do not enable `CARAML_ENABLE_NATIVE_EXECUTION` on a public deployment unless the entire service is isolated with strict filesystem, network, process, CPU, and memory controls.
