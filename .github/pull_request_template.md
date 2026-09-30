## Merge gate

- [ ] This PR is a vertical implementation or a targeted repair.
- [ ] CI is green on the PR merge ref.
- [ ] The base branch has not changed after the successful CI run, or CI was rerun.
- [ ] I checked the final diff for unintended file deletions/renames.
- [ ] If this changes auth, database, or deployment behavior, I verified the affected path explicitly.

### Merge rule

Do not merge when CI is red, pending, stale, or missing. After merge, verify the new `main` SHA has its own green CI run before starting the next vertical.
