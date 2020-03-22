import { createBuilder } from '@angular-devkit/architect'

import { builderHandler, scheduleBuilder } from '../../../..'

export default createBuilder(builderHandler('Building', scheduleBuilder('@angular-devkit/builder:browser', 'Building')))
