import { BuilderOutput, createBuilder } from '@angular-devkit/architect'
import { ReplaySubject } from 'rxjs'

import { builderHandler, scheduleBuilder } from '../../../dist'

export default createBuilder(
  builderHandler('Building callbacks', [
    scheduleBuilder('Success with value', () => {
      return { success: true }
    }),
    scheduleBuilder('Success with promise', () => {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({ success: true })
        }, 0)
      })
    }),
    scheduleBuilder('Success with observable', () => {
      const dispatcher$ = new ReplaySubject<BuilderOutput>()
      setTimeout(() => {
        dispatcher$.next({ success: true })
        dispatcher$.complete()
      }, 0)
      return dispatcher$.asObservable()
    }),
  ])
)
