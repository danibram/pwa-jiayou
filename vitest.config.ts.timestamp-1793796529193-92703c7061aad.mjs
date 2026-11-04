// vitest.config.ts
import solid from "file:///Users/dbr/htdocs/pwa-jiayou-next/node_modules/vite-plugin-solid/dist/esm/index.mjs";
import { defineConfig } from "file:///Users/dbr/htdocs/pwa-jiayou-next/node_modules/vitest/dist/config.js";
var vitest_config_default = defineConfig({
  plugins: [solid()],
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    globals: true,
    environment: "jsdom",
    setupFiles: "./tests/setup.ts",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "tests/",
        "*.config.ts",
        "*.config.js",
        "dist/"
      ]
    }
  },
  resolve: {
    conditions: ["development", "browser"]
  }
});
export {
  vitest_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZXN0LmNvbmZpZy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiY29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2Rpcm5hbWUgPSBcIi9Vc2Vycy9kYnIvaHRkb2NzL3B3YS1qaWF5b3UtbmV4dFwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL1VzZXJzL2Rici9odGRvY3MvcHdhLWppYXlvdS1uZXh0L3ZpdGVzdC5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL1VzZXJzL2Rici9odGRvY3MvcHdhLWppYXlvdS1uZXh0L3ZpdGVzdC5jb25maWcudHNcIjtpbXBvcnQgc29saWQgZnJvbSAndml0ZS1wbHVnaW4tc29saWQnO1xuaW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZXN0L2NvbmZpZyc7XG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XG4gICAgcGx1Z2luczogW3NvbGlkKCldLFxuICAgIHRlc3Q6IHtcbiAgICAgICAgaW5jbHVkZTogWyd0ZXN0cy8qKi8qLnRlc3Que3RzLHRzeH0nXSxcbiAgICAgICAgZ2xvYmFsczogdHJ1ZSxcbiAgICAgICAgZW52aXJvbm1lbnQ6ICdqc2RvbScsXG4gICAgICAgIHNldHVwRmlsZXM6ICcuL3Rlc3RzL3NldHVwLnRzJyxcbiAgICAgICAgY292ZXJhZ2U6IHtcbiAgICAgICAgICAgIHByb3ZpZGVyOiAndjgnLFxuICAgICAgICAgICAgcmVwb3J0ZXI6IFsndGV4dCcsICdqc29uJywgJ2h0bWwnXSxcbiAgICAgICAgICAgIGV4Y2x1ZGU6IFtcbiAgICAgICAgICAgICAgICAnbm9kZV9tb2R1bGVzLycsXG4gICAgICAgICAgICAgICAgJ3Rlc3RzLycsXG4gICAgICAgICAgICAgICAgJyouY29uZmlnLnRzJyxcbiAgICAgICAgICAgICAgICAnKi5jb25maWcuanMnLFxuICAgICAgICAgICAgICAgICdkaXN0LycsXG4gICAgICAgICAgICBdLFxuICAgICAgICB9LFxuICAgIH0sXG4gICAgcmVzb2x2ZToge1xuICAgICAgICBjb25kaXRpb25zOiBbJ2RldmVsb3BtZW50JywgJ2Jyb3dzZXInXSxcbiAgICB9LFxufSk7XG5cbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBeVIsT0FBTyxXQUFXO0FBQzNTLFNBQVMsb0JBQW9CO0FBRTdCLElBQU8sd0JBQVEsYUFBYTtBQUFBLEVBQ3hCLFNBQVMsQ0FBQyxNQUFNLENBQUM7QUFBQSxFQUNqQixNQUFNO0FBQUEsSUFDRixTQUFTLENBQUMsMEJBQTBCO0FBQUEsSUFDcEMsU0FBUztBQUFBLElBQ1QsYUFBYTtBQUFBLElBQ2IsWUFBWTtBQUFBLElBQ1osVUFBVTtBQUFBLE1BQ04sVUFBVTtBQUFBLE1BQ1YsVUFBVSxDQUFDLFFBQVEsUUFBUSxNQUFNO0FBQUEsTUFDakMsU0FBUztBQUFBLFFBQ0w7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDSjtBQUFBLElBQ0o7QUFBQSxFQUNKO0FBQUEsRUFDQSxTQUFTO0FBQUEsSUFDTCxZQUFZLENBQUMsZUFBZSxTQUFTO0FBQUEsRUFDekM7QUFDSixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
