# OSTEP homework: web version

The [OSTEP textbook](https://pages.cs.wisc.edu/~remzi/OSTEP/) (_Operating Systems: Three Easy Pieces_) has accompanying "homeworks," which are small programs associated with various chapters that illustrate the concepts, often in the form of simulators.

This is a port of the [OSTEP homework](https://github.com/remzi-arpacidusseau/ostep-homework) code to the web.

The port was generated almost entirely by Claude Code, using Opus 4.6.

## Developing

We use `bun`:

```sh
bun install
bun run dev   # dev server
bun run build # production build
```

The core logic of each homework is written in TypeScript (with tests checking that it matches the original Python code from ostep-homework). The web UI part is written in Svelte and Tailwind CSS.
