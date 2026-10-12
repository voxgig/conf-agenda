<!-- One `##` group is one PR and one apply session. A group ends with its Gate
     task. A later group stacks on the branch before it. -->

## 1. <!-- group name (PR 1, `<branch>` from `main`) -->

- [ ] 1.1 <!-- what changes, where. --> verify: <!-- the exact command, test name or observable. "Tests pass" is not a verification path. -->
- [ ] 1.2 <!-- ... --> verify: <!-- ... -->
- [ ] 1.3 Gate. verify: `cd backend && npm run build && npm test && npm run model-check` green, every other touched package's suite green, and `openspec validate --all --strict` passes

## 2. <!-- group name (PR 2, stacked on PR 1) -->

- [ ] 2.1 <!-- ... --> verify: <!-- ... -->
- [ ] 2.2 Gate. verify: <!-- as above, for the packages this group touches -->
