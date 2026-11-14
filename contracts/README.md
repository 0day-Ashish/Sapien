# contracts

Foundry package for HyperEVM testnet (chain 998). Owned by Lane A (see `docs/team-map.md`).

- `forge test` runs the contract seam. Tests install `CoreWriterStub` at the CoreWriter precompile address (`0x3333…3333`) and assert on the actions written to it.
- `git submodule update --init --recursive` after cloning, to fetch `forge-std`.
