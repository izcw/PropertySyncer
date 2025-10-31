import { nodeResolve } from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import { terser } from 'rollup-plugin-terser'

export default {
  input: 'src/index.js',
  output: [
    {
      file: 'dist/index.cjs.js',
      format: 'cjs',
      exports: 'named'
    },
    {
      file: 'dist/index.esm.js',
      format: 'esm',
      exports: 'named'
    }
  ],
  plugins: [
    nodeResolve(),
    commonjs(),
    terser({
      format: {
        comments: false
      }
    })
  ],
  external: ['vue']
}
