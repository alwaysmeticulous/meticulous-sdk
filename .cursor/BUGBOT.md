## Security

### Ensure all dependencies are fixed

We should ensure we are immune if the build system of someone we depend on gets comprimised. In particular they should not be able to publish or update a package and have our next CI run run that without us explictly bumping a version / hash. Please check that:

- Code change does not add any `npx`, `npm install`, `pnpm install`, `yarn install`, `docker pull`, `docker run` commands or similar commands that download and execute the latest version of something. If any such commands are required they should guarantee a fixed version _and_ fixed hash.
- Any external dependencies added to docker files should have their precise hash and version specified e.g. `image: nginx:1.27.0@sha256:...` not `nginx:1.27.0` and certainly not `nginx:latest`.
