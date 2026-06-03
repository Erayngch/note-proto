import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    dts: {
      tsgo: true,
    },
    exports: true,
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {},
  run: {
    tasks: {
      check: {
        cache: true,
        command: "vp check --fix",
      },
      pack: {
        dependsOn: ["core#pack"],
        command: "vp pack",
      },
    },
  },
});
