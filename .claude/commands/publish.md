Publish a new version of claude-agentflow to npm.

## Steps

1. Run `npm run build` and confirm it succeeds
2. Run `npm version $ARGUMENTS` to bump the version (user passes `patch`, `minor`, or `major` as the argument — default to `patch` if no argument given)
3. Run `npm publish` to publish to npm
4. Run `git push && git push --tags` to push the version commit and tag
5. Print the new version number and the npm URL: https://www.npmjs.com/package/claude-agentflow
