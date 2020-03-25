import { BuilderOutput, createBuilder } from '@angular-devkit/architect'
import { ReplaySubject } from 'rxjs'

import { builderHandler, scheduleBuilder } from '../../../dist'

export default createBuilder(
  builderHandler('Building callbacks', [
    scheduleBuilder('Fail with value', () => {
      return { success: false }
    }),
    scheduleBuilder('Fail with promise', () => {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({ success: false })
        }, 0)
      })
    }),
    scheduleBuilder('Fail with observable', () => {
      const dispatcher$ = new ReplaySubject<BuilderOutput>()
      setTimeout(() => {
        dispatcher$.next({ success: false })
        dispatcher$.complete()
      }, 0)
      return dispatcher$.asObservable()
    }),
  ])
)
