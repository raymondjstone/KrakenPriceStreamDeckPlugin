import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import path from "node:path";
import url from "node:url";

const isWatching = !!process.env.ROLLUP_WATCH;
const sdPlugin = "com.raymond.krakenprice.sdPlugin";

/**
 * @type {import('rollup').RollupOptions}
 */
const config = {
  input: "src/plugin.ts",
  output: {
    file: `${sdPlugin}/bin/plugin.js`,
    format: "cjs",           // Stream Deck Node.js plugins use CommonJS
    sourcemap: isWatching,
    sourcemapPathTransform: (relativeSourcePath, sourcemapPath) => {
      return url.pathToFileURL(
        path.resolve(path.dirname(sourcemapPath), relativeSourcePath)
      ).href;
    },
  },
  plugins: [
    {
      // Emit a message when a build completes, useful in watch mode
      name: "watch-externals",
      buildStart() {
        if (isWatching) {
          this.addWatchFile(`${sdPlugin}/manifest.json`);
        }
      },
    },
    typescript({
      mapRoot: isWatching ? "./" : undefined,
    }),
    nodeResolve({
      exportConditions: ["node"],
      resolveOnly: [/^(?!node:)/],
    }),
    commonjs(),
  ],
  external: ["node:*"],  // keep Node built-ins external
};

export default config;
