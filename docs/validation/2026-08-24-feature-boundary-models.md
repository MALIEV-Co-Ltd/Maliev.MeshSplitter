# Feature- and Color-Boundary Model Validation

Date: 2026-08-24

Third-party binaries were downloaded to a temporary directory and were not
committed. The reusable runner is `frontend/scripts/validate-external-models.mjs`.

## Sources and licenses

| Model | Source revision | License | SHA-256 |
| --- | --- | --- | --- |
| `male02.obj` + `male02.mtl` | Three.js examples, `cbba126004263d0c32d3d6d05a4fe218d261fa47` | MIT | OBJ `6E521DCEB9CF5B0D9B375C607364F23C7A9DB7D56A135F2A74C2DA698B7671B3`; MTL `A1D2F6DF681197208221B74E6C32D74207A38FB84119ED55452998ED24B0E8CE` |
| `WaltHead.obj` + `WaltHead.mtl` | Three.js examples, `cbba126004263d0c32d3d6d05a4fe218d261fa47` | MIT | OBJ `B8276CA88369AF967A2329792C9C3DF202CE8C02612790FF3842EBA3D0DD44B5`; MTL `009C8B613BEF2575D392B362D0FFD75811D899473FBD09EA20B5858024687724` |
| `turkey.3mf`, `kuwait.3mf`, `watchful-owl.3mf` | `SamiSalah221/3mf-to-glb`, `dd880ac841c3527f54eb9e6ab7ac43a21e108db4` | MIT; fixtures authored by that repository's author | Turkey `C6D63975D1850FD23DE9E468FCFFB39FA72A4CDE37BD288DCD41EC3B3DDE13A2`; Kuwait `09E1AE5F4C9FB0E90A3393821BB7312EEB4AB10D1C1FBF439EF863C7C6EBABBB`; owl `9139B549A97927BF7A14FCDCD6DF761BC435AF70C03C0D31881E7D855142088A` |
| Core/material conformance samples | `3MFConsortium/3mf-samples`, `665e20dc4d7777fd4c9702bca86a2d4028440337` | BSD-2-Clause | Generated/small files used for parser comparison; not committed |

Source pages:

- https://github.com/mrdoob/three.js/tree/dev/examples/models/obj
- https://github.com/SamiSalah221/3mf-to-glb/tree/master/samples
- https://github.com/3MFConsortium/3mf-samples

## Results

| Model | Triangles | Import | Regions | Feature candidates | Color candidates | Runtime |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| `male02.obj` + MTL | 5,004 | Pass | 5 material colors | 0 | 0 | 71 ms |
| `WaltHead.obj` + MTL | 16,160 | Pass | 1 color | 0 | unavailable | 98 ms |
| `turkey.3mf` | 229,560 | Pass | 1 standard color | 0 | unavailable | 11,297 ms |
| `kuwait.3mf` | 161,080 | Pass | 1 standard color | 0 | unavailable | 9,686 ms |
| `watchful-owl.3mf` | n/a | Rejected safely | n/a | n/a | n/a | 53 ms preflight |

The two realistic human OBJ models are deliberate negative cases: their
triangulation does not contain a safe, closed, non-branching sharp-edge loop, so
the application offers no split rather than guessing a neck or limb. `male02`
also demonstrates that several material colors do not automatically constitute
a valid split unless their shared border is a closed surface loop.

The Bambu/Orca fixtures store painted filament assignments in vendor metadata,
not in standard 3MF base-material or color-group triangle properties. This
release does not reinterpret that vendor paint metadata, so color-boundary mode
stays disabled instead of presenting a false boundary. Standard 3MF
base-material regions and OBJ/MTL regions are covered by real zipped parser
tests in `meshImport.test.js`.

`watchful-owl.3mf` is 19,481,521 bytes compressed and 123,581,973 bytes expanded.
The first unrestricted validation reproduced a Node heap exhaustion. The final
implementation inspects the ZIP central directory and rejects expanded 3MF
archives over 64 MiB before Three.js builds a DOM, returning an actionable
model-only/simplification message.

## Positive end-to-end geometry fixture

`featureWorkflow.test.js` constructs a watertight, subdivided colored solid and
runs the complete local production path:

1. detects its closed color boundary;
2. partitions and caps both sides;
3. verifies both parts with Manifold WASM;
4. estimates PLA handling mass at `1.24 g/cm3`;
5. resolves a geometry-capped alignment size;
6. cuts symmetric tapered pockets; and
7. creates a separate double-ended square-taper plug.

The test produced two parts and one plug; all three returned `NoError` from the
authoritative Manifold WASM check. Separate synthetic tests cover positive sharp
feature loops, open/branched rejection, deterministic ranking, thin-wall
clamping, no-safe-fit rejection, and stable export identity.
