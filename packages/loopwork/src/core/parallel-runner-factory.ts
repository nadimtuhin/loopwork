import type { ParallelRunnerOptions } from './parallel-runner'
import { ParallelRunner } from './parallel-runner'

export interface IParallelRunnerFactory {
  create(options: ParallelRunnerOptions): ParallelRunner
}

export class ParallelRunnerFactory implements IParallelRunnerFactory {
  create(options: ParallelRunnerOptions): ParallelRunner {
    return new ParallelRunner(options)
  }
}
