import typescript from '@rollup/plugin-typescript'
import resolve from '@rollup/plugin-node-resolve'

export default {
  input: 'src/index.ts',
  output: [
    {
      file: 'dist/index.cjs',
      format: 'cjs',
      sourcemap: true,
    },
    {
      file: 'dist/index.mjs',
      format: 'es',
      sourcemap: true,
    },
  ],
  plugins: [
    resolve(),
    typescript({
      tsconfig: './tsconfig.json',
      declaration: true,
      declarationDir: 'dist',
      rootDir: 'src',
    }),
  ],
  // `node:crypto` is used only by the server-side `verifyWebhookSignature`
  // helper. Keep it external so it stays a bare import in the npm bundle
  // (resolved by the consumer's Node runtime) and never gets inlined.
  external: ['node:crypto'],
}
