import { BuilderOutput, createBuilder } from '@angular-devkit/architect'
import { builderHandler, scheduleBuilder } from '@unitario/angular-devkit'
import { ReplaySubject } from 'rxjs'

const builder = builderHandler('Building callbacks', [
  scheduleBuilder('Success with value', () => {
    console.log('Callback called?')
    return { success: true }
  }),
  scheduleBuilder('Success with promise', () => {
    return new Promise((resolve) => {
      setTimeout(() => resolve({ success: true }), 20)
    })
  }),
  scheduleBuilder('Success with observable', () => {
    const dispatcher$ = new ReplaySubject<BuilderOutput>()
    dispatcher$.next({ success: true })
    setTimeout(() => dispatcher$.complete(), 20)
    return dispatcher$.asObservable()
  }),
])

export default createBuilder(builder)
