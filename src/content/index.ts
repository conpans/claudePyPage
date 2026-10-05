// The app's content: the YAML files under content/, read and checked at build time.

import data from 'virtual:stepwise-content'
import { Content } from './collection.ts'

export { Content } from './collection.ts'
export const content = new Content(data)
