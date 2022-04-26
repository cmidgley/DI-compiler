import * as TS from "typescript";
interface DiOptions {
    program: TS.Program;
    typescript?: typeof TS;
}
/**
 * CustomTransformer that associates constructor arguments with any given class declaration
 */
declare function di({ typescript, ...rest }: DiOptions): TS.CustomTransformers;
export { DiOptions, di };
