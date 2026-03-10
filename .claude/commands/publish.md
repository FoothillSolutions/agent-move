Publish a new version of agent-move to npm.

## Steps

1. Run `npm run build` and confirm it succeeds
2. Run `npm version $ARGUMENTS` to bump the version (user passes `patch`, `minor`, or `major` as the argument — default to `patch` if no argument given)
3. Run `git push && git push --tags` to push the version commit and tag to GitHub
4. Print the new version number and these links:
   - npm: https://www.npmjs.com/package/@foothill/agent-move
   - GitHub Actions will handle `npm publish` and create the GitHub Release automatically
